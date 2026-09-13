import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Link2, Save, Store } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BioRestaurantLink, BioSettings, defaultBioSettings, normalizeExternalUrl } from "@/lib/bio";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Restaurant = { id: string; name: string; slug: string };

export function AdminBioLinksPanel() {
  const [settings, setSettings] = useState<BioSettings>(defaultBioSettings);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [links, setLinks] = useState<Record<string, BioRestaurantLink>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [settingsResult, restaurantsResult, linksResult] = await Promise.all([
      (supabase as any).from("bio_settings").select("order_enabled,franchise_enabled,franchise_url,careers_enabled").eq("id", true).maybeSingle(),
      supabase.from("restaurants").select("id,name,slug").order("name"),
      (supabase as any).from("bio_restaurant_links").select("id,restaurant_id,enabled,custom_url"),
    ]);
    setLoading(false);
    const error = settingsResult.error || restaurantsResult.error || linksResult.error;
    if (error) return toast.error(error.message);
    setSettings(settingsResult.data ?? defaultBioSettings);
    setRestaurants(restaurantsResult.data ?? []);
    setLinks(Object.fromEntries(((linksResult.data ?? []) as BioRestaurantLink[]).map((link) => [link.restaurant_id, link])));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => restaurants.map((restaurant) => ({
    restaurant,
    link: links[restaurant.id] ?? { id: "", restaurant_id: restaurant.id, enabled: true, custom_url: null },
  })), [restaurants, links]);

  const updateLink = (restaurantId: string, patch: Partial<BioRestaurantLink>) => {
    setLinks((current) => ({
      ...current,
      [restaurantId]: { id: "", restaurant_id: restaurantId, enabled: true, custom_url: null, ...current[restaurantId], ...patch },
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      let franchiseUrl: string | null = null;
      if (settings.franchise_url) franchiseUrl = normalizeExternalUrl(settings.franchise_url);
      if (settings.franchise_enabled && !franchiseUrl) throw new Error("Informe o link do site institucional");

      const restaurantPayload = rows.map(({ restaurant, link }) => ({
        restaurant_id: restaurant.id,
        enabled: link.enabled,
        custom_url: link.custom_url ? normalizeExternalUrl(link.custom_url) : null,
      }));
      const { data: userData } = await supabase.auth.getUser();
      const [settingsResult, linksResult] = await Promise.all([
        (supabase as any).from("bio_settings").upsert({ id: true, ...settings, franchise_url: franchiseUrl, updated_by: userData.user?.id ?? null }),
        (supabase as any).from("bio_restaurant_links").upsert(restaurantPayload, { onConflict: "restaurant_id" }),
      ]);
      if (settingsResult.error) throw settingsResult.error;
      if (linksResult.error) throw linksResult.error;
      setSettings((current) => ({ ...current, franchise_url: franchiseUrl }));
      toast.success("Página de links atualizada");
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-12 text-center text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Escolha o que aparece na página pública da Coxinha Surprise.</p>
        <div className="flex gap-2">
          <Button asChild variant="outline"><a href="/bio" target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Abrir /bio</a></Button>
          <Button onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? "Salvando..." : "Salvar"}</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Link2 className="h-5 w-5" />Botões públicos</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between gap-4"><div><Label>Faça seu Pedido</Label><p className="text-xs text-muted-foreground">Exibe a lista de restaurantes.</p></div><Switch checked={settings.order_enabled} onCheckedChange={(value) => setSettings((current) => ({ ...current, order_enabled: value }))} /></div>
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between gap-4"><div><Label>Seja um franqueado</Label><p className="text-xs text-muted-foreground">Abre o site institucional.</p></div><Switch checked={settings.franchise_enabled} onCheckedChange={(value) => setSettings((current) => ({ ...current, franchise_enabled: value }))} /></div>
              <Input value={settings.franchise_url ?? ""} onChange={(event) => setSettings((current) => ({ ...current, franchise_url: event.target.value }))} placeholder="https://seusite.com.br/franquia" maxLength={500} />
            </div>
            <div className="flex items-center justify-between gap-4 border-t pt-4"><div><Label>Trabalhe conosco</Label><p className="text-xs text-muted-foreground">Abre o formulário de currículo.</p></div><Switch checked={settings.careers_enabled} onCheckedChange={(value) => setSettings((current) => ({ ...current, careers_enabled: value }))} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Store className="h-5 w-5" />Restaurantes em Faça seu Pedido</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {rows.map(({ restaurant, link }) => (
              <div key={restaurant.id} className="space-y-2 border-b pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between gap-3"><Label>{restaurant.name}</Label><Switch checked={link.enabled} onCheckedChange={(value) => updateLink(restaurant.id, { enabled: value })} /></div>
                <Input value={link.custom_url ?? ""} onChange={(event) => updateLink(restaurant.id, { custom_url: event.target.value || null })} placeholder={`${window.location.origin}/r/${restaurant.slug}`} maxLength={500} />
                <p className="text-xs text-muted-foreground">Deixe vazio para usar /r/{restaurant.slug}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}