import { useEffect, useState } from "react";
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
  direction: "in" | "out";
  onDone?: () => void;
}

export function CashMovementDialog({ open, onOpenChange, restaurantId, sessionId, direction, onDone }: Props) {
  const { user } = useAuth();
  const [method, setMethod] = useState<"cash" | "pix">("cash");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMethod("cash");
      setAmount("");
      setNotes("");
    }
  }, [open]);

  const isIn = direction === "in";
  const title = isIn ? "Registrar entrada" : "Registrar retirada / sangria";
  const description = isIn
    ? "Lance uma entrada manual no caixa (ex.: troco inicial, reforço)."
    : "Lance uma retirada manual do caixa (ex.: sangria, pagamento fornecedor).";

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
    const signed = isIn ? value : -value;
    const { error } = await supabase.from("cash_movements").insert({
      restaurant_id: restaurantId,
      session_id: sessionId,
      type: (isIn ? "adjustment" : "withdrawal") as any,
      method: method as any,
      amount: signed,
      description: notes,
      created_by: user?.id ?? null,
    } as any);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(isIn ? "Entrada registrada" : "Retirada registrada");
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Forma</Label>
            <RadioGroup value={method} onValueChange={(v) => setMethod(v as "cash" | "pix")} className="flex gap-4 mt-1">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="cash" id="mv-cash" />
                <Label htmlFor="mv-cash">Dinheiro (espécie)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="pix" id="mv-pix" />
                <Label htmlFor="mv-pix">Pix</Label>
              </div>
            </RadioGroup>
          </div>
          <div>
            <Label>Valor (R$)</Label>
            <Input type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Motivo</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isIn ? "Ex.: reforço de troco, aporte..." : "Ex.: sangria, pagamento fornecedor..."}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy} variant={isIn ? "default" : "destructive"}>
            {isIn ? "Registrar entrada" : "Registrar retirada"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
