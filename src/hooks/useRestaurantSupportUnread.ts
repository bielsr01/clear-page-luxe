import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const key = (restaurantId: string) => `support-lastSeen:${restaurantId}`;

/**
 * Conta atualizações não vistas dos chamados de suporte do restaurante:
 * - novas mensagens do admin
 * - mudanças de status (updated_at posterior ao lastSeen)
 * Zera quando markSeen() é chamado (ao abrir a aba Suporte).
 */
export function useRestaurantSupportUnread(restaurantId: string | undefined) {
  const [count, setCount] = useState(0);

  const getLastSeen = () =>
    (restaurantId && localStorage.getItem(key(restaurantId))) || "1970-01-01T00:00:00Z";

  const refresh = useCallback(async () => {
    if (!restaurantId) return;
    const lastSeen = getLastSeen();

    const { data: tickets } = await supabase
      .from("support_tickets")
      .select("id,created_at,updated_at")
      .eq("restaurant_id", restaurantId);

    const ids = (tickets ?? []).map((t: any) => t.id);
    // Só conta mudanças posteriores à criação (ignora a inserção inicial feita pelo próprio restaurante).
    const statusChanges = (tickets ?? []).filter((t: any) => {
      const updated = new Date(t.updated_at).getTime();
      const created = new Date(t.created_at).getTime();
      return updated > new Date(lastSeen).getTime() && updated - created > 1500;
    }).length;

    let msgChanges = 0;
    if (ids.length) {
      const { count: c } = await supabase
        .from("support_ticket_messages")
        .select("id", { count: "exact", head: true })
        .in("ticket_id", ids)
        .eq("sender_role", "admin")
        .gt("created_at", lastSeen);
      msgChanges = c ?? 0;
    }
    setCount(statusChanges + msgChanges);
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
