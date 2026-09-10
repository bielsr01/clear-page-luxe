import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { r2Put, ensureR2Configured } from "../_shared/r2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    ensureR2Configured();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const callerId = claimsData.claims.sub as string;

    const form = await req.formData();
    const file = form.get("file");
    const folder = String(form.get("folder") || "uploads").replace(/^\/+|\/+$/g, "");
    const filenameOverride = form.get("filename") ? String(form.get("filename")) : null;

    // ---- Validação de pasta (isolamento entre lojas) ----
    if (folder.includes("..")) {
      return new Response(JSON.stringify({ error: "Pasta inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(SUPABASE_URL, SERVICE);
    const { data: masterRow } = await adminClient
      .from("user_roles").select("role").eq("user_id", callerId).eq("role", "master_admin").maybeSingle();
    const isMaster = !!masterRow;

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const parts = folder.split("/").filter(Boolean);
    const root = parts[0] ?? "";

    const managesRestaurant = async (rid: string) => {
      const { data } = await adminClient.rpc("is_restaurant_manager", { _user_id: callerId, _restaurant_id: rid });
      return data === true;
    };

    let allowed = isMaster;
    if (!allowed) {
      if (root === "menu-images" && UUID_RE.test(parts[1] ?? "")) {
        allowed = await managesRestaurant(parts[1]);
      } else if (root === "menu-images" && parts[1] === "campaigns") {
        allowed = true;
      } else if (root === "expense-receipts" && parts[1] === "restaurant" && UUID_RE.test(parts[2] ?? "")) {
        allowed = await managesRestaurant(parts[2]);
      } else if ((root === "support-tickets" || root === "audit-photos") && UUID_RE.test(parts[1] ?? "")) {
        allowed = await managesRestaurant(parts[1]);
      }
    }
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Sem permissão para enviar arquivos nesta pasta" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: "Arquivo ausente (campo 'file')" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (file.size > 25 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Arquivo acima de 25MB" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ext = (filenameOverride?.split(".").pop() || file.name.split(".").pop() || "bin")
      .toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const base = filenameOverride || `${crypto.randomUUID()}.${ext}`;
    const safeBase = base.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${folder}/${safeBase}`;

    const buf = new Uint8Array(await file.arrayBuffer());
    const url = await r2Put(key, buf, file.type || "application/octet-stream");

    return new Response(JSON.stringify({ url, key }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
