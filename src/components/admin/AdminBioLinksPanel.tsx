import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Link2, Pencil, RotateCcw, Save, Store } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BioRestaurantLink, BioSettings, defaultBioSettings, normalizeExternalUrl } from "@/lib/bio";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [editingRestaurantId, setEditingRestaurantId] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState("");

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
    setLinks((current) => {
      const existing = current[restaurantId];
      return {
        ...current,
        [restaurantId]: existing
          ? { ...existing, ...patch }
          : { id: "", restaurant_id: restaurantId, enabled: patch.enabled ?? true, custom_url: patch.custom_url ?? null },
      };
    });
  };

  const editingRestaurant = restaurants.find((restaurant) => restaurant.id === editingRestaurantId);
  const defaultRestaurantUrl = editingRestaurant ? `/r/${editingRestaurant.slug}` : "";

  const openLinkEditor = (restaurant: Restaurant, link: BioRestaurantLink) => {
    setEditingRestaurantId(restaurant.id);
    setLinkDraft(link.custom_url ?? `/r/${restaurant.slug}`);
  };

  const closeLinkEditor = () => {
    setEditingRestaurantId(null);
    setLinkDraft("");
  };

  const saveLinkDraft = () => {
    if (!editingRestaurant) return;
    try {
      const trimmed = linkDraft.trim();
      const customUrl = !trimmed || trimmed === defaultRestaurantUrl
        ? null
        : trimmed.startsWith("/")
          ? trimmed
          : normalizeExternalUrl(trimmed);
      updateLink(editingRestaurant.id, { custom_url: customUrl });
      closeLinkEditor();
      toast.success("Link atualizado. Clique em Salvar para confirmar.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Informe um endereço válido");
    }
  };

  const resetLinkToDefault = () => {
    if (!editingRestaurant) return;
    updateLink(editingRestaurant.id, { custom_url: null });
    closeLinkEditor();
    toast.success("Link padrão restaurado. Clique em Salvar para confirmar.");
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
                <div className="flex min-w-0 items-center gap-2">
                  <div className="min-w-0 flex-1 rounded-md border bg-muted/40 px-3 py-2 text-sm text-foreground">
                    <span className="block truncate" title={link.custom_url ?? `/r/${restaurant.slug}`}>{link.custom_url ?? `/r/${restaurant.slug}`}</span>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => openLinkEditor(restaurant, link)}>
                    <Pencil className="mr-2 h-4 w-4" />Editar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(editingRestaurantId)} onOpenChange={(open) => { if (!open) closeLinkEditor(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar link de {editingRestaurant?.name}</DialogTitle>
            <DialogDescription>Informe o endereço que será aberto ao escolher este restaurante.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="restaurant-link">Link do restaurante</Label>
            <Input
              id="restaurant-link"
              value={linkDraft}
              onChange={(event) => setLinkDraft(event.target.value)}
              placeholder={defaultRestaurantUrl}
              maxLength={500}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
            <Button type="button" variant="outline" onClick={resetLinkToDefault}>
              <RotateCcw className="mr-2 h-4 w-4" />Restaurar padrão
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="ghost" onClick={closeLinkEditor}>Cancelar</Button>
              <Button type="button" onClick={saveLinkDraft}><Save className="mr-2 h-4 w-4" />Salvar link</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}