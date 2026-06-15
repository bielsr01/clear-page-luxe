import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { isOpenNow, ManualOverride, OpeningHours } from "@/lib/hours";
import { requestCashflowAction } from "@/lib/cashflowBus";

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
  const [dismissedSession, setDismissedSession] = useState<string | null>(null);

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
    if (closedBySchedule && openSession?.id && isOpen && dismissedSession !== openSession.id) {
      // Fecha o restaurante automaticamente
      (async () => {
        try {
          await supabase.from("restaurants").update({ is_open: false }).eq("id", restaurantId);
        } catch {}
      })();
      setShow(true);
    } else if (!openSession?.id) {
      setShow(false);
    }
  }, [closedBySchedule, openSession?.id, isOpen, restaurantId, dismissedSession]);

  const handleGo = () => {
    if (openSession?.id) setDismissedSession(openSession.id);
    setShow(false);
    onGoToCashFlow();
    setTimeout(() => requestCashflowAction("close"), 300);
  };

  return (
    <Dialog open={show} onOpenChange={(o) => { if (!o && openSession?.id) setDismissedSession(openSession.id); setShow(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="mx-auto mb-2 w-14 h-14 rounded-full bg-destructive/10 grid place-items-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <DialogTitle className="text-center text-2xl">Restaurante fechado</DialogTitle>
          <DialogDescription className="text-center text-base pt-2">
            O restaurante foi fechado automaticamente pelo horário programado, mas o caixa ainda está aberto.
            <br /><br />
            <strong>É necessário fechar o caixa manualmente.</strong>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button size="lg" onClick={handleGo} className="w-full sm:w-auto">
            Ir para Fluxo de Caixa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
