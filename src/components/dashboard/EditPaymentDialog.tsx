import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { SPLIT_METHOD_LABELS, remainingAmount, validateSplits, type PaymentSplit, type SplitMethod } from "@/lib/paymentSplits";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  total: number;
  currentMethod: string;
  currentSplits?: PaymentSplit[] | null;
  onSaved: (r: { payment_method: string; payment_splits: PaymentSplit[] | null }) => void;
}

export function EditPaymentDialog({ open, onOpenChange, orderId, total, currentMethod, currentSplits, onSaved }: Props) {
  const [rows, setRows] = useState<{ method: SplitMethod; amount: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (currentSplits && currentSplits.length > 0) {
      setRows(currentSplits.map((s) => ({ method: s.method, amount: String(s.amount) })));
    } else {
      const m = (currentMethod in SPLIT_METHOD_LABELS ? currentMethod : "cash") as SplitMethod;
      setRows([{ method: m, amount: Number(total).toFixed(2) }]);
    }
  }, [open, currentMethod, currentSplits, total]);

  const parsed: PaymentSplit[] = rows.map((r) => ({ method: r.method, amount: Number(String(r.amount).replace(",", ".")) || 0 }));
  const rest = remainingAmount(parsed, total);
  const error = validateSplits(parsed, total);

  const update = (i: number, patch: Partial<{ method: SplitMethod; amount: string }>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addRow = () => setRows((rs) => [...rs, { method: "pix", amount: rest > 0 ? rest.toFixed(2) : "" }]);

  const save = async () => {
    if (error) return;
    setSaving(true);
    const { data, error: e } = await supabase.rpc("update_order_payment" as any, { _order_id: orderId, _splits: parsed as any });
    setSaving(false);
    if (e) { toast.error(e.message || "Não foi possível alterar o pagamento."); return; }
    toast.success("Forma de pagamento atualizada. O caixa já foi ajustado.");
    onSaved(data as any);
    onOpenChange(false);
  };

  return (
    !open ? null : (
      <div className="rounded-md border bg-muted/30 p-3 space-y-3 mt-2">
        <div className="font-semibold text-sm">Alterar forma de pagamento</div>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">Total do pedido: <span className="font-bold text-foreground">{brl(total)}</span></div>
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Select value={r.method} onValueChange={(v) => update(i, { method: v as SplitMethod })}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SPLIT_METHOD_LABELS) as SplitMethod[]).map((m) => (
                    <SelectItem key={m} value={m}>{SPLIT_METHOD_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input className="w-28" inputMode="decimal" value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} placeholder="0,00" />
              {rows.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))} aria-label="Remover">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addRow}><Plus className="h-4 w-4 mr-1" />Adicionar outra forma</Button>
          <div className={`text-sm ${rest === 0 ? "text-muted-foreground" : "text-destructive"}`}>
            {rest === 0 ? "Valores conferem com o total." : rest > 0 ? `Faltam ${brl(rest)}` : `Passou ${brl(-rest)} do total`}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={!!error || saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </div>
      </div>
    )
  );
}
