import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Paperclip, X, LifeBuoy, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { uploadToR2 } from "@/lib/r2Upload";

type Status = "open" | "in_progress" | "completed";

interface Ticket {
  id: string;
  subject: string;
  description: string;
  photos: string[];
  status: Status;
  admin_notes: string | null;
  created_at: string;
  in_progress_at: string | null;
  completed_at: string | null;
}

const statusLabel: Record<Status, string> = {
  open: "Aberto",
  in_progress: "Em atendimento",
  completed: "Concluído",
};

const statusVariant: Record<Status, string> = {
  open: "bg-amber-500 text-white",
  in_progress: "bg-blue-500 text-white",
  completed: "bg-emerald-600 text-white",
};

export function SupportPanel({ restaurantId }: { restaurantId: string }) {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("support_tickets")
      .select("id,subject,description,photos,status,admin_notes,created_at,in_progress_at,completed_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false });
    setTickets(((data as any) ?? []) as Ticket[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`support-tickets-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_tickets", filter: `restaurant_id=eq.${restaurantId}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-accent text-accent-foreground grid place-items-center">
              <LifeBuoy className="w-6 h-6" />
            </div>
            <div>
              <div className="font-semibold">Suporte</div>
              <p className="text-sm text-muted-foreground">
                Abra um chamado para o administrador e acompanhe o status aqui.
              </p>
            </div>
          </div>
          <NewTicketDialog
            open={open}
            onOpenChange={setOpen}
            restaurantId={restaurantId}
            userId={user?.id ?? ""}
            onCreated={load}
          />
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-sm text-muted-foreground p-6 text-center">Carregando chamados...</div>
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum chamado ainda. Clique em "Abrir novo chamado" para começar.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <TicketCard key={t.id} ticket={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <Card>
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="font-semibold">{ticket.subject}</div>
            <div className="text-xs text-muted-foreground">
              Aberto em {new Date(ticket.created_at).toLocaleString("pt-BR")}
            </div>
          </div>
          <Badge className={statusVariant[ticket.status]}>{statusLabel[ticket.status]}</Badge>
        </div>
        <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
        {ticket.photos?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {ticket.photos.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer" className="block">
                <img src={url} alt={`Anexo ${i + 1}`} className="w-24 h-24 object-cover rounded-md border" />
              </a>
            ))}
          </div>
        )}
        {ticket.admin_notes && (
          <div className="text-sm border-l-2 border-primary/60 pl-3 bg-muted/40 py-2 rounded-r">
            <div className="text-xs font-semibold text-muted-foreground mb-1">Resposta inicial</div>
            <div className="whitespace-pre-wrap">{ticket.admin_notes}</div>
          </div>
        )}
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-1">Conversa com o suporte</div>
          <TicketThread ticketId={ticket.id} myRole="manager" />
        </div>
      </CardContent>
    </Card>
  );
}

function NewTicketDialog({
  open,
  onOpenChange,
  restaurantId,
  userId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  restaurantId: string;
  userId: string;
  onCreated: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);

  const reset = () => {
    setSubject("");
    setDescription("");
    setFiles([]);
  };

  const submit = async () => {
    if (!subject.trim() || !description.trim()) {
      toast.error("Preencha o assunto e a descrição.");
      return;
    }
    if (!userId) {
      toast.error("Sessão expirada.");
      return;
    }
    setUploading(true);
    try {
      const photoUrls: string[] = [];
      for (const f of files) {
        const url = await uploadToR2(f, `support-tickets/${restaurantId}`);
        photoUrls.push(url);
      }
      const { error } = await supabase.from("support_tickets").insert({
        restaurant_id: restaurantId,
        created_by: userId,
        subject: subject.trim(),
        description: description.trim(),
        photos: photoUrls,
      });
      if (error) throw error;
      toast.success("Chamado enviado!");
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao enviar chamado");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 mr-2" />Abrir novo chamado</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Abrir chamado de suporte</DialogTitle>
          <DialogDescription>Descreva o problema. Fotos são opcionais.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Assunto</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="Ex: Impressora não imprime" />
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder="Descreva o problema em detalhes..." />
          </div>
          <div className="space-y-1">
            <Label>Fotos (opcional)</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                setFiles((prev) => [...prev, ...list]);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Paperclip className="w-4 h-4 mr-2" />Anexar imagens
            </Button>
            {previews.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {previews.map((src, i) => (
                  <div key={i} className="relative">
                    <img src={src} alt={`Prévia ${i + 1}`} className="w-20 h-20 object-cover rounded-md border" />
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {previews.length === 0 && (
              <div className="text-xs text-muted-foreground flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Nenhuma imagem anexada</div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>Cancelar</Button>
          <Button onClick={submit} disabled={uploading}>{uploading ? "Enviando..." : "Enviar chamado"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
