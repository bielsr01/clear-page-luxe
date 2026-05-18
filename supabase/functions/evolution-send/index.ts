// Evolution API helper: verify connection or send a single message.
// Requires authenticated caller who manages the integration's restaurant
// (or master_admin). Credentials are loaded from DB — caller-supplied
// apiUrl/apiKey are ignored to prevent SSRF.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(p: string) {
  const d = (p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55")) return d;
  return "55" + d;
}

function sanitizeBase(apiUrl: string) {
  return (apiUrl || "").replace(/\/+$/, "").replace(/\/manager$/i, "");
}

async function evoFetch(apiUrl: string, path: string, apiKey: string, body?: any, method = "POST") {
  const url = sanitizeBase(apiUrl) + path;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Require authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, ""),
    );
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const uid = userData.user.id;
    const supabase = createClient(SUPABASE_URL, SERVICE);

    const { action, integrationId, phone, text, mediaUrl } = await req.json();
    if (!integrationId) throw new Error("integrationId é obrigatório");

    const { data: integration } = await supabase
      .from("evolution_integrations").select("*").eq("id", integrationId).maybeSingle();
    if (!integration) throw new Error("Integração não encontrada");

    // Authorization: master_admin OR manager of the integration's restaurant.
    // Admin integrations (is_admin=true, restaurant_id=null) require master_admin.
    const { data: adminRow } = await supabase
      .from("user_roles").select("role").eq("user_id", uid).eq("role", "master_admin").maybeSingle();
    const isAdmin = !!adminRow;
    if (!isAdmin) {
      if (!integration.restaurant_id) throw new Error("Sem permissão");
      const { data: ok } = await supabase.rpc("is_restaurant_manager", {
        _user_id: uid, _restaurant_id: integration.restaurant_id,
      });
      if (!ok) throw new Error("Sem permissão");
    }

    const ENV_URL = Deno.env.get("EVOLUTION_API_URL") || "";
    const ENV_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
    const cfg = {
      apiUrl: integration.api_url || ENV_URL,
      apiKey: integration.api_key || ENV_KEY,
      instance: integration.instance_name,
      instanceToken: integration.instance_token || null,
    };
    if (!cfg.apiUrl || !cfg.apiKey || !cfg.instance) throw new Error("Credenciais incompletas");

    const inst = encodeURIComponent(cfg.instance);
    if (action === "verify") {
      const r = await evoFetch(cfg.apiUrl, `/instance/connectionState/${inst}`, cfg.apiKey, undefined, "GET");
      await supabase.from("evolution_integrations").update({
        last_status: r.ok ? (r.data?.instance?.state || "ok") : `erro ${r.status}`,
        last_check_at: new Date().toISOString(),
      }).eq("id", integrationId);
      return new Response(JSON.stringify({ ok: r.ok, status: r.status, data: r.data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "send") {
      const number = normalizePhone(phone);
      if (!number) throw new Error("Telefone inválido");
      const sendKey = cfg.instanceToken || cfg.apiKey;
      let r;
      if (mediaUrl) {
        r = await evoFetch(cfg.apiUrl, `/message/sendMedia/${inst}`, sendKey, {
          number, mediatype: "image", media: mediaUrl, caption: text || "",
        });
      } else {
        r = await evoFetch(cfg.apiUrl, `/message/sendText/${inst}`, sendKey, {
          number, text: text || "",
        });
      }
      return new Response(JSON.stringify({ ok: r.ok, status: r.status, data: r.data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Ação desconhecida");
  } catch (e) {
    let msg = (e as Error).message || "Erro desconhecido";
    if (/CaUsedAsEndEntity|invalid peer certificate|UnknownIssuer|certificate/i.test(msg)) {
      msg = "Certificado TLS do servidor Evolution inválido. Verifique a URL da API. Detalhe: " + msg;
    }
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
