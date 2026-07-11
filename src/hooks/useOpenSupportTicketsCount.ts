import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const KEY = "support-admin-lastSeen";

/**
 * Conta CHAMADOS (não mensagens) pendentes para o admin:
 * - chamados em status 'open' (ainda não atendidos)
 * - ou chamados com mensagem nova do restaurante desde a última visualização
 * Zera com markSeen() ao abrir a aba Suporte no painel admin.
 */
export function useOpenSupportTicketsCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const lastSeen = localStorage.getItem(KEY) || "1970-01-01T00:00:00Z";

    const { data: openTickets } = await supabase
      .from("support_tickets")
      .select("id")
      .eq("status", "open");
    const openIds = new Set(((openTickets ?? []) as any[]).map((t) => t.id));

    const { data: newMsgs } = await supabase
      .from("support_ticket_messages")
      .select("ticket_id")
      .eq("sender_role", "manager")
      .gt("created_at", lastSeen);
    const msgIds = new Set(((newMsgs ?? []) as any[]).map((m) => m.ticket_id));

    setCount(new Set<string>([...openIds, ...msgIds]).size);
  }, []);

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("open-support-tickets")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_tickets" },
        () => refresh()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_ticket_messages" },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [refresh]);

  const markSeen = useCallback(() => {
    localStorage.setItem(KEY, new Date().toISOString());
    refresh();
  }, [refresh]);

  return { count, markSeen };
}
