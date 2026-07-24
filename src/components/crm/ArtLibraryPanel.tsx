import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadToR2 } from "@/lib/r2Upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, Trash2, Upload, FileText, FileArchive, Image as ImageIcon, Loader2, Search, Pencil, Eye, FolderPlus, Tag } from "lucide-react";

type ArtCategory = {
  id: string;
  name: string;
  sort_order: number;
};

type ArtItem = {
  id: string;
  title: string;
  file_url: string;
  file_key: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  category_id: string | null;
  format: string | null;
  created_at: string;
};

const FORMATS = [
  { value: "feed", label: "Feed" },
  { value: "stories", label: "Stories" },
  { value: "outro", label: "Outro" },
];

const isImage = (t?: string | null) => !!t && t.startsWith("image/");
const isPdf = (t?: string | null) => t === "application/pdf";
const isZip = (t?: string | null) =>
  !!t && (t.includes("zip") || t.includes("compressed") || t.includes("rar") || t.includes("x-7z"));

function humanSize(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const formatLabel = (v?: string | null) => FORMATS.find((f) => f.value === v)?.label || null;

export function ArtLibraryPanel({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<ArtItem[]>([]);
  const [categories, setCategories] = useState<ArtCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [uploadCategoryId, setUploadCategoryId] = useState<string>("");
  const [uploadFormat, setUploadFormat] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<ArtItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategoryId, setEditCategoryId] = useState<string>("");
  const [editFormat, setEditFormat] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [previewItem, setPreviewItem] = useState<ArtItem | null>(null);
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [savingCat, setSavingCat] = useState(false);
  const [editCat, setEditCat] = useState<ArtCategory | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const stripExt = (name: string) => name.replace(/\.[^.]+$/, "");
  const onFilesChange = (list: File[]) => {
    setFiles(list);
    if (list.length === 1 && !title.trim()) setTitle(stripExt(list[0].name));
  };

  const load = async () => {
    setLoading(true);
    const [{ data: cats }, { data: arts, error }] = await Promise.all([
      (supabase as any).from("art_library_categories").select("*").order("sort_order").order("name"),
      (supabase as any).from("art_library").select("*").order("created_at", { ascending: false }),
    ]);
    if (error) toast.error("Erro ao carregar biblioteca: " + error.message);
    setCategories((cats as ArtCategory[]) || []);
    setItems((arts as ArtItem[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openEdit = (item: ArtItem) => {
    setEditItem(item);
    setEditTitle(item.title);
    setEditCategoryId(item.category_id || "__none__");
    setEditFormat(item.format || "");
  };

  const saveEdit = async () => {
    if (!editItem) return;
    if (!editTitle.trim()) return toast.error("Título não pode ficar vazio");
    if (!editFormat) return toast.error("Selecione um formato (Feed, Stories ou Outro)");
    setSavingEdit(true);
    const { error } = await (supabase as any)
      .from("art_library")
      .update({
        title: editTitle.trim(),
        category_id: editCategoryId && editCategoryId !== "__none__" ? editCategoryId : null,
        format: editFormat,
      })
      .eq("id", editItem.id);
    setSavingEdit(false);
    if (error) return toast.error("Erro ao salvar: " + error.message);
    toast.success("Atualizado");
    setEditItem(null);
    load();
  };

  const handleUpload = async () => {
    if (!files.length) return toast.error("Selecione ao menos um arquivo");
    if (!uploadFormat) return toast.error("Selecione o formato (Feed, Stories ou Outro)");
    setUploading(true);
    let ok = 0;
    for (const file of files) {
      try {
        const url = await uploadToR2(file, "art-library", `${crypto.randomUUID()}-${file.name}`);
        const key = url.split("/").slice(-2).join("/");
        const itemTitle = files.length === 1 && title.trim() ? title.trim() : file.name;
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await (supabase as any).from("art_library").insert({
          title: itemTitle,
          file_url: url,
          file_key: key,
          file_name: file.name,
          file_type: file.type || null,
          file_size: file.size,
          created_by: userData.user?.id,
          category_id: uploadCategoryId && uploadCategoryId !== "__none__" ? uploadCategoryId : null,
          format: uploadFormat,
        });
        if (error) throw error;
        ok++;
      } catch (e: any) {
        toast.error(`Falha em ${file.name}: ${e.message}`);
      }
    }
    setUploading(false);
    if (ok) toast.success(`${ok} arquivo(s) enviado(s)`);
    setUploadOpen(false);
    setTitle("");
    setUploadCategoryId("");
    setUploadFormat("");
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";
    load();
  };

  const handleDelete = async (item: ArtItem) => {
    if (!confirm(`Excluir "${item.title}"?`)) return;
    setDeletingId(item.id);
    const { error } = await (supabase as any).from("art_library").delete().eq("id", item.id);
    setDeletingId(null);
    if (error) return toast.error("Erro ao excluir: " + error.message);
    toast.success("Excluído");
    load();
  };

  const handleDownload = async (item: ArtItem) => {
    try {
      const isR2 = /^https?:\/\//i.test(item.file_url);
      if (isR2) {
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
        const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
        const qs = new URLSearchParams({ url: item.file_url, filename: item.file_name }).toString();
        const res = await fetch(`${SUPABASE_URL}/functions/v1/r2-signed-download?${qs}`, {
          headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
        });
        if (!res.ok) throw new Error("Falha ao gerar link de download");
        const json = await res.json();
        if (!json?.url) throw new Error(json?.error || "URL inválida");
        window.location.href = json.url;
        return;
      }
      const res = await fetch(item.file_url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = item.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(item.file_url, "_blank");
    }
  };

  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    setSavingCat(true);
    const nextOrder = (categories[categories.length - 1]?.sort_order ?? 0) + 1;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("art_library_categories").insert({
      name, sort_order: nextOrder, created_by: userData.user?.id,
    });
    setSavingCat(false);
    if (error) return toast.error("Erro ao criar categoria: " + error.message);
    setNewCatName("");
    toast.success("Categoria criada");
    load();
  };

  const saveCatEdit = async () => {
    if (!editCat) return;
    if (!editCatName.trim()) return;
    const { error } = await (supabase as any)
      .from("art_library_categories")
      .update({ name: editCatName.trim() })
      .eq("id", editCat.id);
    if (error) return toast.error("Erro ao salvar: " + error.message);
    setEditCat(null);
    toast.success("Atualizado");
    load();
  };

  const deleteCategory = async (cat: ArtCategory) => {
    if (!confirm(`Excluir categoria "${cat.name}"? As artes ficarão sem categoria.`)) return;
    const { error } = await (supabase as any).from("art_library_categories").delete().eq("id", cat.id);
    if (error) return toast.error("Erro ao excluir: " + error.message);
    toast.success("Categoria excluída");
    load();
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((i) =>
      i.title.toLowerCase().includes(q) ||
      i.file_name.toLowerCase().includes(q)
    );
  }, [items, search]);

  const grouped = useMemo(() => {
    const byCat = new Map<string, ArtItem[]>();
    for (const cat of categories) byCat.set(cat.id, []);
    const uncategorized: ArtItem[] = [];
    for (const it of filtered) {
      if (it.category_id && byCat.has(it.category_id)) byCat.get(it.category_id)!.push(it);
      else uncategorized.push(it);
    }
    return { byCat, uncategorized };
  }, [filtered, categories]);

  const renderItem = (item: ArtItem) => (
    <div key={item.id} className="border rounded-lg bg-card p-3 flex items-center gap-3 group">
      <div className="h-16 w-16 shrink-0 rounded-md bg-muted flex items-center justify-center overflow-hidden">
        {isImage(item.file_type) ? (
          <img src={item.file_url} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
        ) : isPdf(item.file_type) ? (
          <FileText className="h-8 w-8 text-muted-foreground" />
        ) : isZip(item.file_type) ? (
          <FileArchive className="h-8 w-8 text-muted-foreground" />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium break-words leading-tight line-clamp-2" title={item.title}>{item.title}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {item.format && <Badge variant="secondary" className="text-[10px]">{formatLabel(item.format)}</Badge>}
          <span className="text-xs text-muted-foreground">{humanSize(item.file_size)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {isImage(item.file_type) && (
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setPreviewItem(item)} title="Visualizar">
            <Eye className="h-4 w-4" />
          </Button>
        )}
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => handleDownload(item)} title="Baixar">
          <Download className="h-4 w-4" />
        </Button>
        {isAdmin && (
          <>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => openEdit(item)} title="Editar">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="destructive"
              className="h-8 w-8"
              onClick={() => handleDelete(item)}
              disabled={deletingId === item.id}
              title="Excluir"
            >
              {deletingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Biblioteca de Artes</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {isAdmin
                ? "Cadastre categorias, envie artes marcando Feed/Stories/Outro e organize por categoria."
                : "Visualize e baixe as artes organizadas por categoria."}
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCatManagerOpen(true)}>
                <FolderPlus className="h-4 w-4 mr-2" /> Categorias
              </Button>
              <Button onClick={() => setUploadOpen(true)}>
                <Upload className="h-4 w-4 mr-2" /> Enviar arquivos
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="relative max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título ou arquivo..."
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">Nenhuma arte cadastrada.</p>
          ) : (
            <div className="space-y-8">
              {categories.map((cat) => {
                const list = grouped.byCat.get(cat.id) || [];
                if (list.length === 0) return null;
                return (
                  <div key={cat.id} className="space-y-3">
                    <div className="flex items-center gap-2 border-b pb-2">
                      <Tag className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-base">{cat.name}</h3>
                      <Badge variant="outline" className="ml-1">{list.length}</Badge>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {list.map(renderItem)}
                    </div>
                  </div>
                );
              })}
              {grouped.uncategorized.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b pb-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold text-base text-muted-foreground">Sem categoria</h3>
                    <Badge variant="outline" className="ml-1">{grouped.uncategorized.length}</Badge>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {grouped.uncategorized.map(renderItem)}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={(o) => !uploading && setUploadOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar artes</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome do arquivo" />
              <p className="text-xs text-muted-foreground">Ao enviar vários arquivos, cada um usa o próprio nome.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={uploadCategoryId} onValueChange={setUploadCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem categoria</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Formato <span className="text-destructive">*</span></Label>
                <Select value={uploadFormat} onValueChange={setUploadFormat}>
                  <SelectTrigger><SelectValue placeholder="Feed / Stories / Outro" /></SelectTrigger>
                  <SelectContent>
                    {FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Arquivos (pode selecionar vários)</Label>
              <Input
                ref={inputRef}
                type="file"
                multiple
                onChange={(e) => onFilesChange(Array.from(e.target.files || []))}
              />
              {files.length > 0 && (
                <p className="text-xs text-muted-foreground">{files.length} arquivo(s) selecionado(s). Máx 25MB cada.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>Cancelar</Button>
            <Button onClick={handleUpload} disabled={uploading || !files.length}>
              {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...</> : <>Enviar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editItem} onOpenChange={(o) => !savingEdit && !o && setEditItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar arte</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={editCategoryId} onValueChange={setEditCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem categoria</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Formato <span className="text-destructive">*</span></Label>
                <Select value={editFormat} onValueChange={setEditFormat}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)} disabled={savingEdit}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewItem} onOpenChange={(o) => !o && setPreviewItem(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="break-words pr-6">{previewItem?.title}</DialogTitle>
          </DialogHeader>
          {previewItem && (
            <div className="flex items-center justify-center bg-muted rounded-md overflow-auto max-h-[70vh]">
              <img src={previewItem.file_url} alt={previewItem.title} className="max-w-full max-h-[70vh] object-contain" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewItem(null)}>Fechar</Button>
            <Button onClick={() => previewItem && handleDownload(previewItem)}>
              <Download className="h-4 w-4 mr-2" /> Baixar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category manager */}
      <Dialog open={catManagerOpen} onOpenChange={setCatManagerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Categorias de artes</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Nome da nova categoria"
                onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }}
              />
              <Button onClick={addCategory} disabled={savingCat || !newCatName.trim()}>
                {savingCat ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
              </Button>
            </div>
            <div className="space-y-2 max-h-[50vh] overflow-auto">
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma categoria cadastrada.</p>
              ) : categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-2 border rounded-md p-2">
                  {editCat?.id === cat.id ? (
                    <>
                      <Input value={editCatName} onChange={(e) => setEditCatName(e.target.value)} className="flex-1" />
                      <Button size="sm" onClick={saveCatEdit}>Salvar</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditCat(null)}>Cancelar</Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{cat.name}</span>
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => { setEditCat(cat); setEditCatName(cat.name); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => deleteCategory(cat)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatManagerOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
