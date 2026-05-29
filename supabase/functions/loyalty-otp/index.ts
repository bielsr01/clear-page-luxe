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

async function evoFetch(apiUrl: string, path: string, apiKey: string, body?: any) {
  const url = apiUrl.replace(/\/+$/, "") + path;
  const res = await fetch(url, {
    method: "POST",
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
    const { action, restaurantId, phone, type, memberId, rewardId } = await req.json();
    
    if (action !== "send") throw new Error("Ação inválida");
    if (!restaurantId || !phone) throw new Error("Parâmetros ausentes");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1) Verify loyalty is enabled for this restaurant
    const { data: settings } = await supabase
      .from("loyalty_settings")
      .select("enabled")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    
    if (!settings?.enabled) throw new Error("Programa de fidelidade não ativo");

    let rpcName = "create_loyalty_consultation_code";
    let rpcParams: any = { _restaurant_id: restaurantId, _phone: phone };

    if (type === "redeem") {
      if (!memberId || !rewardId) throw new Error("Parâmetros para resgate ausentes");
      rpcName = "create_loyalty_redeem_code";
      rpcParams = { _restaurant_id: restaurantId, _member_id: memberId, _reward_id: rewardId };
    }

    // 2) Generate code
    const { data: codeData, error: rpcErr } = await supabase.rpc(rpcName, rpcParams);
    if (rpcErr) throw rpcErr;

    // The RPCs might return different things. 
    // create_loyalty_consultation_code returns UUID (code_id)
    // create_loyalty_redeem_code returns a setof loyalty_redeem_codes row
    
    let codeId, codeText, targetPhone;
    
    if (type === "redeem") {
      const row = Array.isArray(codeData) ? codeData[0] : codeData;
      codeId = row.id;
      codeText = row.code;
      targetPhone = row.phone;
    } else {
      // For consultation, the RPC I wrote returns UUID. 
      // I need to fetch the code text.
      codeId = codeData;
      const { data: codeRow } = await supabase
        .from("loyalty_redeem_codes")
        .select("code, phone")
        .eq("id", codeId)
        .single();
      codeText = codeRow.code;
      targetPhone = codeRow.phone;
    }

    // 3) Get Evolution Integration
    const { data: integration } = await supabase
      .from("evolution_integrations")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    
    if (!integration) throw new Error("Integração WhatsApp não encontrada");

    const apiUrl = integration.api_url || Deno.env.get("EVOLUTION_API_URL") || "";
    const apiKey = integration.api_key || Deno.env.get("EVOLUTION_API_KEY") || "";
    const instance = integration.instance_name;
    const sendKey = integration.instance_token || apiKey;

    if (!apiUrl || !apiKey || !instance) throw new Error("Configuração Evolution incompleta");

    // 4) Send message
    const number = normalizePhone(targetPhone);
    const text = type === "redeem" 
      ? `Seu codigo de confirmação de resgate é ${codeText}`
      : `Seu codigo de acesso ao programa de fidelidade é ${codeText}`;

    const r = await evoFetch(apiUrl, `/message/sendText/${encodeURIComponent(instance)}`, sendKey, {
      number, text
    });

    if (!r.ok) {
      console.error("Evolution Error:", r.data);
      throw new Error(r.data?.error || "Falha ao enviar WhatsApp");
    }

    return new Response(JSON.stringify({ ok: true, codeId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});