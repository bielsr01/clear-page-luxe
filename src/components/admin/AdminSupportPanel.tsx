import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { MessageCircle, PlayCircle, CheckCircle2, Trash2 } from "lucide-react";

type Status = "open" | "in_progress" | "completed";

interface Ticket {
  id: string;
  restaurant_id: string;
  subject: string;
  description: string;
  photos: string[];
  status: Status;
  admin_notes: string | null;
  created_at: string;
  in_progress_at: string | null;
  completed_at: string | null;
  restaurants?: { name: string; phone: string | null; slug: string } | null;
}

const statusLabel: Record<Status, string> = {
  open: "Aberto",
  in_progress: "Em atendimento",
  completed: "Concluído",
};

const statusColor: Record<Status, string> = {
  open: "bg-amber-500 text-white",
  in_progress: "bg-blue-500 text-white",
  completed: "bg-emerald-600 text-white",
};

function waLink(phone: string | null | undefined, subject: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const full = digits.length <= 11 ? `55${digits}` : digits;
  const msg = encodeURIComponent(`Olá! Sobre seu chamado de suporte: "${subject}"`);
  return `https://wa.me/${full}?text=${msg}`;
}

export function AdminSupportPanel() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"open" | "in_progress" | "completed">("open");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("support_tickets")
      .select("id,restaurant_id,subject,description,photos,status,admin_notes,created_at,in_progress_at,completed_at,restaurants(name,phone,slug)")
      .order("created_at", { ascending: false });
    setTickets(((data as any) ?? []) as Ticket[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin-support-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const setStatus = async (t: Ticket, status: Status) => {
    const patch: any = { status };
    if (status === "in_progress") patch.in_progress_at = new Date().toISOString();
    if (status === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await supabase.from("support_tickets").update(patch).eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success(`Chamado marcado como ${statusLabel[status]}`);
  };

  const saveNotes = async (t: Ticket, notes: string) => {
    const { error } = await supabase.from("support_tickets").update({ admin_notes: notes }).eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Resposta salva");
  };

  const remove = async (t: Ticket) => {
    if (!confirm("Excluir este chamado?")) return;
    const { error } = await supabase.from("support_tickets").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Chamado excluído");
  };

  const filtered = tickets.filter((t) => t.status === tab);
  const counts = {
    open: tickets.filter((t) => t.status === "open").length,
    in_progress: tickets.filter((t) => t.status === "in_progress").length,
    completed: tickets.filter((t) => t.status === "completed").length,
  };

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="open">
            Abertos {counts.open > 0 && <Badge className="ml-2 bg-destructive text-destructive-foreground">{counts.open}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="in_progress">Em atendimento ({counts.in_progress})</TabsTrigger>
          <TabsTrigger value="completed">Concluídos ({counts.completed})</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4 space-y-3">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhum chamado nesta categoria.</CardContent></Card>
          ) : (
            filtered.map((t) => (
              <AdminTicketCard
                key={t.id}
                ticket={t}
                onSetStatus={setStatus}
                onSaveNotes={saveNotes}
                onDelete={remove}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AdminTicketCard({
  ticket,
  onSetStatus,
  onSaveNotes,
  onDelete,
}: {
  ticket: Ticket;
  onSetStatus: (t: Ticket, s: Status) => void;
  onSaveNotes: (t: Ticket, n: string) => void;
  onDelete: (t: Ticket) => void;
}) {
  const [notes, setNotes] = useState(ticket.admin_notes ?? "");
  const wa = waLink(ticket.restaurants?.phone, ticket.subject);

  return (
    <Card>
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="font-semibold">{ticket.subject}</div>
            <div className="text-xs text-muted-foreground">
              {ticket.restaurants?.name ?? "—"} · Aberto em {new Date(ticket.created_at).toLocaleString("pt-BR")}
            </div>
          </div>
          <Badge className={statusColor[ticket.status]}>{statusLabel[ticket.status]}</Badge>
        </div>

        <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>

        {ticket.photos?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {ticket.photos.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt={`Foto ${i + 1}`} className="w-24 h-24 object-cover rounded-md border" />
              </a>
            ))}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Resposta / notas internas</label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Escreva uma resposta visível para o restaurante..." />
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => onSaveNotes(ticket, notes)}>Salvar resposta</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
          {wa ? (
            <Button asChild size="sm" variant="outline" className="text-emerald-600 border-emerald-600 hover:bg-emerald-50">
              <a href={wa} target="_blank" rel="noreferrer">
                <MessageCircle className="w-4 h-4 mr-1" /> WhatsApp da loja
              </a>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Loja sem WhatsApp cadastrado</span>
          )}
          {ticket.status === "open" && (
            <Button size="sm" onClick={() => onSetStatus(ticket, "in_progress")}>
              <PlayCircle className="w-4 h-4 mr-1" /> Marcar em atendimento
            </Button>
          )}
          {ticket.status === "in_progress" && (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onSetStatus(ticket, "completed")}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> Concluir
            </Button>
          )}
          {ticket.status === "completed" && (
            <Button size="sm" variant="outline" onClick={() => onSetStatus(ticket, "in_progress")}>Reabrir</Button>
          )}
          <div className="ml-auto">
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onDelete(ticket)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
