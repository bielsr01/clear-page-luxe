import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, ClipboardCheck, Plus, Trash2, ArrowLeft, ArrowRight, Upload, ChevronUp, ChevronDown, Store, CheckCircle2, Clock, Pencil } from "lucide-react";
import { toast } from "sonner";
import { uploadToR2 } from "@/lib/r2Upload";

const sb = supabase as any;

function cleanRestName(name: string): string {
  if (!name) return name;
  if (/teste/i.test(name)) return name;
  return name.replace(/^\s*coxinha\s*surprise\s*[-–—]\s*/i, "").trim() || name;
}

function monthOptions(count = 12): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return opts;
}

type AuditGroup = { id: string; name: string; sort_order: number; is_active: boolean };
type Restaurant = { id: string; name: string };
type Audit = { id: string; restaurant_id: string; audit_month: string; avg_score: number; status: string; created_at: string; notes: string | null };

export function AuditPanel() {
  const monthOpts = useMemo(() => monthOptions(12), []);
  const [month, setMonth] = useState<string>(monthOpts[0].value);
  const [configOpen, setConfigOpen] = useState(false);
  const [wizardFor, setWizardFor] = useState<{ restaurant: Restaurant; editingAuditId?: string } | null>(null);
  const [viewingAudit, setViewingAudit] = useState<string | null>(null);
  const qc = useQueryClient();

  const deleteAudit = async (auditId: string) => {
    if (!confirm("Excluir esta auditoria? Esta ação não pode ser desfeita.")) return;
    const { error: e1 } = await sb.from("audit_scores").delete().eq("audit_id", auditId);
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await sb.from("audits").delete().eq("id", auditId);
    if (e2) return toast.error(e2.message);
    toast.success("Auditoria excluída");
    qc.invalidateQueries({ queryKey: ["audits"] });
  };

  const { data: groups } = useQuery({
    queryKey: ["audit-groups"],
    queryFn: async () => {
      const { data } = await sb.from("audit_groups").select("*").order("sort_order").order("created_at");
      return (data ?? []) as AuditGroup[];
    },
  });

  const { data: restaurants } = useQuery({
    queryKey: ["audit-restaurants"],
    queryFn: async () => {
      const { data } = await sb.from("restaurants").select("id,name").order("name");
      return ((data ?? []) as Restaurant[]).map((r) => ({ ...r, name: cleanRestName(r.name) }));
    },
  });

  const { data: audits, isLoading } = useQuery({
    queryKey: ["audits", month],
    queryFn: async () => {
      const { data } = await sb.from("audits").select("*").eq("audit_month", month).order("created_at", { ascending: false });
      return (data ?? []) as Audit[];
    },
  });

  const auditByRest = useMemo(() => {
    const m = new Map<string, Audit>();
    (audits ?? []).forEach((a) => { if (!m.has(a.restaurant_id)) m.set(a.restaurant_id, a); });
    return m;
  }, [audits]);

  const pending = (restaurants ?? []).filter((r) => !auditByRest.has(r.id));
  const done = (restaurants ?? []).filter((r) => auditByRest.has(r.id));
  const activeGroups = (groups ?? []).filter((g) => g.is_active);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><ClipboardCheck className="w-5 h-5" /> Auditoria mensal</h2>
          <p className="text-sm text-muted-foreground">Uma auditoria por loja por mês.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)} className="gap-1">
            <Settings className="w-4 h-4" /> Configurações
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending" className="gap-1"><Clock className="w-3.5 h-3.5" /> Pendentes ({pending.length})</TabsTrigger>
            <TabsTrigger value="done" className="gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Realizadas ({done.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4 space-y-2">
            {activeGroups.length === 0 && (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
                Cadastre os grupos de auditoria em <button className="underline" onClick={() => setConfigOpen(true)}>Configurações</button> antes de iniciar.
              </CardContent></Card>
            )}
            {pending.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Todas as lojas já foram auditadas neste mês.</CardContent></Card>
            ) : pending.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Store className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium truncate">{r.name}</span>
                  </div>
                  <Button size="sm" disabled={activeGroups.length === 0} onClick={() => setWizardFor({ restaurant: r })}>
                    Fazer auditoria
                  </Button>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="done" className="mt-4 space-y-2">
            {done.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhuma auditoria realizada neste mês.</CardContent></Card>
            ) : done.map((r) => {
              const a = auditByRest.get(r.id)!;
              return (
                <Card key={r.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <Store className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(a.created_at).toLocaleDateString("pt-BR")}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={
                        a.avg_score >= 80 ? "bg-success text-success-foreground"
                        : a.avg_score >= 50 ? "bg-warning text-warning-foreground"
                        : "bg-destructive text-destructive-foreground"
                      }>
                        {Number(a.avg_score).toFixed(0)}%
                      </Badge>
                      <Button size="sm" variant="outline" onClick={() => setViewingAudit(a.id)}>Ver detalhes</Button>
                      <Button size="sm" variant="outline" onClick={() => setWizardFor({ restaurant: r, editingAuditId: a.id })} title="Editar">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => deleteAudit(a.id)} title="Excluir">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      )}

      <GroupsConfigDialog open={configOpen} onOpenChange={setConfigOpen} />
      {wizardFor && (
        <AuditWizardDialog
          restaurant={wizardFor.restaurant}
          editingAuditId={wizardFor.editingAuditId}
          month={month}
          groups={activeGroups}
          onClose={() => setWizardFor(null)}
        />
      )}
      {viewingAudit && (
        <AuditDetailsDialog auditId={viewingAudit} onClose={() => setViewingAudit(null)} />
      )}
    </div>
  );
}

