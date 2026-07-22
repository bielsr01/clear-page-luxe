import { supabase } from "@/integrations/supabase/client";
import { uploadToR2 } from "@/lib/r2Upload";

export type DocType = "commercial" | "investor" | "franchisee" | "franchisor";

/**
 * Documentos são armazenados no Cloudflare R2 (não no Supabase Storage).
 * O campo `file_path` da tabela `documents` guarda a URL pública do R2.
 * Documentos antigos (pré-migração) podem ter um path relativo do bucket
 * `documents` do Supabase Storage — mantemos compatibilidade em leitura/deleção.
 */

const isR2Url = (p: string) => /^https?:\/\//i.test(p);

export async function uploadDocumentFile(
  docType: DocType,
  file: File,
  restaurantId?: string | null,
): Promise<{ path: string }> {
  const clean = file.name.replace(/[^\w.\-]+/g, "_");
  const prefix = docType === "franchisee" ? `documents/franchisee/${restaurantId || "unknown"}` : `documents/${docType}`;
  const filename = `${Date.now()}_${clean}`;
  const url = await uploadToR2(file, prefix, filename);
  return { path: url };
}

export async function getDocumentSignedUrl(path: string, seconds = 3600): Promise<string> {
  if (isR2Url(path)) return path;
  // Fallback para documentos legados no Supabase Storage
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteDocumentFile(path: string) {
  if (isR2Url(path)) {
    try {
      await supabase.functions.invoke("r2-delete", { body: { url: path } });
    } catch {
      /* silencioso — não bloqueia exclusão do registro */
    }
    return;
  }
  await supabase.storage.from("documents").remove([path]);
}

export async function sendDocumentViaWhatsApp(opts: {
  phone: string;
  filePath: string;
  fileName: string;
  caption?: string;
}) {
  const { data: adm, error: aErr } = await supabase
    .from("evolution_integrations")
    .select("id")
    .eq("is_admin", true)
    .maybeSingle();
  if (aErr) throw aErr;
  if (!adm?.id) throw new Error("Integração Evolution do admin não configurada.");
  const mediaUrl = await getDocumentSignedUrl(opts.filePath, 60 * 60 * 6);
  const { data, error } = await supabase.functions.invoke("evolution-send", {
    body: {
      action: "send",
      integrationId: adm.id,
      phone: opts.phone,
      text: opts.caption || "",
      mediaUrl,
      mediaType: "document",
      fileName: opts.fileName,
    },
  });
  if (error) throw error;
  if (data && (data as any).ok === false) throw new Error((data as any).error || "Falha ao enviar");
  return data;
}
