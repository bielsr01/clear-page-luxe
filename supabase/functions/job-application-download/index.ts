import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { ensureR2Configured, r2Client, R2_BUCKET, R2_ENDPOINT } from "../_shared/r2.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const respond = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });
const encodeKey = (key: string) => key.split("/").map(encodeURIComponent).join("/");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return respond({ error: "Método não permitido" }, 405);

  try {
    ensureR2Configured();
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return respond({ error: "Não autorizado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Configuração do servidor indisponível");

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.slice(7);
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    if (claimsError || typeof userId !== "string") return respond({ error: "Não autorizado" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: role } = await admin.from("user_roles").select("id").eq("user_id", userId).eq("role", "master_admin").maybeSingle();
    if (!role) return respond({ error: "Sem permissão" }, 403);

    const url = new URL(req.url);
    const applicationId = url.searchParams.get("application_id") ?? "";
    const mode = url.searchParams.get("mode") === "view" ? "inline" : "attachment";
    if (!UUID_RE.test(applicationId)) return respond({ error: "Candidatura inválida" }, 400);

    const { data: application, error } = await admin
      .from("job_applications")
      .select("resume_key,resume_filename")
      .eq("id", applicationId)
      .maybeSingle();
    if (error || !application) return respond({ error: "Candidatura não encontrada" }, 404);

    const safeFilename = String(application.resume_filename).replace(/["\\\r\n]/g, "_");
    const disposition = `${mode}; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`;
    const target = new URL(`${R2_ENDPOINT}/${R2_BUCKET}/${encodeKey(application.resume_key)}`);
    target.searchParams.set("response-content-disposition", disposition);
    target.searchParams.set("X-Amz-Expires", "120");
    const signed = await r2Client.sign(target.toString(), { method: "GET", aws: { signQuery: true } });
    return respond({ url: signed.url }, 200);
  } catch (error) {
    console.error("job-application-download", error instanceof Error ? error.message : "unknown");
    return respond({ error: "Não foi possível abrir o currículo" }, 500);
  }
});