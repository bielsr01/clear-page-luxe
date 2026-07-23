import { r2Client, R2_ENDPOINT, R2_BUCKET, ensureR2Configured } from "../_shared/r2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function extractKey(input: string): string {
  let s = input.trim();
  if (!s) return "";
  if (s.startsWith("http")) {
    try {
      const u = new URL(s);
      let p = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
      if (R2_BUCKET && p.startsWith(R2_BUCKET + "/")) p = p.slice(R2_BUCKET.length + 1);
      return p;
    } catch { return ""; }
  }
  return s.replace(/^\/+/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    ensureR2Configured();
    const url = new URL(req.url);
    const raw = url.searchParams.get("url") || url.searchParams.get("key") || "";
    const filename = url.searchParams.get("filename") || "download";
    const key = extractKey(raw);
    if (!key) {
      return new Response(JSON.stringify({ error: "Chave/URL inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const safe = filename.replace(/["\\]/g, "_");
    const disposition = `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
    const target = new URL(`${R2_ENDPOINT}/${R2_BUCKET}/${encodeKey(key)}`);
    target.searchParams.set("response-content-disposition", disposition);
    target.searchParams.set("X-Amz-Expires", "300");

    const signed = await r2Client.sign(target.toString(), {
      method: "GET",
      aws: { signQuery: true },
    });

    return new Response(JSON.stringify({ url: signed.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
