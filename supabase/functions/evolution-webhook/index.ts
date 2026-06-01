import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function webhookToken(instanceName: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(instanceName));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function instanceNameFrom(payload: any) {
  return payload?.instance || payload?.instanceName || payload?.data?.instance || payload?.data?.instanceName || null;
}

function stateFrom(payload: any) {
  return payload?.data?.state || payload?.data?.connection || payload?.state || payload?.connection || payload?.status || null;
}

function qrFrom(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const cleaned = value.trim().replace(/\s/g, "");
  if (/^data:image\//i.test(cleaned)) return cleaned;
  if (cleaned.startsWith("iVBORw0KGgo")) return `data:image/png;base64,${cleaned}`;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const payload = await req.json().catch(() => ({}));
    const instanceName = instanceNameFrom(payload);
    if (!instanceName) throw new Error("Instância ausente");

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if ((new URL(req.url).searchParams.get("token") || "") !== await webhookToken(instanceName, serviceKey)) {
      throw new Error("Token inválido");
    }

    const state = stateFrom(payload);
    const qr = qrFrom(payload?.data?.qrcode?.base64 || payload?.data?.base64 || payload?.qrcode?.base64 || payload?.base64 || payload?.qrcode);
    const update: Record<string, unknown> = { last_check_at: new Date().toISOString() };
    if (state) update.last_status = state;
    if (qr) {
      update.qrcode = qr;
      update.last_status = "connecting";
    }
    if (state === "open") update.qrcode = null;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    await supabase.from("evolution_integrations").update(update).eq("instance_name", instanceName);

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});