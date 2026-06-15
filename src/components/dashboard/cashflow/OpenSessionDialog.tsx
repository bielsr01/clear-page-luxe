import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { usePreviousCashClose } from "@/hooks/usePreviousCashClose";
import { brl } from "@/lib/format";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  restaurantId: string;
  onOpened?: () => void;
}

export function OpenSessionDialog({ open, onOpenChange, restaurantId, onOpened }: Props) {
  const { user } = useAuth();
  const { data: prevClose } = usePreviousCashClose(restaurantId);
  const [amount, setAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);


  // Sugere o valor de fechamento do caixa anterior
  useEffect(() => {
    if (open) {
      setAmount(prevClose != null ? String(prevClose.toFixed(2)) : "0");
      setNotes("");
    }
  }, [open, prevClose]);

  const value = Number(String(amount).replace(",", "."));
  const isDifferent = useMemo(() => {
    if (prevClose == null) return false;
    if (isNaN(value)) return false;
    return Math.abs(value - Number(prevClose)) > 0.001;
  }, [value, prevClose]);

  const handleOpen = async () => {
    if (!user?.id) return;
    if (isNaN(value) || value < 0) {
      toast.error("Valor inicial inválido");
      return;
    }
    if (isDifferent && !notes.trim()) {
      toast.error("Informe o motivo da diferença em relação ao fechamento anterior");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("cash_register_sessions").insert({
      restaurant_id: restaurantId,
      opened_by: user.id,
      opening_amount: value,
      opening_notes: notes || null,
      status: "open" as const,
    } as any);
    setBusy(false);
    if (error) {
      if (error.code === "23505") toast.error("Já existe um caixa aberto para esta unidade");
      else toast.error(error.message);
      return;
    }
    toast.success("Caixa aberto");
    setAmount("0");
    setNotes("");
    onOpenChange(false);
    onOpened?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abrir caixa</DialogTitle>
          <DialogDescription>
            {prevClose != null
              ? `Sugestão baseada no fechamento anterior: ${brl(Number(prevClose))}. Ajuste se necessário.`
              : "Informe o valor inicial em dinheiro presente na gaveta."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Valor inicial (R$)</Label>
            <Input type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>
              Observação {isDifferent ? <span className="text-destructive">(obrigatória — valor difere do fechamento anterior)</span> : "(opcional)"}
            </Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isDifferent ? "Explique o motivo da diferença…" : ""}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleOpen} disabled={busy}>Abrir caixa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
