import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  restaurantId: string;
  onOpened?: () => void;
}

export function OpenSessionDialog({ open, onOpenChange, restaurantId, onOpened }: Props) {
  const { user } = useAuth();
  const [amount, setAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const handleOpen = async () => {
    if (!user?.id) return;
    const value = Number(String(amount).replace(",", "."));
    if (isNaN(value) || value < 0) {
      toast.error("Valor inicial inválido");
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
          <DialogDescription>Informe o valor inicial em dinheiro presente na gaveta.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Valor inicial (R$)</Label>
            <Input type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Observação (opcional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
