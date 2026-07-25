import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, MessageCircle, CalendarDays, BellRing, BellOff, Check } from "lucide-react";
import { toast } from "sonner";
import { isRowPending, nextOccurrence, type PromoCalendarRow } from "@/hooks/usePromoCalendarPendingCount";

type Restaurant = { id: string; name: string; phone: string | null; whatsapp_url: string | null };

const emptyForm = {
  restaurant_ids: [] as string[], // [] = none; ["__all__"] = todos (null)
  name: "",
  event_date: "",
  message: "",
  reminder_enabled: true,
  reminder_days_before: "3",
  is_recurring: true,
};

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

const SENT_STORAGE_KEY = "promo-calendar-sent-v1";

function loadSentIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SENT_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function buildWhatsApp(phone: string | null | undefined, whatsapp_url?: string | null) {

  if (whatsapp_url && whatsapp_url.trim()) return whatsapp_url;
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (!d) return null;
  if (d.length <= 11) d = "55" + d;
  return `https://wa.me/${d}`;
}

export function AdminPromoCalendarPanel() {
  const [rows, setRows] = useState<PromoCalendarRow[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRestaurant, setFilterRestaurant] = useState<string>("__all__");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PromoCalendarRow | null>(null);
  const [notifyTarget, setNotifyTarget] = useState<{ row: PromoCalendarRow } | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(() => loadSentIds());
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    const [{ data: r }, { data: rest }] = await Promise.all([
      supabase.from("promo_calendar_dates").select("*"),
      supabase.from("restaurants").select("id,name,phone,whatsapp_url").order("name"),
    ]);
    setRows((r ?? []) as PromoCalendarRow[]);
    setRestaurants((rest ?? []) as Restaurant[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("promo-calendar-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "promo_calendar_dates" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const restById = useMemo(() => Object.fromEntries(restaurants.map((r) => [r.id, r])), [restaurants]);

  const filtered = useMemo(() => {
    const list = filterRestaurant === "__all__"
      ? rows
      : rows.filter((r) => r.restaurant_id === filterRestaurant || r.restaurant_id === null);
    return [...list].sort((a, b) => {
      const na = nextOccurrence(a).date.getTime();
      const nb = nextOccurrence(b).date.getTime();
      return na - nb;
    });
  }, [rows, filterRestaurant]);

  const pendingCount = useMemo(() => filtered.filter((r) => isRowPending(r)).length, [filtered]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, restaurant_ids: [] });
    setDialogOpen(true);
  };

  const openEdit = (row: PromoCalendarRow) => {
    setEditing(row);
    setForm({
      restaurant_ids: [row.restaurant_id ?? "__all__"],
      name: row.name,
      event_date: row.event_date,
      message: row.message,
      reminder_enabled: row.reminder_days_before != null,
      reminder_days_before: String(row.reminder_days_before ?? 3),
      is_recurring: row.is_recurring,
    });
    setDialogOpen(true);
  };

  const toggleFormRestaurant = (id: string) => {
    setForm((f) => {
      if (id === "__all__") return { ...f, restaurant_ids: f.restaurant_ids.includes("__all__") ? [] : ["__all__"] };
      const withoutAll = f.restaurant_ids.filter((x) => x !== "__all__");
      const next = withoutAll.includes(id) ? withoutAll.filter((x) => x !== id) : [...withoutAll, id];
      return { ...f, restaurant_ids: next };
    });
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Informe o nome da data");
    if (!form.event_date) return toast.error("Informe a data");
    if (form.restaurant_ids.length === 0) return toast.error("Selecione ao menos um restaurante");
    const base = {
      name: form.name.trim(),
      event_date: form.event_date,
      message: form.message,
      reminder_days_before: form.reminder_enabled ? Math.max(0, parseInt(form.reminder_days_before || "0", 10)) : null,
      is_recurring: form.is_recurring,
    };
    if (editing) {
      const rid = form.restaurant_ids[0];
      const { error } = await supabase
        .from("promo_calendar_dates")
        .update({ ...base, restaurant_id: rid === "__all__" ? null : rid })
        .eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Data atualizada");
    } else {
      const { data: u } = await supabase.auth.getUser();
      const targets = form.restaurant_ids.includes("__all__") ? [null] : form.restaurant_ids;
      const payload = targets.map((rid) => ({ ...base, restaurant_id: rid, created_by: u.user?.id ?? null }));
      const { error } = await supabase.from("promo_calendar_dates").insert(payload);
      if (error) return toast.error(error.message);
      toast.success(targets.length > 1 ? `${targets.length} datas cadastradas` : "Data cadastrada");
    }
    setDialogOpen(false);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("promo_calendar_dates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Data removida");
    load();
  };

  const dismiss = async (row: PromoCalendarRow) => {
    const year = nextOccurrence(row).year;
    const { error } = await supabase.from("promo_calendar_dates").update({ dismissed_for_year: year }).eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Lembrete marcado como visto");
    load();
  };

  const undismiss = async (row: PromoCalendarRow) => {
    const { error } = await supabase.from("promo_calendar_dates").update({ dismissed_for_year: null }).eq("id", row.id);
    if (error) return toast.error(error.message);
    load();
  };

  const openNotify = (row: PromoCalendarRow) => { setNotifyTarget({ row }); };

  const notifyTargets = useMemo(() => {
    if (!notifyTarget) return [] as Restaurant[];
    const row = notifyTarget.row;
    if (row.restaurant_id) {
      const r = restById[row.restaurant_id];
      return r ? [r] : [];
    }
    return restaurants;
  }, [notifyTarget, restaurants, restById]);

  const sentKey = (row: PromoCalendarRow, restaurantId: string) =>
    `${row.id}:${nextOccurrence(row).year}:${restaurantId}`;

  const markSent = (row: PromoCalendarRow, restaurantId: string) => {
    setSentIds((prev) => {
      const next = new Set(prev);
      next.add(sentKey(row, restaurantId));
      try { localStorage.setItem(SENT_STORAGE_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const rowFullySent = (row: PromoCalendarRow) => {
    const targets = row.restaurant_id
      ? (restById[row.restaurant_id] ? [restById[row.restaurant_id]] : [])
      : restaurants;
    const withPhone = targets.filter((r) => !!buildWhatsApp(r.phone, r.whatsapp_url));
    if (withPhone.length === 0) return false;
    return withPhone.every((r) => sentIds.has(sentKey(row, r.id)));
  };


  const buildMessage = (row: PromoCalendarRow, r: Restaurant) => {
    const occ = nextOccurrence(row).date;
    const occStr = occ.toLocaleDateString("pt-BR");
    const base = row.message?.trim()
      ? row.message
      : `Olá! Lembrete: *${row.name}* está chegando em ${occStr}. Prepare a comunicação da loja!`;
    return base
      .replace(/\{nome\}/g, row.name)
      .replace(/\{data\}/g, occStr)
      .replace(/\{restaurante\}/g, r.name);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5" />
          <h2 className="text-xl font-semibold">Calendário Promocional</h2>
          {pendingCount > 0 && (
            <Badge variant="destructive" className="animate-pulse">{pendingCount} pendente{pendingCount > 1 ? "s" : ""}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterRestaurant} onValueChange={setFilterRestaurant}>
            <SelectTrigger className="w-[240px]"><SelectValue placeholder="Filtrar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os restaurantes</SelectItem>
              {restaurants.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Nova data</Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhuma data cadastrada.</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((row) => {
            const pending = isRowPending(row);
            const occ = nextOccurrence(row);
            const daysUntil = Math.ceil((occ.date.getTime() - new Date(new Date().toDateString()).getTime()) / (1000 * 60 * 60 * 24));
            const scope = row.restaurant_id ? (restById[row.restaurant_id]?.name ?? "—") : "Todos os restaurantes";
            return (
              <Card key={row.id} className={pending ? "border-destructive shadow-md" : ""}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold break-words">{row.name}</h3>
                        {row.is_recurring && <Badge variant="outline" className="text-[10px]">Anual</Badge>}
                        {pending && <Badge variant="destructive" className="animate-pulse">Pendente</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{scope}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(row)}><Pencil className="w-4 h-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover data?</AlertDialogTitle>
                            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(row.id)}>Remover</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  <div className="text-sm flex flex-wrap gap-3">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{fmtDate(row.event_date)}{row.is_recurring ? "" : `/${row.event_date.slice(0, 4)}`}</span>
                    <span className="text-muted-foreground">
                      {daysUntil === 0 ? "Hoje!" : daysUntil > 0 ? `em ${daysUntil} dia${daysUntil > 1 ? "s" : ""}` : ""}
                    </span>
                    {row.reminder_days_before != null && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground"><BellRing className="w-3.5 h-3.5" />{row.reminder_days_before}d antes</span>
                    )}
                  </div>

                  {row.message && (
                    <p className="text-sm whitespace-pre-wrap bg-muted/40 rounded p-2">{row.message}</p>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" onClick={() => openNotify(row)}>
                      <MessageCircle className="w-4 h-4 mr-2" />Avisar restaurante{row.restaurant_id ? "" : "s"} no WhatsApp
                    </Button>
                    {pending && (
                      <Button size="sm" variant="outline" onClick={() => dismiss(row)}>
                        <Check className="w-4 h-4 mr-2" />Marcar como visto
                      </Button>
                    )}
                    {!pending && row.dismissed_for_year === occ.year && row.reminder_days_before != null && (
                      <Button size="sm" variant="ghost" onClick={() => undismiss(row)}>
                        <BellOff className="w-4 h-4 mr-2" />Reativar lembrete
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar data" : "Nova data comemorativa"}</DialogTitle>
            <DialogDescription>Cadastre datas do calendário promocional e configure lembretes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Restaurante{editing ? "" : "s"}</Label>
              {editing ? (
                <Select
                  value={form.restaurant_ids[0] ?? "__all__"}
                  onValueChange={(v) => setForm((f) => ({ ...f, restaurant_ids: [v] }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os restaurantes</SelectItem>
                    {restaurants.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="border rounded-md p-2 max-h-56 overflow-y-auto space-y-1">
                  <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={form.restaurant_ids.includes("__all__")}
                      onChange={() => toggleFormRestaurant("__all__")}
                    />
                    <span>Todos os restaurantes</span>
                  </label>
                  <div className="border-t my-1" />
                  {restaurants.map((r) => {
                    const allChecked = form.restaurant_ids.includes("__all__");
                    const checked = allChecked || form.restaurant_ids.includes(r.id);
                    return (
                      <label key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={allChecked}
                          onChange={() => toggleFormRestaurant(r.id)}
                        />
                        <span>{r.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {!editing && form.restaurant_ids.length > 0 && !form.restaurant_ids.includes("__all__") && (
                <p className="text-xs text-muted-foreground">{form.restaurant_ids.length} restaurante{form.restaurant_ids.length > 1 ? "s" : ""} selecionado{form.restaurant_ids.length > 1 ? "s" : ""} · será criada uma data para cada.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Nome da data</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: Dia das Mães" />
              </div>
              <div className="space-y-1">
                <Label>Data</Label>
                <Input type="date" value={form.event_date} onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))} />
              </div>
              <div className="space-y-1 flex flex-col justify-end">
                <div className="flex items-center justify-between border rounded-md px-3 py-2">
                  <Label className="mb-0 text-sm">Repetir todo ano</Label>
                  <Switch checked={form.is_recurring} onCheckedChange={(v) => setForm((f) => ({ ...f, is_recurring: v }))} />
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Mensagem</Label>
              <Textarea rows={4} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} placeholder="Escreva a mensagem que será enviada para o restaurante. Você pode usar {nome}, {data} e {restaurante}." />
            </div>
            <div className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="mb-0">Lembrete antes da data</Label>
                <Switch checked={form.reminder_enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, reminder_enabled: v }))} />
              </div>
              {form.reminder_enabled && (
                <div className="flex items-center gap-2">
                  <Input type="number" min={0} className="w-24" value={form.reminder_days_before} onChange={(e) => setForm((f) => ({ ...f, reminder_days_before: e.target.value }))} />
                  <span className="text-sm text-muted-foreground">dias antes</span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? "Salvar" : "Cadastrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!notifyTarget} onOpenChange={(o) => !o && setNotifyTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Avisar via WhatsApp</DialogTitle>
            <DialogDescription>Selecione um restaurante para abrir o WhatsApp com a mensagem pronta.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[420px] overflow-y-auto space-y-2">
            {notifyTargets.length === 0 && <p className="text-sm text-muted-foreground">Nenhum restaurante disponível.</p>}
            {notifyTargets.map((r) => {
              const link = buildWhatsApp(r.phone, r.whatsapp_url);
              const msg = notifyTarget ? buildMessage(notifyTarget.row, r) : "";
              const href = link ? `${link}?text=${encodeURIComponent(msg)}` : null;
              const sent = sentIds.has(r.id);
              return (
                <div key={r.id} className="flex items-center justify-between gap-2 border rounded-md p-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.phone || "sem telefone"}</p>
                  </div>
                  <Button
                    size="sm"
                    disabled={!href}
                    className={sent ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                    onClick={() => {
                      if (!href) return;
                      window.open(href, "_blank", "noopener,noreferrer");
                      setSentIds((prev) => new Set(prev).add(r.id));
                    }}
                  >
                    {sent ? <Check className="w-4 h-4 mr-2" /> : <MessageCircle className="w-4 h-4 mr-2" />}
                    {href ? (sent ? "Enviado" : "Enviar") : "Sem telefone"}
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
