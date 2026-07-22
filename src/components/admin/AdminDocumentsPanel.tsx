import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Upload, FileText, Eye, Pencil, Trash2, Send, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DocType, uploadDocumentFile, getDocumentSignedUrl, deleteDocumentFile,
  sendDocumentViaWhatsApp,
} from "@/lib/documents";

type Doc = {
  id: string;
  name: string;
  description: string | null;
  file_path: string;
  size_bytes: number | null;
  mime_type: string | null;
  created_at: string;
};

const fmtSize = (b: number | null) => {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
};

export function AdminDocumentsPanel({
  docType,
  title,
}: {
  docType: DocType;
  title: string;
}) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<Doc | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendDoc, setSendDoc] = useState<Doc | null>(null);
  const [sendPhone, setSendPhone] = useState("");
  const [sendMsg, setSendMsg] = useState("");
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploadName, setUploadName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("documents").select("*").eq("doc_type", docType)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setDocs((data ?? []) as Doc[]);
  }, [docType]);

  useEffect(() => { void load(); }, [load]);

  const openView = async (d: Doc) => {
    try {
      const url = await getDocumentSignedUrl(d.file_path);
      window.open(url, "_blank");
    } catch (e: any) { toast.error(e.message); }
  };

  const openEdit = (d: Doc) => {
    setEditing(d);
    setUploadName(d.name);
    setUploadOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setUploadName("");
    setUploadOpen(true);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (editing) {
        const file = fileRef.current?.files?.[0];
        const patch: any = { name: uploadName.trim() || editing.name };
        if (file) {
          const { path } = await uploadDocumentFile(docType, file);
          await deleteDocumentFile(editing.file_path);
          patch.file_path = path;
          patch.size_bytes = file.size;
          patch.mime_type = file.type;
          if (!uploadName.trim()) patch.name = file.name;
        }
        const { error } = await (supabase as any)
          .from("documents").update(patch).eq("id", editing.id);
        if (error) throw error;
        toast.success("Documento atualizado");
      } else {
        const file = fileRef.current?.files?.[0];
        if (!file) return toast.error("Escolha um arquivo");
        const { path } = await uploadDocumentFile(docType, file);
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await (supabase as any).from("documents").insert({
          doc_type: docType,
          name: uploadName.trim() || file.name,
          file_path: path,
          size_bytes: file.size,
          mime_type: file.type,
          created_by: user?.id ?? null,
        });
        if (error) throw error;
        toast.success("Documento adicionado");
      }
      setUploadOpen(false);
      setEditing(null);
      if (fileRef.current) fileRef.current.value = "";
      void load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d: Doc) => {
    if (!confirm(`Excluir "${d.name}"?`)) return;
    await deleteDocumentFile(d.file_path);
    const { error } = await (supabase as any).from("documents").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    void load();
  };

  const openSend = (d: Doc) => {
    setSendDoc(d);
    setSendPhone("");
    setSendMsg(`Olá! Segue nossa ${title}.`);
  };

  const doSend = async () => {
    if (!sendDoc) return;
    if (sending) return;
    if (!sendPhone.trim()) return toast.error("Informe o WhatsApp");
    setSending(true);
    try {
      await sendDocumentViaWhatsApp({
        phone: sendPhone,
        filePath: sendDoc.file_path,
        fileName: sendDoc.name.endsWith(".pdf") ? sendDoc.name : `${sendDoc.name}.pdf`,
        caption: sendMsg,
      });
      toast.success("Enviado no WhatsApp");
      setSendDoc(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  const downloadDoc = async (d: Doc) => {
    try {
      const url = await getDocumentSignedUrl(d.file_path);
      const a = document.createElement("a");
      a.href = url;
      a.download = d.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5" /> {title}
        </h2>
        <Button onClick={openCreate} className="gap-2">
          <Upload className="w-4 h-4" /> Novo documento
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : docs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhum documento cadastrado.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tamanho</TableHead>
                  <TableHead>Adicionado</TableHead>
                  <TableHead className="text-right w-64">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell>{fmtSize(d.size_bytes)}</TableCell>
                    <TableCell>{new Date(d.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" title="Visualizar" onClick={() => openView(d)}><Eye className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" title="Baixar" onClick={() => downloadDoc(d)}><Download className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" title="Enviar no WhatsApp" onClick={() => openSend(d)}><Send className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(d)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" title="Excluir" className="text-destructive" onClick={() => remove(d)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={uploadOpen} onOpenChange={(o) => { setUploadOpen(o); if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar documento" : "Novo documento"}</DialogTitle>
            <DialogDescription>Arquivos PDF ficam armazenados de forma privada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="Ex: Apresentação 2026" />
            </div>
            <div>
              <Label>Arquivo PDF {editing && "(deixe vazio para manter o atual)"}</Label>
              <Input ref={fileRef} type="file" accept="application/pdf,.pdf" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!sendDoc} onOpenChange={(o) => !o && setSendDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar por WhatsApp</DialogTitle>
            <DialogDescription>
              O arquivo será enviado como documento PDF via integração Evolution do admin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Número do WhatsApp</Label>
              <Input placeholder="(11) 99999-9999" value={sendPhone} onChange={(e) => setSendPhone(e.target.value)} />
            </div>
            <div>
              <Label>Mensagem (legenda)</Label>
              <Textarea rows={3} value={sendMsg} onChange={(e) => setSendMsg(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDoc(null)}>Cancelar</Button>
            <Button onClick={doSend} disabled={sending} className="gap-2">
              {sending && <Loader2 className="w-4 h-4 animate-spin" />} Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
