import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Conta chamados de suporte com status 'open' (novos, ainda não atendidos). */
export function useOpenSupportTicketsCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const { count: c } = await supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");
      if (!cancelled) setCount(c ?? 0);
    };
    refresh();
    const ch = supabase
      .channel("open-support-tickets")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_tickets" },
        () => refresh()
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, []);

  return count;
}
