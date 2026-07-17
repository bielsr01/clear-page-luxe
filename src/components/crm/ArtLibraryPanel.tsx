import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadToR2 } from "@/lib/r2Upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, Trash2, Upload, FileText, FileArchive, Image as ImageIcon, Loader2, Search } from "lucide-react";

type ArtItem = {
  id: string;
  title: string;
  file_url: string;
  file_key: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
};

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

export function ArtLibraryPanel({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<ArtItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<ArtItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stripExt = (name: string) => name.replace(/\.[^.]+$/, "");
  const onFilesChange = (list: File[]) => {
    setFiles(list);
    if (list.length === 1 && !title.trim()) setTitle(stripExt(list[0].name));
  };

  const openEdit = (item: ArtItem) => {
    setEditItem(item);
    setEditTitle(item.title);
  };

  const saveEdit = async () => {
    if (!editItem) return;
    if (!editTitle.trim()) return toast.error("Título não pode ficar vazio");
    setSavingEdit(true);
    const { error } = await (supabase as any)
      .from("art_library")
      .update({ title: editTitle.trim() })
      .eq("id", editItem.id);
    setSavingEdit(false);
    if (error) return toast.error("Erro ao salvar: " + error.message);
    toast.success("Atualizado");
    setEditItem(null);
    load();
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("art_library")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar biblioteca: " + error.message);
    setItems((data as ArtItem[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async () => {
    if (!files.length) return toast.error("Selecione ao menos um arquivo");
    setUploading(true);
    let ok = 0, fail = 0;
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
        });
        if (error) throw error;
        ok++;
      } catch (e: any) {
        fail++;
        toast.error(`Falha em ${file.name}: ${e.message}`);
      }
    }
    setUploading(false);
    if (ok) toast.success(`${ok} arquivo(s) enviado(s)`);
    setUploadOpen(false);
    setTitle("");
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

  const filtered = items.filter((i) =>
    i.title.toLowerCase().includes(search.toLowerCase()) ||
    i.file_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Biblioteca de Artes</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {isAdmin
                ? "Cadastre, visualize e exclua artes. Aceita imagens, PDF, ZIP e outros formatos."
                : "Visualize e baixe as artes disponibilizadas pelo administrador."}
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4 mr-2" /> Enviar arquivos
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filtered.map((item) => (
                <div key={item.id} className="border rounded-lg overflow-hidden bg-card group">
                  <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                    {isImage(item.file_type) ? (
                      <img src={item.file_url} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : isPdf(item.file_type) ? (
                      <FileText className="h-14 w-14 text-muted-foreground" />
                    ) : isZip(item.file_type) ? (
                      <FileArchive className="h-14 w-14 text-muted-foreground" />
                    ) : (
                      <ImageIcon className="h-14 w-14 text-muted-foreground" />
                    )}
                  </div>
                  <div className="p-2 space-y-1">
                    <p className="text-sm font-medium truncate" title={item.title}>{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{humanSize(item.file_size)}</p>
                    <div className="flex gap-1 pt-1">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => handleDownload(item)}>
                        <Download className="h-3 w-3 mr-1" /> Baixar
                      </Button>
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(item)}
                          disabled={deletingId === item.id}
                        >
                          {deletingId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={uploadOpen} onOpenChange={(o) => !uploading && setUploadOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar artes</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título (opcional — usado quando 1 arquivo)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Banner promocional agosto" />
            </div>
            <div className="space-y-2">
              <Label>Arquivos (pode selecionar vários)</Label>
              <Input
                ref={inputRef}
                type="file"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
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
    </div>
  );
}
