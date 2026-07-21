import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PromoCalendarRow = {
  id: string;
  restaurant_id: string | null;
  name: string;
  event_date: string; // yyyy-mm-dd
  message: string;
  reminder_days_before: number | null;
  is_recurring: boolean;
  dismissed_for_year: number | null;
};

/**
 * Retorna a próxima ocorrência da data:
 * - Se recorrente, aplica o dia/mês ao ano atual (ou ao próximo, se já passou hoje).
 * - Se não recorrente, retorna a própria data.
 * Também retorna o ano de referência da ocorrência.
 */
export function nextOccurrence(row: Pick<PromoCalendarRow, "event_date" | "is_recurring">, today = new Date()) {
  const [y, m, d] = row.event_date.split("-").map((n) => parseInt(n, 10));
  if (!row.is_recurring) {
    const dt = new Date(y, m - 1, d);
    return { date: dt, year: dt.getFullYear() };
  }
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let occ = new Date(today.getFullYear(), m - 1, d);
  if (occ < todayMid) occ = new Date(today.getFullYear() + 1, m - 1, d);
  return { date: occ, year: occ.getFullYear() };
}

export function isRowPending(row: PromoCalendarRow, today = new Date()) {
  const days = row.reminder_days_before;
  if (days == null || days < 0) return false;
  const { date: occ, year } = nextOccurrence(row, today);
  if (row.dismissed_for_year === year) return false;
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const reminderStart = new Date(occ);
  reminderStart.setDate(reminderStart.getDate() - days);
  return todayMid >= reminderStart && todayMid <= occ;
}

export function usePromoCalendarPendingCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const { data } = await supabase.from("promo_calendar_dates").select("*");
    const rows = (data ?? []) as PromoCalendarRow[];
    const now = new Date();
    setCount(rows.filter((r) => isRowPending(r, now)).length);
  }, []);

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("promo-calendar-pending")
      .on("postgres_changes", { event: "*", schema: "public", table: "promo_calendar_dates" }, () => refresh())
      .subscribe();
    // reavaliar todo minuto para virar o dia sem reload
    const t = setInterval(refresh, 60_000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(t);
    };
  }, [refresh]);

  return count;
}
