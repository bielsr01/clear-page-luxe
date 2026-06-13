import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CashSession {
  id: string;
  restaurant_id: string;
  opened_by: string;
  opened_at: string;
  opening_amount: number;
  opening_notes: string | null;
  status: "open" | "closed";
}

export interface CashSessionSummary {
  session_id: string;
  restaurant_id: string;
  opening_amount: number;
  status: "open" | "closed";
  opened_at: string;
  opened_by: string;
  cash_sales: number;
  pix_sales: number;
  card_sales: number;
  other_sales: number;
  total_sales: number;
  orders_count: number;
  manual_in: number;
  manual_out: number;
  expected_cash: number;
  total_movement: number;
}

export const cashSessionKey = (rid: string) => ["cash-session", rid] as const;
export const cashSummaryKey = (sid: string) => ["cash-session-summary", sid] as const;

export function useCashSession(restaurantId: string | undefined) {
  const qc = useQueryClient();

  const sessionQ = useQuery({
    queryKey: cashSessionKey(restaurantId ?? ""),
    queryFn: async (): Promise<CashSession | null> => {
      const { data, error } = await supabase
        .from("cash_register_sessions")
        .select("id, restaurant_id, opened_by, opened_at, opening_amount, opening_notes, status")
        .eq("restaurant_id", restaurantId!)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as CashSession) ?? null;
    },
    enabled: !!restaurantId,
    staleTime: 5_000,
  });

  const sessionId = sessionQ.data?.id;

  const summaryQ = useQuery({
    queryKey: cashSummaryKey(sessionId ?? ""),
    queryFn: async (): Promise<CashSessionSummary | null> => {
      const { data, error } = await (supabase as any)
        .from("v_cash_session_summary")
        .select("*")
        .eq("session_id", sessionId!)
        .maybeSingle();
      if (error) throw error;
      return (data as CashSessionSummary) ?? null;
    },
    enabled: !!sessionId,
    staleTime: 2_000,
  });

  // Realtime: invalidate on changes to relevant tables
  useEffect(() => {
    if (!restaurantId) return;
    const ch = supabase
      .channel(`cashflow-${restaurantId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cash_register_sessions", filter: `restaurant_id=eq.${restaurantId}` },
        () => {
          qc.invalidateQueries({ queryKey: cashSessionKey(restaurantId) });
          if (sessionId) qc.invalidateQueries({ queryKey: cashSummaryKey(sessionId) });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cash_movements", filter: `restaurant_id=eq.${restaurantId}` },
        () => {
          if (sessionId) qc.invalidateQueries({ queryKey: cashSummaryKey(sessionId) });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        () => {
          if (sessionId) qc.invalidateQueries({ queryKey: cashSummaryKey(sessionId) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [restaurantId, sessionId, qc]);

  return {
    session: sessionQ.data ?? null,
    summary: summaryQ.data ?? null,
    isLoading: sessionQ.isLoading,
    isOpen: !!sessionQ.data,
    refetch: () => {
      if (restaurantId) qc.invalidateQueries({ queryKey: cashSessionKey(restaurantId) });
      if (sessionId) qc.invalidateQueries({ queryKey: cashSummaryKey(sessionId) });
    },
  };
}
