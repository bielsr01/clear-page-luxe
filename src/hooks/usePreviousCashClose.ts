import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePreviousCashClose(restaurantId: string | undefined) {
  return useQuery({
    queryKey: ["previous-cash-close", restaurantId],
    enabled: !!restaurantId,
    staleTime: 5_000,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase
        .from("cash_register_sessions")
        .select("counted_cash")
        .eq("restaurant_id", restaurantId!)
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const v = (data as any)?.counted_cash;
      return v == null ? null : Number(v);
    },
  });
}
