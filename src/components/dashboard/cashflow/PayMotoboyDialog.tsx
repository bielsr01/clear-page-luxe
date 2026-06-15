import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { Bike } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  restaurantId: string;
  sessionId: string;
  sessionOpenedAt: string;
  onDone?: () => void;
}

const SENT_STATUSES = ["out_for_delivery", "delivered"];

export function PayMotoboyDialog({ open, onOpenChange, restaurantId, sessionId, sessionOpenedAt, onDone }: Props) {
  const { user } = useAuth();
  const [method, setMethod] = useState<"cash" | "pix">("cash");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const feesQ = useQuery({
    queryKey: ["motoboy-fees", restaurantId, sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("delivery_fee, external_source, order_type, status")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", sessionOpenedAt)
        .in("status", SENT_STATUSES as any);
      if (error) throw error;
      let own = 0, ifood = 0, quero = 0;
      for (const o of (data as any[]) ?? []) {
        const fee = Number(o.delivery_fee ?? 0);
        if (!fee) continue;
        if (o.external_source === "ifood") ifood += fee;
        else if (o.external_source === "quero") quero += fee;
        else if (o.order_type === "delivery") own += fee;
      }
      return { own, ifood, quero, total: own + ifood + quero };
    },
    enabled: open && !!restaurantId && !!sessionId,
    staleTime: 5_000,
  });

  const total = feesQ.data?.total ?? 0;

  useEffect(() => {
    if (open) {
      setMethod("cash");
      setNotes("");
      setAmount("");
    }
  }, [open]);

  useEffect(() => {
    if (open && feesQ.data) {
      setAmount(total > 0 ? total.toFixed(2) : "");
    }
  }, [open, feesQ.data]);

  const value = Number(String(amount).replace(",", "."));
  const differs = !isNaN(value) && Math.abs(value - total) > 0.001;

  const submit = async () => {
    if (isNaN(value) || value <= 0) {
      toast.error("Informe um valor maior que zero");
      return;
    }
    if (differs && !notes.trim()) {
      toast.error("Observação obrigatória quando o valor é diferente do sugerido");
      return;
    }
    setBusy(true);
    const desc = `Pagamento motoboy (${method === "cash" ? "espécie" : "pix"})` +
      (notes.trim() ? ` - ${notes.trim()}` : "");
    const { error } = await supabase.from("cash_movements").insert({
      restaurant_id: restaurantId,
      session_id: sessionId,
      type: "withdrawal" as any,
      method: method as any,
      amount: -Math.abs(value),
      description: desc,
      created_by: user?.id ?? null,
    } as any);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pagamento de motoboy registrado");
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bike className="w-5 h-5" /> Pagar motoboy</DialogTitle>
          <DialogDescription>
            Taxas de entrega acumuladas nesta sessão (pedidos enviados para entrega).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          <FeeCard label="Delivery próprio" value={feesQ.data?.own ?? 0} />
          <FeeCard label="iFood" value={feesQ.data?.ifood ?? 0} />
          <FeeCard label="Quero Delivery" value={feesQ.data?.quero ?? 0} />
        </div>

        <div className="rounded-md border p-3 bg-accent flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total sugerido</span>
          <span className="font-bold text-lg">{brl(total)}</span>
        </div>

        <div className="space-y-3 py-1">
          <div>
            <Label>Forma de pagamento</Label>
            <RadioGroup value={method} onValueChange={(v) => setMethod(v as any)} className="flex gap-4 mt-1">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="cash" id="moto-cash" />
                <Label htmlFor="moto-cash">Dinheiro (espécie)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="pix" id="moto-pix" />
                <Label htmlFor="moto-pix">Pix</Label>
              </div>
            </RadioGroup>
          </div>
          <div>
            <Label>Valor pago ao motoboy (R$)</Label>
            <Input type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Observação {differs && <span className="text-destructive">*</span>}</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={differs ? "Obrigatório: justifique a diferença do valor sugerido" : "Opcional"}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy} variant="destructive">Confirmar pagamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeeCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3 bg-background">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold">{brl(value)}</div>
    </div>
  );
}
