import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin, Plus, Search, Trash2, Pencil, Map as MapIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { findIbgeMunicipio, fetchIbgeBundle } from "@/lib/ibge";

declare global {
  interface Window {
    google: any;
    __gmapsLoading?: Promise<void>;
  }
}

type ExpansionCity = {
  id: string;
  city_name: string;
  state_uf: string | null;
  ibge_id: string | null;
  lat: number | null;
  lng: number | null;
  population: number | null;
  income_per_capita: number | null;
  
  restaurants_count: number | null;
  fastfoods_count: number | null;
  competitors_count: number | null;
  notes: string | null;
  created_at: string;
};

let cachedKey: string | null = null;
async function getGoogleApiKey(): Promise<string | null> {
  if (cachedKey) return cachedKey;
  try {
    const { data } = await supabase.functions.invoke("maps-key");
    const k = (data as any)?.apiKey as string | undefined;
    if (k) cachedKey = k;
    return k ?? null;
  } catch {
    return null;
  }
}

async function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window !== "undefined" && window.google?.maps?.Map) return;
  if (window.__gmapsLoading) return window.__gmapsLoading;
  const p = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&language=pt-BR&region=BR&v=weekly`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("gmaps load failed"));
    document.head.appendChild(s);
  });
  window.__gmapsLoading = p;
  return p;
}

const fmtInt = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("pt-BR").format(Math.round(n));
const fmtBRL = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);

type FormState = {
  city_name: string;
  state_uf: string;
  ibge_id: string;
  lat: number | null;
  lng: number | null;
  population: string;
  income_per_capita: string;
  restaurants_count: string;
  fastfoods_count: string;
  competitors_count: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  city_name: "",
  state_uf: "",
  ibge_id: "",
  lat: null,
  lng: null,
  population: "",
  income_per_capita: "",
  restaurants_count: "",
  fastfoods_count: "",
  competitors_count: "",
  notes: "",
});

export function AdminExpansionMapPanel() {
  const { toast } = useToast();
  const [cities, setCities] = useState<ExpansionCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detail, setDetail] = useState<ExpansionCity | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [autoLoading, setAutoLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allMapOpen, setAllMapOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("expansion_cities")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
      return;
    }
    setCities((data ?? []) as ExpansionCity[]);
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cities;
    return cities.filter(
      (c) =>
        c.city_name.toLowerCase().includes(q) ||
        (c.state_uf ?? "").toLowerCase().includes(q),
    );
  }, [cities, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (c: ExpansionCity) => {
    setEditingId(c.id);
    setDetail(null);
    setForm({
      city_name: c.city_name,
      state_uf: c.state_uf ?? "",
      ibge_id: c.ibge_id ?? "",
      lat: c.lat,
      lng: c.lng,
      population: c.population != null ? String(c.population) : "",
      income_per_capita: c.income_per_capita != null ? String(c.income_per_capita) : "",
      restaurants_count: c.restaurants_count != null ? String(c.restaurants_count) : "",
      fastfoods_count: c.fastfoods_count != null ? String(c.fastfoods_count) : "",
      competitors_count: c.competitors_count != null ? String(c.competitors_count) : "",
      notes: c.notes ?? "",
    });
    setDialogOpen(true);
  };

  const runIbge = useCallback(
    async (cityName: string, uf: string) => {
      if (!cityName) return;
      setAutoLoading(true);
      try {
        const muni = await findIbgeMunicipio(cityName, uf || undefined);
        if (!muni) {
          toast({
            title: "Município não encontrado no IBGE",
            description: "Preencha os dados manualmente.",
          });
          setAutoLoading(false);
          return;
        }
        const bundle = await fetchIbgeBundle(muni.id);
        setForm((f) => ({
          ...f,
          ibge_id: muni.id,
          state_uf: f.state_uf || muni.uf,
          population: bundle.population != null ? String(bundle.population) : f.population,
          income_per_capita:
            bundle.incomePerCapita != null ? String(bundle.incomePerCapita) : f.income_per_capita,
        }));
        toast({ title: "Dados do IBGE carregados" });
      } finally {
        setAutoLoading(false);
      }
    },
    [toast],
  );

  const save = async () => {
    if (!form.city_name.trim()) {
      toast({ title: "Informe a cidade", variant: "destructive" });
      return;
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const payload: any = {
      city_name: form.city_name.trim(),
      state_uf: form.state_uf.trim() || null,
      ibge_id: form.ibge_id || null,
      lat: form.lat,
      lng: form.lng,
      population: form.population ? Number(form.population) : null,
      income_per_capita: form.income_per_capita ? Number(form.income_per_capita) : null,
      restaurants_count: form.restaurants_count ? Number(form.restaurants_count) : 0,
      fastfoods_count: form.fastfoods_count ? Number(form.fastfoods_count) : 0,
      competitors_count: form.competitors_count ? Number(form.competitors_count) : 0,
      notes: form.notes || null,
    };
    let error;
    if (editingId) {
      ({ error } = await (supabase as any)
        .from("expansion_cities")
        .update(payload)
        .eq("id", editingId));
    } else {
      payload.created_by = user?.id ?? null;
      ({ error } = await (supabase as any).from("expansion_cities").insert(payload));
    }
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "Cidade atualizada" : "Cidade salva" });
    setDialogOpen(false);
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta cidade do mapa de expansão?")) return;
    const { error } = await (supabase as any).from("expansion_cities").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    setDetail(null);
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar cidade ou UF"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> Nova cidade
        </Button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma cidade cadastrada ainda. Clique em <b>Nova cidade</b> para começar.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <Card
              key={c.id}
              onClick={() => setDetail(c)}
              className="cursor-pointer hover:border-primary transition"
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  {c.city_name}
                  {c.state_uf && (
                    <span className="text-xs text-muted-foreground font-normal">/ {c.state_uf}</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground grid grid-cols-2 gap-y-1">
                <span>Habitantes</span>
                <span className="text-foreground text-right font-medium">{fmtInt(c.population)}</span>
                <span>Salário médio</span>
                <span className="text-foreground text-right font-medium">
                  {fmtBRL(c.income_per_capita)}
                </span>
                <span>Restaurantes</span>
                <span className="text-foreground text-right font-medium">
                  {fmtInt(c.restaurants_count)}
                </span>
                <span>Fast-foods</span>
                <span className="text-foreground text-right font-medium">
                  {fmtInt(c.fastfoods_count)}
                </span>
                <span>Concorrentes</span>
                <span className="text-foreground text-right font-medium">
                  {fmtInt(c.competitors_count)}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CityFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        onSave={save}
        onIbge={runIbge}
        autoLoading={autoLoading}
        saving={saving}
        editing={!!editingId}
      />

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  {detail.city_name}
                  {detail.state_uf && (
                    <span className="text-sm text-muted-foreground font-normal">
                      / {detail.state_uf}
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {detail.ibge_id ? `IBGE ${detail.ibge_id}` : "Sem código IBGE"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <span className="text-muted-foreground">Habitantes (IBGE)</span>
                <span className="text-right font-medium">{fmtInt(detail.population)}</span>
                <span className="text-muted-foreground">Salário médio mensal (IBGE)</span>
                <span className="text-right font-medium">{fmtBRL(detail.income_per_capita)}</span>
                <span className="text-muted-foreground">Restaurantes</span>
                <span className="text-right font-medium">{fmtInt(detail.restaurants_count)}</span>
                <span className="text-muted-foreground">Fast-foods</span>
                <span className="text-right font-medium">{fmtInt(detail.fastfoods_count)}</span>
                <span className="text-muted-foreground">Concorrentes diretos</span>
                <span className="text-right font-medium">{fmtInt(detail.competitors_count)}</span>
              </div>
              {detail.notes && (
                <div className="text-sm">
                  <div className="text-muted-foreground mb-1">Observações</div>
                  <div className="whitespace-pre-wrap">{detail.notes}</div>
                </div>
              )}
              <DialogFooter className="gap-2">
                <Button variant="destructive" onClick={() => remove(detail.id)} className="gap-2">
                  <Trash2 className="w-4 h-4" /> Excluir
                </Button>
                <Button onClick={() => openEdit(detail)} className="gap-2">
                  <Pencil className="w-4 h-4" /> Editar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CityFormDialog({
  open,
  onOpenChange,
  form,
  setForm,
  onSave,
  onIbge,
  autoLoading,
  saving,
  editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onSave: () => void;
  onIbge: (city: string, uf: string) => Promise<void>;
  autoLoading: boolean;
  saving: boolean;
  editing: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [currentLabel, setCurrentLabel] = useState<string>("");

  // Reverse geocode helper via existing edge function
  const reverse = useCallback(async (lat: number, lng: number) => {
    try {
      const { data } = await supabase.functions.invoke("geocode", { body: { lat, lng } });
      const city = (data as any)?.city as string | undefined;
      const state = (data as any)?.state as string | undefined;
      if (city) {
        setCurrentLabel(`${city}${state ? ` / ${state}` : ""}`);
        setForm((f) => ({ ...f, city_name: city, state_uf: state ?? f.state_uf, lat, lng }));
      } else {
        setForm((f) => ({ ...f, lat, lng }));
      }
    } catch {
      setForm((f) => ({ ...f, lat, lng }));
    }
  }, [setForm]);

  // Init map when dialog opens
  useEffect(() => {
    if (!open) {
      mapRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      setMapLoading(true);
      const key = await getGoogleApiKey();
      if (!key || cancelled) {
        setMapLoading(false);
        return;
      }
      try {
        await loadGoogleMaps(key);
      } catch {
        setMapLoading(false);
        return;
      }
      // wait container
      let tries = 0;
      while (!cancelled && (!containerRef.current || containerRef.current.clientWidth === 0) && tries < 40) {
        await new Promise((r) => setTimeout(r, 50));
        tries++;
      }
      if (cancelled || !containerRef.current) {
        setMapLoading(false);
        return;
      }
      const google = window.google;
      const center =
        form.lat != null && form.lng != null
          ? { lat: form.lat, lng: form.lng }
          : { lat: -14.235, lng: -51.9253 };
      const map = new google.maps.Map(containerRef.current, {
        center,
        zoom: form.lat != null ? 12 : 4,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
      });
      mapRef.current = { map };

      let idleTimer: number | undefined;
      let userInteracted = false;
      map.addListener("dragstart", () => {
        userInteracted = true;
      });
      map.addListener("zoom_changed", () => {
        userInteracted = true;
      });
      map.addListener("idle", () => {
        if (!userInteracted) return;
        window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => {
          const c = map.getCenter();
          if (!c) return;
          void reverse(c.lat(), c.lng());
        }, 400);
      });

      if (form.city_name) setCurrentLabel(`${form.city_name}${form.state_uf ? ` / ${form.state_uf}` : ""}`);
      setMapLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const searchCity = async () => {
    const q = form.city_name.trim();
    if (!q) return;
    // Geocode via edge function
    const { data } = await supabase.functions.invoke("geocode", {
      body: { city: q, state: form.state_uf || undefined },
    });
    const lat = (data as any)?.lat as number | undefined;
    const lng = (data as any)?.lng as number | undefined;
    const city = ((data as any)?.city as string | undefined) ?? q;
    const state = ((data as any)?.state as string | undefined) ?? form.state_uf;
    if (lat != null && lng != null && mapRef.current?.map) {
      mapRef.current.map.setCenter({ lat, lng });
      mapRef.current.map.setZoom(12);
      setForm((f) => ({ ...f, lat, lng, city_name: city, state_uf: state || f.state_uf }));
      setCurrentLabel(`${city}${state ? ` / ${state}` : ""}`);
    }
    await onIbge(city, state || "");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar cidade" : "Nova cidade"}</DialogTitle>
          <DialogDescription>
            Busque a cidade, arraste o mapa para ajustar e complete os campos.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr,90px,auto] gap-2">
            <Input
              placeholder="Cidade"
              value={form.city_name}
              onChange={(e) => setForm((f) => ({ ...f, city_name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void searchCity();
                }
              }}
            />
            <Input
              placeholder="UF"
              maxLength={2}
              value={form.state_uf}
              onChange={(e) => setForm((f) => ({ ...f, state_uf: e.target.value.toUpperCase() }))}
            />
            <Button type="button" onClick={searchCity} disabled={autoLoading} className="gap-2">
              {autoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Buscar
            </Button>
          </div>

          <div className="relative rounded-md overflow-hidden border h-[300px] bg-muted">
            {mapLoading && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-background/50">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            )}
            <div ref={containerRef} className="absolute inset-0" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full z-20">
              <MapPin className="w-8 h-8 text-primary drop-shadow" />
            </div>
            {currentLabel && (
              <div className="absolute top-2 left-2 z-20 bg-background/90 border rounded px-2 py-1 text-xs font-medium">
                {currentLabel}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Habitantes</Label>
              <Input
                type="number"
                value={form.population}
                onChange={(e) => setForm((f) => ({ ...f, population: e.target.value }))}
              />
            </div>
            <div>
              <Label>Salário médio mensal (R$)</Label>
              <Input
                type="number"
                value={form.income_per_capita}
                onChange={(e) => setForm((f) => ({ ...f, income_per_capita: e.target.value }))}
              />
            </div>
            <div>
              <Label>Qtd. restaurantes</Label>
              <Input
                type="number"
                value={form.restaurants_count}
                onChange={(e) => setForm((f) => ({ ...f, restaurants_count: e.target.value }))}
              />
            </div>
            <div>
              <Label>Qtd. fast-foods</Label>
              <Input
                type="number"
                value={form.fastfoods_count}
                onChange={(e) => setForm((f) => ({ ...f, fastfoods_count: e.target.value }))}
              />
            </div>
            <div>
              <Label>Concorrentes diretos</Label>
              <Input
                type="number"
                value={form.competitors_count}
                onChange={(e) => setForm((f) => ({ ...f, competitors_count: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {editing ? "Salvar alterações" : "Salvar cidade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
