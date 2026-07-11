import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const key = (restaurantId: string) => `support-lastSeen:${restaurantId}`;

/**
 * Conta CHAMADOS (não mensagens) com atualização não vista pelo restaurante:
 * - mudou de status após a criação
 * - ou recebeu qualquer mensagem nova do admin
 * Zera com markSeen() ao abrir a aba Suporte.
 */
export function useRestaurantSupportUnread(restaurantId: string | undefined) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!restaurantId) return;
    const lastSeen = localStorage.getItem(key(restaurantId)) || "1970-01-01T00:00:00Z";
    const lastSeenMs = new Date(lastSeen).getTime();

    const { data: tickets } = await supabase
      .from("support_tickets")
      .select("id,created_at,updated_at")
      .eq("restaurant_id", restaurantId);

    const list = (tickets ?? []) as { id: string; created_at: string; updated_at: string }[];
    const ticketsWithStatusChange = new Set(
      list
        .filter((t) => {
          const u = new Date(t.updated_at).getTime();
          const c = new Date(t.created_at).getTime();
          return u > lastSeenMs && u - c > 1500;
        })
        .map((t) => t.id)
    );

    let ticketsWithNewMsg = new Set<string>();
    if (list.length) {
      const { data: msgs } = await supabase
        .from("support_ticket_messages")
        .select("ticket_id")
        .in("ticket_id", list.map((t) => t.id))
        .eq("sender_role", "admin")
        .gt("created_at", lastSeen);
      ticketsWithNewMsg = new Set(((msgs ?? []) as any[]).map((m) => m.ticket_id));
    }

    const union = new Set<string>([...ticketsWithStatusChange, ...ticketsWithNewMsg]);
    setCount(union.size);
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    refresh();
    const ch = supabase
      .channel(`rest-support-unread-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_tickets", filter: `restaurant_id=eq.${restaurantId}` },
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
  }, [restaurantId, refresh]);

  const markSeen = useCallback(() => {
    if (!restaurantId) return;
    localStorage.setItem(key(restaurantId), new Date().toISOString());
    setCount(0);
  }, [restaurantId]);

  return { count, markSeen };
}
