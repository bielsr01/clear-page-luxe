import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { ensureR2Configured, r2Put } from "../_shared/r2.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const allowedExtensions = new Set(["pdf", "doc", "docx", "jpg", "jpeg", "png", "webp"]);
const allowedMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const ApplicationSchema = z.object({
  full_name: z.string().trim().min(3).max(120),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sex: z.enum(["feminino", "masculino", "outro", "nao_informar"]),
  phone: z.string().trim().min(10).max(20).regex(/^[\d\s()+-]+$/),
  city: z.string().trim().min(2).max(100),
});

function response(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function hasValidSignature(bytes: Uint8Array, extension: string) {
  if (extension === "pdf") {
    const header = new TextDecoder().decode(bytes.slice(0, 8));
    const trailer = new TextDecoder().decode(bytes.slice(Math.max(0, bytes.length - 1024)));
    return bytes.length >= 100 && header.startsWith("%PDF-") && trailer.includes("%%EOF");
  }
  if (extension === "png") return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  if (extension === "jpg" || extension === "jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === "webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (extension === "docx") return bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (extension === "doc") return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  return false;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Método não permitido" }, 405);

  try {
    ensureR2Configured();
    const contentLength = Number(req.headers.get("content-length") ?? "0");
    if (contentLength > MAX_FILE_SIZE + 100_000) return response({ error: "O currículo deve ter no máximo 10 MB" }, 413);

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return response({ error: "Envio inválido" }, 400);
    }
    const parsed = ApplicationSchema.safeParse({
      full_name: String(form.get("full_name") ?? ""),
      birth_date: String(form.get("birth_date") ?? ""),
      sex: String(form.get("sex") ?? ""),
      phone: String(form.get("phone") ?? ""),
      city: String(form.get("city") ?? ""),
    });
    if (!parsed.success) return response({ error: "Revise os dados informados" }, 400);

    const birthDate = new Date(`${parsed.data.birth_date}T12:00:00Z`);
    const today = new Date();
    if (Number.isNaN(birthDate.getTime()) || birthDate >= today || birthDate.getUTCFullYear() < today.getUTCFullYear() - 100) {
      return response({ error: "Data de nascimento inválida" }, 400);
    }

    const file = form.get("resume");
    if (!(file instanceof File) || file.size === 0) return response({ error: "Anexe seu currículo" }, 400);
    if (file.size > MAX_FILE_SIZE) return response({ error: "O currículo deve ter no máximo 10 MB" }, 413);

    const extension = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(file.type)) {
      return response({ error: "Envie um arquivo PDF, Word, JPG, PNG ou WEBP" }, 400);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasValidSignature(bytes, extension)) return response({ error: "O conteúdo do arquivo não corresponde ao formato informado" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("Configuração do servidor indisponível");
    const admin = createClient(supabaseUrl, serviceKey);

    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("cf-connecting-ip") ?? "unknown";
    const ipHash = await sha256(`${forwarded}:${Deno.env.get("R2_ACCOUNT_ID") ?? "job"}`);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await admin
      .from("job_application_rate_limits")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    if (countError) throw countError;
    if ((count ?? 0) >= 5) return response({ error: "Muitos envios recentes. Tente novamente mais tarde" }, 429);

    const key = `job-applications/${crypto.randomUUID()}.${extension}`;
    await r2Put(key, bytes, file.type);

    const { error: insertError } = await admin.from("job_applications").insert({
      ...parsed.data,
      resume_key: key,
      resume_filename: file.name.slice(0, 180),
      resume_mime_type: file.type,
      resume_size_bytes: file.size,
    });
    if (insertError) throw insertError;
    await admin.from("job_application_rate_limits").insert({ ip_hash: ipHash });

    return response({ success: true }, 201);
  } catch (error) {
    console.error("job-application-submit", error instanceof Error ? error.message : "unknown");
    return response({ error: "Não foi possível enviar o currículo agora" }, 500);
  }
});