import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { isOpenNow, ManualOverride, OpeningHours } from "@/lib/hours";

interface Props {
  restaurantId: string;
  openingHours: OpeningHours | null;
  manualOverride: ManualOverride;
  isOpen: boolean;
  onGoToCashFlow: () => void;
}

/**
 * Detecta quando o restaurante fechou automaticamente pelo horário programado
 * e ainda existe um caixa aberto. Mostra um popup grande pedindo o fechamento
 * do caixa e fecha o restaurante (is_open=false) imediatamente.
 */
export function AutoCloseCashPrompt({ restaurantId, openingHours, manualOverride, isOpen, onGoToCashFlow }: Props) {
  const qc = useQueryClient();
  const [, setTick] = useState(0);
  const [show, setShow] = useState(false);

  // Re-avalia a cada 30s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const { data: openSession } = useQuery({
    queryKey: ["autoClose-openSession", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("cash_register_sessions")
        .select("id")
        .eq("restaurant_id", restaurantId)
        .eq("status", "open")
        .maybeSingle();
      return data;
    },
    enabled: !!restaurantId,
    refetchInterval: 30_000,
  });

  // Realtime para sessões de caixa
  useEffect(() => {
    if (!restaurantId) return;
    const ch = supabase
      .channel(`autoclose-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cash_register_sessions", filter: `restaurant_id=eq.${restaurantId}` },
        () => qc.invalidateQueries({ queryKey: ["autoClose-openSession", restaurantId] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [restaurantId, qc]);

  const now = new Date();
  const scheduledOpen = isOpenNow(openingHours, manualOverride, now);
  const hasManualOverride = !!(manualOverride && (!manualOverride.until || new Date(manualOverride.until).getTime() > now.getTime()));
  // Fechado pelo horário programado: sem override ativo E fora do horário
  const closedBySchedule = !scheduledOpen && !hasManualOverride;

  useEffect(() => {
    if (closedBySchedule && openSession?.id) {
      if (isOpen) {
        // Fecha o restaurante automaticamente, mas mantém o caixa aberto até o fechamento manual definitivo.
        (async () => {
          try {
            await supabase.from("restaurants").update({ is_open: false }).eq("id", restaurantId);
          } catch (error) {
            console.error("Falha ao fechar restaurante automaticamente", error);
          }
        })();
      }
      setShow(true);
    } else if (!openSession?.id) {
      setShow(false);
    }
  }, [closedBySchedule, openSession?.id, isOpen, restaurantId]);

  if (!show) return null;

  return (
    <div className="absolute inset-0 z-40 bg-background/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-lg border bg-background shadow-lg p-6">
        <div className="mx-auto mb-2 w-14 h-14 rounded-full bg-destructive/10 grid place-items-center">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-center text-2xl font-semibold">Restaurante fechado</h2>
        <p className="text-center text-base pt-2 text-muted-foreground">
          O restaurante foi fechado automaticamente pelo horário programado, mas o caixa ainda está aberto.
          <br /><br />
          <strong className="text-foreground">É necessário fechar o caixa manualmente.</strong>
        </p>
        <div className="flex justify-center pt-6">
          <Button size="lg" onClick={onGoToCashFlow}>
            Ir para Fluxo de Caixa
          </Button>
        </div>
      </div>
    </div>
  );
}