/* -------------------- Configurações de grupos -------------------- */

function GroupsConfigDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: groups } = useQuery({
    queryKey: ["audit-groups"],
    queryFn: async () => {
      const { data } = await sb.from("audit_groups").select("*").order("sort_order").order("created_at");
      return (data ?? []) as AuditGroup[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["audit-groups"] });

  const add = async () => {
    const n = newName.trim();
    if (!n) return;
    setBusy(true);
    const nextOrder = (groups?.length ?? 0) * 10;
    const { error } = await sb.from("audit_groups").insert({ name: n, sort_order: nextOrder });
    setBusy(false);
    if (error) return toast.error(error.message);
    setNewName("");
    refresh();
  };

  const toggleActive = async (g: AuditGroup) => {
    const { error } = await sb.from("audit_groups").update({ is_active: !g.is_active }).eq("id", g.id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const rename = async (g: AuditGroup, name: string) => {
    const { error } = await sb.from("audit_groups").update({ name }).eq("id", g.id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const remove = async (g: AuditGroup) => {
    if (!confirm(`Excluir grupo "${g.name}"?`)) return;
    const { error } = await sb.from("audit_groups").delete().eq("id", g.id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const move = async (g: AuditGroup, dir: -1 | 1) => {
    const list = (groups ?? []).slice();
    const idx = list.findIndex((x) => x.id === g.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= list.length) return;
    const other = list[swapIdx];
    await sb.from("audit_groups").update({ sort_order: other.sort_order }).eq("id", g.id);
    await sb.from("audit_groups").update({ sort_order: g.sort_order }).eq("id", other.id);
    refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Grupos da auditoria</DialogTitle>
          <DialogDescription>Cadastre os grupos que serão avaliados em cada auditoria.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Ex.: Fachada da loja" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <Button onClick={add} disabled={busy || !newName.trim()}><Plus className="w-4 h-4" /></Button>
          </div>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {(groups ?? []).length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">Nenhum grupo cadastrado.</div>
            )}
            {(groups ?? []).map((g, i, arr) => (
              <div key={g.id} className={`flex items-center gap-2 p-2 rounded border ${g.is_active ? "" : "opacity-50"}`}>
                <div className="flex flex-col">
                  <button className="hover:text-primary disabled:opacity-30" disabled={i === 0} onClick={() => move(g, -1)}><ChevronUp className="w-3 h-3" /></button>
                  <button className="hover:text-primary disabled:opacity-30" disabled={i === arr.length - 1} onClick={() => move(g, 1)}><ChevronDown className="w-3 h-3" /></button>
                </div>
                <Input defaultValue={g.name} onBlur={(e) => e.target.value !== g.name && rename(g, e.target.value)} className="h-8" />
                <Button size="sm" variant="ghost" onClick={() => toggleActive(g)}>{g.is_active ? "Ativo" : "Inativo"}</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(g)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- Wizard de auditoria -------------------- */

type StepState = { score: number; notes: string; photo?: File | null; photoUrl?: string | null; uploading?: boolean };

function AuditWizardDialog({
  restaurant, month, groups, onClose,
}: {
  restaurant: Restaurant;
  month: string;
  groups: AuditGroup[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [states, setStates] = useState<StepState[]>(() => groups.map(() => ({ score: 100, notes: "" })));

  const current = groups[step];
  const st = states[step];

  const updateSt = (patch: Partial<StepState>) => {
    setStates((prev) => prev.map((s, i) => (i === step ? { ...s, ...patch } : s)));
  };

  const onPickPhoto = async (file: File) => {
    updateSt({ photo: file, uploading: true });
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filename = `${current.id}-${Date.now()}-${safeName}`;
      const folder = `audit-photos/${restaurant.id}/${month}`;
      const url = await uploadToR2(file, folder, filename);
      updateSt({ uploading: false, photoUrl: url });
    } catch (e: any) {
      updateSt({ uploading: false, photo: null, photoUrl: null });
      toast.error(`Erro ao enviar foto: ${e.message ?? e}`);
    }
  };

  const finish = async () => {
    if (states.some((s) => !s.photoUrl)) {
      toast.error("Envie a foto de todos os grupos antes de finalizar.");
      return;
    }
    setSaving(true);
    try {
      const avg = states.reduce((s, x) => s + x.score, 0) / states.length;
      const { data: audit, error } = await sb.from("audits").insert({
        restaurant_id: restaurant.id,
        audit_month: month,
        avg_score: Number(avg.toFixed(2)),
        status: "completed",
        created_by: user?.id ?? null,
      }).select("id").single();
      if (error) throw error;

      const rows = groups.map((g, i) => ({
        audit_id: audit.id,
        group_id: g.id,
        group_name: g.name,
        score: states[i].score,
        notes: states[i].notes || null,
        photo_url: states[i].photoUrl || null,
      }));
      const { error: e2 } = await sb.from("audit_scores").insert(rows);
      if (e2) throw e2;

      toast.success(`Auditoria salva — média ${avg.toFixed(0)}%`);
      qc.invalidateQueries({ queryKey: ["audits"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const isLast = step === groups.length - 1;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Auditoria — {restaurant.name}</DialogTitle>
          <DialogDescription>
            Passo {step + 1} de {groups.length} • {current?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Foto <span className="text-destructive">*</span></Label>
            {st?.photoUrl ? (
              <div className="text-xs text-success flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Foto enviada</div>
            ) : (
              <div className="text-xs text-muted-foreground">Obrigatório para prosseguir.</div>
            )}
            <label className="flex items-center gap-2 border-2 border-dashed rounded-lg p-4 cursor-pointer hover:bg-accent">
              <Upload className="w-4 h-4" />
              <span className="text-sm">{st?.uploading ? "Enviando..." : st?.photo ? st.photo.name : "Escolher / tirar foto"}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onPickPhoto(e.target.files[0])}
              />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Pontuação</Label>
              <Badge variant="outline" className="font-mono text-base">{st?.score ?? 0}</Badge>
            </div>
            <Slider
              min={0} max={100} step={1}
              value={[st?.score ?? 0]}
              onValueChange={(v) => updateSt({ score: v[0] })}
            />
          </div>

          <div className="space-y-2">
            <Label>Observação</Label>
            <Textarea value={st?.notes ?? ""} onChange={(e) => updateSt({ notes: e.target.value })} rows={3} />
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button variant="outline" disabled={step === 0 || saving} onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Anterior
          </Button>
          {isLast ? (
            <Button disabled={saving || st?.uploading || !st?.photoUrl} onClick={finish}>
              {saving ? "Salvando..." : "Finalizar auditoria"}
            </Button>
          ) : (
            <Button disabled={st?.uploading || !st?.photoUrl} onClick={() => setStep((s) => s + 1)}>
              Próximo <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- Detalhes -------------------- */

function AuditDetailsDialog({ auditId, onClose }: { auditId: string; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["audit-details", auditId],
    queryFn: async () => {
      const { data } = await sb.from("audit_scores").select("*").eq("audit_id", auditId).order("created_at");
      return (data ?? []) as { id: string; group_name: string; score: number; notes: string | null; photo_url: string | null }[];
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Detalhes da auditoria</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          {(data ?? []).map((s) => (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  {s.group_name}
                  <Badge variant="outline">{s.score}/100</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {s.photo_url && (
                  <img src={s.photo_url} alt={s.group_name} className="rounded max-h-64 object-cover" />
                )}
                {s.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{s.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
        <DialogFooter><Button onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
