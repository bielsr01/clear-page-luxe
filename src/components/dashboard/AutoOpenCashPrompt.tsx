import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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

/**
 * Quando o horário programado de abertura chega, em vez de abrir o restaurante
 * automaticamente, mostra um popup FIXO (não pode ser fechado) pedindo a abertura
 * do caixa. O restaurante só abre depois que o caixa for aberto pelo OpenSessionDialog
 * (que já abre os dois juntos).
 */
export function AutoOpenCashPrompt({ restaurantId, openingHours, manualOverride, isOpen, onChanged }: Props) {
  const [, setTick] = useState(0);
  const [cashDlg, setCashDlg] = useState(false);
  const { isOpen: cashOpen, refetch } = useCashSession(restaurantId);

  // Re-avalia periodicamente
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const now = new Date();
  const ov = getEffectiveOverride(manualOverride, now);
  const withinSchedule = isWithinSchedule(openingHours, now);
  // Override "closed" ativo significa que o dono fechou manualmente — não exibir popup.
  const blockedByOverride = ov?.type === "closed";
  // Popup aparece quando: dentro do horário programado, sem caixa aberto, sem override "closed".
  // (Ignoramos isOpen — se está dentro do horário e sem caixa, precisa abrir o caixa de qualquer forma.)
  const show = withinSchedule && !cashOpen && !blockedByOverride;

  return (
    <>
      <Dialog open={show}>
        <DialogContent
          className="max-w-lg [&>button]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="mx-auto mb-2 w-14 h-14 rounded-full bg-primary/10 grid place-items-center">
              <Store className="w-8 h-8 text-primary" />
            </div>
            <DialogTitle className="text-center text-2xl">Hora de abrir o restaurante</DialogTitle>
            <DialogDescription className="text-center text-base pt-2">
              O horário programado de abertura chegou. Para começar a receber pedidos,
              é necessário abrir o caixa.
              <br /><br />
              <strong>O restaurante será aberto automaticamente após a abertura do caixa.</strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button size="lg" onClick={() => setCashDlg(true)} className="w-full sm:w-auto">
              Abrir Restaurante e Caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
