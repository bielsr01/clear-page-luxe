import { supabase } from "@/integrations/supabase/client";

export type DocType = "commercial" | "investor" | "franchisee" | "franchisor";

export async function uploadDocumentFile(
  docType: DocType,
  file: File,
  restaurantId?: string | null,
): Promise<{ path: string }> {
  const clean = file.name.replace(/[^\w.\-]+/g, "_");
  const prefix = docType === "franchisee" ? `franchisee/${restaurantId || "unknown"}` : docType;
  const path = `${prefix}/${Date.now()}_${clean}`;
  const { error } = await supabase.storage.from("documents").upload(path, file, {
    upsert: false,
    contentType: file.type || "application/pdf",
  });
  if (error) throw error;
  return { path };
}

export async function getDocumentSignedUrl(path: string, seconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteDocumentFile(path: string) {
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
