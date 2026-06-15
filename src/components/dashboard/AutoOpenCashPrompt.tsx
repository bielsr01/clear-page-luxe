import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Store } from "lucide-react";
import { isWithinSchedule, getEffectiveOverride, ManualOverride, OpeningHours } from "@/lib/hours";
import { useCashSession } from "@/hooks/useCashSession";
import { OpenSessionDialog } from "@/components/dashboard/cashflow/OpenSessionDialog";

interface Props {
  restaurantId: string;
  openingHours: OpeningHours | null;
  manualOverride: ManualOverride;
  isOpen: boolean;
  onChanged?: () => void;
}

export function AutoOpenCashPrompt({ restaurantId, openingHours, manualOverride, onChanged }: Props) {
  const [, setTick] = useState(0);
  const [cashDlg, setCashDlg] = useState(false);
  const { isOpen: cashOpen, refetch } = useCashSession(restaurantId);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const now = new Date();
  const ov = getEffectiveOverride(manualOverride, now);
  const withinSchedule = isWithinSchedule(openingHours, now);
  const blockedByOverride = ov?.type === "closed";
  const show = withinSchedule && !cashOpen && !blockedByOverride;

  return (
    <>
      {show && (
        <div className="absolute inset-0 z-40 bg-background/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-lg border bg-background shadow-lg p-6">
            <div className="mx-auto mb-2 w-14 h-14 rounded-full bg-primary/10 grid place-items-center">
              <Store className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-center text-2xl font-semibold">Hora de abrir o restaurante</h2>
            <p className="text-center text-base pt-2 text-muted-foreground">
              O horário programado de abertura chegou. Para começar a receber pedidos,
              é necessário abrir o caixa.
              <br /><br />
              <strong className="text-foreground">O restaurante será aberto automaticamente após a abertura do caixa.</strong>
            </p>
            <div className="flex justify-center pt-6">
              <Button size="lg" onClick={() => setCashDlg(true)}>
                Abrir Restaurante e Caixa
              </Button>
            </div>
          </div>
        </div>
      )}

      <OpenSessionDialog
        open={cashDlg}
        onOpenChange={setCashDlg}
        restaurantId={restaurantId}
        onOpened={() => {
          refetch();
          onChanged?.();
        }}
      />
    </>
  );
}
