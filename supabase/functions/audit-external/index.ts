import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { r2Put, ensureR2Configured } from "../_shared/r2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanRestName(name: string): string {
  if (!name) return name;
  if (/teste/i.test(name)) return name;
  return name.replace(/^\s*coxinha\s*surprise\s*[-–—]\s*/i, "").trim() || name;
}

async function loadLink(token: string) {
  const sb = admin();
  const { data: link } = await sb
    .from("audit_external_links")
    .select("id, restaurant_id, audit_month, token")
    .eq("token", token)
    .maybeSingle();
  return link as { id: string; restaurant_id: string; audit_month: string; token: string } | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const ct = req.headers.get("content-type") || "";
    const sb = admin();

    // Upload de foto (multipart) --------------------------------------------
    if (ct.includes("multipart/form-data")) {
      ensureR2Configured();
      const form = await req.formData();
      const token = String(form.get("token") || "");
      const groupId = String(form.get("group_id") || "");
      const file = form.get("file");
      if (!token || !groupId || !(file instanceof File)) {
        return json(400, { error: "Dados incompletos" });
      }
      const link = await loadLink(token);
      if (!link) return json(404, { error: "Link inválido" });
      if (file.size > 25 * 1024 * 1024) return json(400, { error: "Arquivo acima de 25MB" });

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const safe = `${groupId}-${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const key = `audit-photos/${link.restaurant_id}/${link.audit_month}/${safe}`;
      const buf = new Uint8Array(await file.arrayBuffer());
      const url = await r2Put(key, buf, file.type || "image/jpeg");
      return json(200, { url });
    }

    // JSON actions ----------------------------------------------------------
    const body = await req.json().catch(() => ({} as any));
    const action = String(body.action || "");
    const token = String(body.token || "");
    if (!action || !token) return json(400, { error: "Parâmetros ausentes" });

    const link = await loadLink(token);
    if (!link) return json(404, { error: "Link inválido" });

    if (action === "get_form") {
      const [{ data: rest }, { data: groups }, { data: existing }] = await Promise.all([
        sb.from("restaurants").select("id,name").eq("id", link.restaurant_id).maybeSingle(),
        sb.from("audit_groups").select("id,name,sort_order,is_active").eq("is_active", true).order("sort_order").order("created_at"),
        sb.from("audits").select("id").eq("restaurant_id", link.restaurant_id).eq("audit_month", link.audit_month).maybeSingle(),
      ]);
      return json(200, {
        restaurant: rest ? { id: rest.id, name: cleanRestName(rest.name) } : null,
        audit_month: link.audit_month,
        groups: groups ?? [],
        already_submitted: !!existing,
      });
    }

    if (action === "submit") {
      const auditorName = String(body.auditor_name || "").trim();
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!auditorName) return json(400, { error: "Informe seu nome" });
      if (rows.length === 0) return json(400, { error: "Nenhum grupo respondido" });
      for (const r of rows) {
        if (!r.group_id || !r.group_name || !r.photo_url || typeof r.score !== "number") {
          return json(400, { error: "Dados de grupo inválidos" });
        }
      }
      const avg = rows.reduce((s: number, r: any) => s + Number(r.score || 0), 0) / rows.length;

      const { data: audit, error: e1 } = await sb.from("audits").insert({
        restaurant_id: link.restaurant_id,
        audit_month: link.audit_month,
        avg_score: Number(avg.toFixed(2)),
        status: "completed",
        source: "external",
        auditor_name: auditorName,
      }).select("id").single();
      if (e1) return json(500, { error: e1.message });

      const scoreRows = rows.map((r: any) => ({
        audit_id: audit.id,
        group_id: r.group_id,
        group_name: r.group_name,
        score: Math.max(0, Math.min(100, Math.round(Number(r.score)))),
        notes: r.notes || null,
        photo_url: r.photo_url,
      }));
      const { error: e2 } = await sb.from("audit_scores").insert(scoreRows);
      if (e2) return json(500, { error: e2.message });

      return json(200, { ok: true, audit_id: audit.id });
    }

    return json(400, { error: "Ação inválida" });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
