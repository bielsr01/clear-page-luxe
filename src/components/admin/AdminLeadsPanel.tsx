import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, MessageCircle, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";

type LeadStatus = "em_espera" | "com_interesse" | "em_atendimento" | "desinteressado" | "contrato_fechado";

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  available_capital: number | null;
  status: LeadStatus;
  notes: string | null;
  position: number;
  created_at: string;
}

const COLUMNS: { id: LeadStatus; title: string; color: string }[] = [
  { id: "em_espera", title: "Em espera", color: "bg-slate-500" },
  { id: "com_interesse", title: "Com interesse", color: "bg-blue-500" },
  { id: "em_atendimento", title: "Em atendimento", color: "bg-amber-500" },
  { id: "desinteressado", title: "Desinteressado", color: "bg-rose-500" },
  { id: "contrato_fechado", title: "Contrato fechado", color: "bg-emerald-600" },
];

function buildWhatsApp(phone: string | null | undefined) {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (!d) return null;
  if (d.length <= 11) d = "55" + d;
  return `https://wa.me/${d}`;
}

const emptyForm = { name: "", phone: "", city: "", available_capital: "", status: "em_espera" as LeadStatus, notes: "" };

export function AdminLeadsPanel() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsLead, setDetailsLead] = useState<Lead | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<LeadStatus | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("leads").select("*").order("position", { ascending: true }).order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setLeads((data as Lead[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("admin-leads")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const grouped = useMemo(() => {
    const g: Record<LeadStatus, Lead[]> = {
      em_espera: [], com_interesse: [], em_atendimento: [], desinteressado: [], contrato_fechado: [],
    };
    leads.forEach((l) => g[l.status].push(l));
    return g;
  }, [leads]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (l: Lead) => {
    setEditing(l);
    setForm({
      name: l.name,
      phone: l.phone ?? "",
      city: l.city ?? "",
      available_capital: l.available_capital != null ? String(l.available_capital) : "",
      status: l.status,
      notes: l.notes ?? "",
    });
    setDetailsLead(null);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Nome é obrigatório");
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      city: form.city.trim() || null,
      available_capital: form.available_capital ? Number(form.available_capital.replace(",", ".")) : null,
      status: form.status,
      notes: form.notes.trim() || null,
    };
    if (editing) {
      const { error } = await supabase.from("leads").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Lead atualizado");
    } else {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("leads").insert({ ...payload, created_by: u.user?.id });
      if (error) return toast.error(error.message);
      toast.success("Lead criado");
    }
    setDialogOpen(false);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Lead excluído");
    setDetailsLead(null);
    load();
  };

  const onDrop = async (status: LeadStatus) => {
    const id = dragId;
    setDragId(null);
    setDragOverCol(null);
    if (!id) return;
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.status === status) return;
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    const { error } = await supabase.from("leads").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); load(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">Arraste os cards entre as colunas para atualizar o status.</p>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Novo lead</Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {COLUMNS.map((col) => (
            <div
              key={col.id}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
              onDragLeave={() => setDragOverCol((c) => (c === col.id ? null : c))}
              onDrop={() => onDrop(col.id)}
              className={`rounded-lg border bg-muted/30 flex flex-col min-h-[300px] ${dragOverCol === col.id ? "ring-2 ring-primary" : ""}`}
            >
              <div className="p-3 border-b flex items-center gap-2 sticky top-0 bg-muted/60 rounded-t-lg">
                <span className={`w-2 h-2 rounded-full ${col.color}`} />
                <div className="font-semibold text-sm flex-1">{col.title}</div>
                <span className="text-xs text-muted-foreground">{grouped[col.id].length}</span>
              </div>
              <div className="p-2 space-y-2 flex-1">
                {grouped[col.id].map((lead) => {
                  const wa = buildWhatsApp(lead.phone);
                  return (
                    <Card
                      key={lead.id}
                      draggable
                      onDragStart={() => setDragId(lead.id)}
                      onDragEnd={() => { setDragId(null); setDragOverCol(null); }}
                      onClick={() => setDetailsLead(lead)}
                      className={`cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${dragId === lead.id ? "opacity-50" : ""}`}
                    >
                      <CardContent className="p-3 space-y-1.5">
                        <div className="flex items-start gap-1">
                          <GripVertical className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="font-medium text-sm flex-1 leading-tight">{lead.name}</div>
                        </div>
                        {lead.phone && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-5">
                            <span>{lead.phone}</span>
                            {wa && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); window.open(wa, "_blank", "noopener,noreferrer"); }}
                                className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-600 hover:bg-green-700 text-white"
                                title="WhatsApp"
                              >
                                <MessageCircle className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                        {lead.city && <div className="text-xs text-muted-foreground pl-5">{lead.city}</div>}
                      </CardContent>
                    </Card>
                  );
                })}
                {grouped[col.id].length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-6">Sem leads</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar lead" : "Novo lead"}</DialogTitle>
            <DialogDescription>Cadastre os dados do lead.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 90000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label>Cidade</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Capital disponível (R$)</Label>
                <Input type="number" step="0.01" value={form.available_capital} onChange={(e) => setForm({ ...form, available_capital: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as LeadStatus })}
                >
                  {COLUMNS.map((c) => (<option key={c.id} value={c.id}>{c.title}</option>))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details dialog */}
      <Dialog open={!!detailsLead} onOpenChange={(o) => !o && setDetailsLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detailsLead?.name}</DialogTitle>
            <DialogDescription>Detalhes do lead</DialogDescription>
          </DialogHeader>
          {detailsLead && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><div className="text-muted-foreground text-xs">Telefone</div><div>{detailsLead.phone || "—"}</div></div>
                <div><div className="text-muted-foreground text-xs">Cidade</div><div>{detailsLead.city || "—"}</div></div>
                <div><div className="text-muted-foreground text-xs">Capital disponível</div><div>{detailsLead.available_capital != null ? brl(Number(detailsLead.available_capital)) : "—"}</div></div>
                <div><div className="text-muted-foreground text-xs">Status</div><div>{COLUMNS.find((c) => c.id === detailsLead.status)?.title}</div></div>
              </div>
              {detailsLead.notes && (
                <div>
                  <div className="text-muted-foreground text-xs">Observações</div>
                  <div className="whitespace-pre-wrap">{detailsLead.notes}</div>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                {buildWhatsApp(detailsLead.phone) && (
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => window.open(buildWhatsApp(detailsLead.phone)!, "_blank", "noopener,noreferrer")}>
                    <MessageCircle className="w-4 h-4 mr-1.5" /> WhatsApp
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => openEdit(detailsLead)}><Pencil className="w-4 h-4 mr-1.5" />Editar</Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4 mr-1.5" />Excluir</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir lead?</AlertDialogTitle>
                      <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(detailsLead.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
