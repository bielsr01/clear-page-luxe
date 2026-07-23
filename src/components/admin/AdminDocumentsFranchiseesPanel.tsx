import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Tag, Loader2, Upload, Eye, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  uploadDocumentFile, getDocumentSignedUrl, deleteDocumentFile,
} from "@/lib/documents";

type Cat = { id: string; name: string; is_active: boolean; sort_order: number };
type Restaurant = { id: string; name: string };
type Doc = {
  id: string;
  name: string;
  file_path: string;
  size_bytes: number | null;
  mime_type: string | null;
  category_id: string | null;
  restaurant_id: string | null;
  created_at: string;
};

const fmtSize = (b: number | null) => {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
};

export function AdminDocumentsFranchiseesPanel() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [restaurantFilter, setRestaurantFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const [catOpen, setCatOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Cat | null>(null);
  const [savingCat, setSavingCat] = useState(false);

  const [docOpen, setDocOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Doc | null>(null);
  const [docName, setDocName] = useState("");
  const [docCat, setDocCat] = useState<string>("");
  const [docRest, setDocRest] = useState<string>("");
  const [savingDoc, setSavingDoc] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, r, d] = await Promise.all([
      (supabase as any).from("document_categories").select("*").order("sort_order").order("name"),
      supabase.from("restaurants").select("id,name").order("name"),
      (supabase as any).from("documents").select("*").eq("doc_type", "franchisee").order("created_at", { ascending: false }),
    ]);
    setLoading(false);
    if (c.error) toast.error(c.error.message);
    if (r.error) toast.error(r.error.message);
    if (d.error) toast.error(d.error.message);
    setCats((c.data ?? []) as Cat[]);
    setRestaurants((r.data ?? []) as Restaurant[]);
    setDocs((d.data ?? []) as Doc[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const catsById = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c])), [cats]);
  const restById = useMemo(() => Object.fromEntries(restaurants.map((r) => [r.id, r])), [restaurants]);

  const filtered = useMemo(() => docs.filter((d) => {
    if (restaurantFilter !== "all" && d.restaurant_id !== restaurantFilter) return false;
    if (categoryFilter !== "all" && (d.category_id ?? "") !== categoryFilter) return false;
    return true;
  }), [docs, restaurantFilter, categoryFilter]);

  const saveCat = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    if (savingCat) return;
    const fd = new FormData(ev.currentTarget);
    const payload = {
      name: String(fd.get("name") || "").trim(),
      is_active: fd.get("is_active") === "on",
      sort_order: Number(fd.get("sort_order") || 0),
    };
    if (!payload.name) return toast.error("Nome obrigatório");
    setSavingCat(true);
    try {
      const op = editingCat
        ? (supabase as any).from("document_categories").update(payload).eq("id", editingCat.id)
        : (supabase as any).from("document_categories").insert(payload);
      const { error } = await op;
      if (error) { toast.error(error.message); return; }
      toast.success("Salvo");
      setCatOpen(false); setEditingCat(null);
      void load();
    } finally { setSavingCat(false); }
  };

  const removeCat = async (id: string) => {
    if (!confirm("Excluir esta categoria?")) return;
    const { error } = await (supabase as any).from("document_categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  const openCreateDoc = () => {
    setEditingDoc(null);
    setDocName("");
    setDocCat(categoryFilter !== "all" ? categoryFilter : "");
    setDocRest(restaurantFilter !== "all" ? restaurantFilter : "");
    setDocOpen(true);
  };

  const openEditDoc = (d: Doc) => {
    setEditingDoc(d);
    setDocName(d.name);
    setDocCat(d.category_id ?? "");
    setDocRest(d.restaurant_id ?? "");
    setDocOpen(true);
  };

  const saveDoc = async () => {
    if (savingDoc) return;
    if (!docRest) return toast.error("Selecione um restaurante");
    setSavingDoc(true);
    try {
      const file = fileRef.current?.files?.[0];
      if (editingDoc) {
        const patch: any = {
          name: docName.trim() || editingDoc.name,
          category_id: docCat || null,
          restaurant_id: docRest,
        };
        if (file) {
          const { path } = await uploadDocumentFile("franchisee", file, docRest);
          await deleteDocumentFile(editingDoc.file_path);
          patch.file_path = path;
          patch.size_bytes = file.size;
          patch.mime_type = file.type;
          if (!docName.trim()) patch.name = file.name;
        }
        const { error } = await (supabase as any).from("documents").update(patch).eq("id", editingDoc.id);
        if (error) throw error;
        toast.success("Documento atualizado");
      } else {
        if (!file) return toast.error("Escolha um arquivo");
        const { path } = await uploadDocumentFile("franchisee", file, docRest);
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await (supabase as any).from("documents").insert({
          doc_type: "franchisee",
          name: docName.trim() || file.name,
          file_path: path,
          size_bytes: file.size,
          mime_type: file.type,
          category_id: docCat || null,
          restaurant_id: docRest,
          created_by: user?.id ?? null,
        });
        if (error) throw error;
        toast.success("Documento adicionado");
      }
      setDocOpen(false);
      setEditingDoc(null);
      if (fileRef.current) fileRef.current.value = "";
      void load();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSavingDoc(false); }
  };

  const removeDoc = async (d: Doc) => {
    if (!confirm(`Excluir "${d.name}"?`)) return;
    await deleteDocumentFile(d.file_path);
    const { error } = await (supabase as any).from("documents").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    void load();
  };

  const openView = async (d: Doc) => {
    try { window.open(await getDocumentSignedUrl(d.file_path), "_blank"); }
    catch (e: any) { toast.error(e.message); }
  };

  const downloadDoc = async (d: Doc) => {
    try {
      const pathExt = d.file_path.split(".").pop() || "pdf";
      const filename = /\.[a-z0-9]+$/i.test(d.name) ? d.name : `${d.name}.${pathExt}`;
      const isR2 = /^https?:\/\//i.test(d.file_path);
      if (isR2) {
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
        const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
        const qs = new URLSearchParams({ url: d.file_path, filename }).toString();
        const res = await fetch(`${SUPABASE_URL}/functions/v1/r2-signed-download?${qs}`, {
          headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
        });
        if (!res.ok) throw new Error("Falha ao gerar link de download");
        const json = await res.json();
        if (!json?.url) throw new Error(json?.error || "URL inválida");
        window.location.href = json.url;
        return;
      }
      const url = await getDocumentSignedUrl(d.file_path);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Falha ao baixar arquivo");
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2"><Tag className="w-4 h-4" /> Categorias de documentos</span>
            <Dialog open={catOpen} onOpenChange={(v) => { setCatOpen(v); if (!v) setEditingCat(null); }}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => { setEditingCat(null); setCatOpen(true); }}>
                  <Plus className="w-4 h-4 mr-1" /> Nova categoria
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingCat ? "Editar" : "Nova"} categoria</DialogTitle></DialogHeader>
                <form onSubmit={saveCat} className="space-y-3">
                  <div><Label>Nome</Label><Input name="name" defaultValue={editingCat?.name} required /></div>
                  <div><Label>Ordem</Label><Input name="sort_order" type="number" defaultValue={editingCat?.sort_order ?? 0} /></div>
                  <div className="flex items-center gap-2">
                    <Switch name="is_active" defaultChecked={editingCat?.is_active ?? true} id="dc-active" />
                    <Label htmlFor="dc-active" className="cursor-pointer">Ativa</Label>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={savingCat}>
                      {savingCat && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                      {editingCat ? "Salvar" : "Adicionar"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {cats.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhuma categoria cadastrada.</div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Status</TableHead><TableHead className="w-24" /></TableRow></TableHeader>
              <TableBody>
                {cats.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.is_active ? "Ativa" : "Inativa"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingCat(c); setCatOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeCat(c.id)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2"><FileText className="w-4 h-4" /> Documentos de franqueados</span>
            <Button size="sm" onClick={openCreateDoc} className="gap-2">
              <Upload className="w-4 h-4" /> Novo documento
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs">Restaurante</Label>
              <Select value={restaurantFilter} onValueChange={setRestaurantFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {restaurants.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhum documento no filtro.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Restaurante</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Tamanho</TableHead>
                    <TableHead>Adicionado</TableHead>
                    <TableHead className="text-right w-48">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>{d.restaurant_id ? restById[d.restaurant_id]?.name ?? "—" : "—"}</TableCell>
                      <TableCell>{d.category_id ? catsById[d.category_id]?.name ?? "—" : "—"}</TableCell>
                      <TableCell>{fmtSize(d.size_bytes)}</TableCell>
                      <TableCell>{new Date(d.created_at).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Visualizar" onClick={() => openView(d)}><Eye className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" title="Baixar" onClick={() => downloadDoc(d)}><Download className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" title="Editar" onClick={() => openEditDoc(d)}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" title="Excluir" className="text-destructive" onClick={() => removeDoc(d)}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={docOpen} onOpenChange={(o) => { setDocOpen(o); if (!o) setEditingDoc(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDoc ? "Editar" : "Novo"} documento</DialogTitle>
            <DialogDescription>Vincule ao restaurante e, opcionalmente, a uma categoria.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Restaurante</Label>
              <Select value={docRest} onValueChange={setDocRest}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {restaurants.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={docCat || "__none"} onValueChange={(v) => setDocCat(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem categoria</SelectItem>
                  {cats.filter(c => c.is_active).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome</Label>
              <Input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="Ex: Contrato assinado" />
            </div>
            <div>
              <Label>Arquivo {editingDoc && "(deixe vazio para manter o atual)"}</Label>
              <Input ref={fileRef} type="file" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocOpen(false)}>Cancelar</Button>
            <Button onClick={saveDoc} disabled={savingDoc} className="gap-2">
              {savingDoc && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
