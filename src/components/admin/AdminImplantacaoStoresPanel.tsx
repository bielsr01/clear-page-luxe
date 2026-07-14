import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Store {
  id: string;
  name: string;
  franchisee_name: string | null;
  city: string | null;
  consultant: string | null;
  contract_signed_at: string | null;
  expected_opening_at: string | null;
}

const empty: Omit<Store, "id"> = {
  name: "",
  franchisee_name: "",
  city: "",
  consultant: "",
  contract_signed_at: "",
  expected_opening_at: "",
};

export function AdminImplantacaoStoresPanel() {
  const [stores, setStores] = useState<Store[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);
  const [form, setForm] = useState<Omit<Store, "id">>(empty);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("implantacao_stores")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setStores((data as any) ?? []);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };
  const openEdit = (s: Store) => {
    setEditing(s);
    setForm({
      name: s.name,
      franchisee_name: s.franchisee_name ?? "",
      city: s.city ?? "",
      consultant: s.consultant ?? "",
      contract_signed_at: s.contract_signed_at ?? "",
      expected_opening_at: s.expected_opening_at ?? "",
    });
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Nome da loja é obrigatório");
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      franchisee_name: form.franchisee_name || null,
      city: form.city || null,
      consultant: form.consultant || null,
      contract_signed_at: form.contract_signed_at || null,
      expected_opening_at: form.expected_opening_at || null,
    };
    const res = editing
      ? await supabase.from("implantacao_stores").update(payload).eq("id", editing.id)
      : await supabase.from("implantacao_stores").insert(payload);
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Loja atualizada" : "Loja cadastrada");
    setOpen(false);
    load();
  };

  const remove = async (s: Store) => {
    const { error } = await supabase.from("implantacao_stores").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Loja excluída");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-muted-foreground text-sm">Cadastre lojas em processo de implantação.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Nova loja</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Editar loja" : "Cadastrar loja"}</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div className="space-y-2">
                <Label>Nome da loja *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Nome do franqueado</Label>
                <Input value={form.franchisee_name ?? ""} onChange={(e) => setForm({ ...form, franchisee_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Consultor responsável</Label>
                  <Input value={form.consultant ?? ""} onChange={(e) => setForm({ ...form, consultant: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Assinatura do contrato</Label>
                  <Input type="date" value={form.contract_signed_at ?? ""} onChange={(e) => setForm({ ...form, contract_signed_at: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Previsão de inauguração</Label>
                  <Input type="date" value={form.expected_opening_at ?? ""} onChange={(e) => setForm({ ...form, expected_opening_at: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {stores.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhuma loja cadastrada.</div>
          ) : (
            <div className="divide-y">
              {stores.map((s) => (
                <div key={s.id} className="p-4 flex flex-wrap gap-3 items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {[s.franchisee_name, s.city, s.consultant].filter(Boolean).join(" · ")}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {s.contract_signed_at && <>Contrato: {new Date(s.contract_signed_at).toLocaleDateString("pt-BR")} · </>}
                      {s.expected_opening_at && <>Inauguração: {new Date(s.expected_opening_at).toLocaleDateString("pt-BR")}</>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline"><Trash2 className="w-4 h-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir loja?</AlertDialogTitle>
                          <AlertDialogDescription>Esta ação removerá a loja e seu checklist.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(s)}>Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
