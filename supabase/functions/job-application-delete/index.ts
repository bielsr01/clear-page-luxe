import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { ensureR2Configured, r2Delete } from "../_shared/r2.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const BodySchema = z.object({ application_id: z.string().uuid() });
const respond = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Método não permitido" }, 405);

  try {
    ensureR2Configured();
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return respond({ error: "Não autorizado" }, 401);

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return respond({ error: "Candidatura inválida" }, 400);

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
    const { data: role, error: roleError } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "master_admin")
      .maybeSingle();
    if (roleError) throw roleError;
    if (!role) return respond({ error: "Sem permissão" }, 403);

    const { data: application, error: applicationError } = await admin
      .from("job_applications")
      .select("resume_key")
      .eq("id", parsed.data.application_id)
      .maybeSingle();
    if (applicationError) throw applicationError;
    if (!application) return respond({ error: "Candidatura não encontrada" }, 404);

    await r2Delete(application.resume_key);
    const { error: deleteError } = await admin
      .from("job_applications")
      .delete()
      .eq("id", parsed.data.application_id);
    if (deleteError) throw deleteError;

    return respond({ success: true }, 200);
  } catch (error) {
    console.error("job-application-delete", error instanceof Error ? error.message : "unknown");
    return respond({ error: "Não foi possível excluir o currículo" }, 500);
  }
});