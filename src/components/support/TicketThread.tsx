import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  sender_id: string | null;
  sender_role: "admin" | "manager";
  body: string;
  created_at: string;
}

export function TicketThread({
  ticketId,
  myRole,
}: {
  ticketId: string;
  myRole: "admin" | "manager";
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("support_ticket_messages")
      .select("id,sender_id,sender_role,body,created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setMessages(((data as any) ?? []) as Message[]);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`ticket-msgs-${ticketId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${ticketId}` },
        (payload) => setMessages((m) => [...m, payload.new as Message])
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    const body = text.trim();
    if (!body || !user?.id) return;
    setSending(true);
    const { error } = await supabase.from("support_ticket_messages").insert({
      ticket_id: ticketId,
      sender_id: user.id,
      sender_role: myRole,
      body,
    });
    setSending(false);
    if (error) return toast.error(error.message);
    setText("");
  };

  return (
    <div className="border rounded-md bg-muted/30">
      <div
        ref={scrollRef}
        className="max-h-64 overflow-y-auto p-3 space-y-2"
      >
        {messages.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">
            Nenhuma resposta ainda.
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.sender_role === myRole;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm",
                    mine
                      ? "bg-primary text-primary-foreground"
                      : "bg-background border"
                  )}
                >
                  <div className="text-[10px] font-semibold opacity-70 mb-0.5">
                    {m.sender_role === "admin" ? "Suporte" : "Restaurante"}
                  </div>
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className="text-[10px] opacity-70 mt-1 text-right">
                    {new Date(m.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="flex gap-2 p-2 border-t bg-background rounded-b-md">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          placeholder="Digite uma resposta..."
          className="min-h-[38px] resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button size="sm" onClick={send} disabled={sending || !text.trim()}>
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
