import { supabase } from "@/integrations/supabase/client";

export type BioSettings = {
  order_enabled: boolean;
  franchise_enabled: boolean;
  franchise_url: string | null;
  careers_enabled: boolean;
};

export type BioRestaurantLink = {
  id: string;
  restaurant_id: string;
  enabled: boolean;
  custom_url: string | null;
};

export const defaultBioSettings: BioSettings = {
  order_enabled: true,
  franchise_enabled: true,
  franchise_url: null,
  careers_enabled: true,
};

export function normalizeExternalUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(candidate);
  if (!(["http:", "https:"] as string[]).includes(url.protocol)) throw new Error("Informe um endereço válido");
  return url.toString();
}

export async function getResumeUrl(applicationId: string, mode: "view" | "download") {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sessão expirada");
  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/job-application-download`;
  const query = new URLSearchParams({ application_id: applicationId, mode });
  const response = await fetch(`${endpoint}?${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.url) throw new Error(body?.error ?? "Não foi possível abrir o currículo");
  return body.url as string;
}

export async function deleteJobApplication(applicationId: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sessão expirada");

  const { data, error } = await supabase.functions.invoke("job-application-delete", {
    body: { application_id: applicationId },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) throw new Error(data?.error ?? "Não foi possível excluir o currículo");
  if (!data?.success) throw new Error(data?.error ?? "Não foi possível excluir o currículo");
}