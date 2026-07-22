import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { r2Delete, R2_PUBLIC_BASE_URL, R2_BUCKET, ensureR2Configured } from "../_shared/r2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function extractKey(input: string): string {
  let s = input.trim();
  if (!s) return "";
  if (s.startsWith("http")) {
    try {
      const u = new URL(s);
      // strip leading slash
      let p = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
      // strip bucket prefix if present
      if (R2_BUCKET && p.startsWith(R2_BUCKET + "/")) p = p.slice(R2_BUCKET.length + 1);
      return p;
    } catch {
      return "";
    }
  }
  return s.replace(/^\/+/, "");
}

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

    const body = await req.json().catch(() => ({} as any));
    const raw = String(body.key || body.url || "");
    const key = extractKey(raw);
    if (!key) {
      return new Response(JSON.stringify({ error: "Chave/URL inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    await r2Delete(key);
    return new Response(JSON.stringify({ ok: true, key }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
