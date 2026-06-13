import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  restaurantId: string;
  sessionId: string;
  onDone?: () => void;
}

export function CashMovementDialog({ open, onOpenChange, restaurantId, sessionId, onDone }: Props) {
  const { user } = useAuth();
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const value = Number(String(amount).replace(",", "."));
    if (isNaN(value) || value <= 0) {
      toast.error("Informe um valor maior que zero");
      return;
    }
    if (!notes.trim()) {
      toast.error("Informe o motivo da movimentação");
      return;
    }
    setBusy(true);
    const signed = direction === "in" ? value : -value;
    const { error } = await supabase.from("cash_movements").insert({
      restaurant_id: restaurantId,
      session_id: sessionId,
      type: (direction === "in" ? "adjustment" : "withdrawal") as any,
      amount: signed,
      description: notes,
      created_by: user?.id ?? null,
    } as any);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(direction === "in" ? "Entrada registrada" : "Retirada registrada");
    setAmount("");
    setNotes("");
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Movimentação de caixa</DialogTitle>
          <DialogDescription>Registre entradas ou retiradas em dinheiro. Cada movimentação fica auditada.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <RadioGroup value={direction} onValueChange={(v) => setDirection(v as "in" | "out")} className="flex gap-4">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="in" id="mv-in" />
              <Label htmlFor="mv-in">Entrada</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="out" id="mv-out" />
              <Label htmlFor="mv-out">Retirada / Sangria</Label>
            </div>
          </RadioGroup>
          <div>
            <Label>Valor (R$)</Label>
            <Input type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Motivo</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: troco, sangria, pagamento fornecedor..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy} variant={direction === "out" ? "destructive" : "default"}>
            {direction === "in" ? "Registrar entrada" : "Registrar retirada"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
