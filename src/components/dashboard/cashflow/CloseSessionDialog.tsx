import { useEffect, useState } from "react";
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
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { cashSessionKey, cashSummaryKey, type CashSessionSummary } from "@/hooks/useCashSession";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: string;
  summary: CashSessionSummary | null;
  onClosed?: () => void;
}

export function CloseSessionDialog({ open, onOpenChange, sessionId, summary, onClosed }: Props) {
  const qc = useQueryClient();
  const [countedCash, setCountedCash] = useState("");
  const [countedPix, setCountedPix] = useState("");
  const [countedCard, setCountedCard] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (open && summary) {
      setCountedCash(String(summary.expected_cash ?? 0));
      setCountedPix(String(summary.expected_pix ?? summary.pix_sales ?? 0));
      setCountedCard(String(summary.card_sales ?? 0));
    }
  }, [open, summary]);

  const num = (v: string) => {
    const n = Number(String(v).replace(",", "."));
    return isNaN(n) ? 0 : n;
  };

  const diffCash = num(countedCash) - (summary?.expected_cash ?? 0);
  const diffPix = num(countedPix) - (summary?.expected_pix ?? summary?.pix_sales ?? 0);
  const diffCard = num(countedCard) - (summary?.card_sales ?? 0);

  const submit = async () => {
    setConfirmOpen(false);
    setBusy(true);
    const { error } = await (supabase.rpc as any)("close_cash_session", {
      _session_id: sessionId,
      _counted_cash: num(countedCash),
      _counted_pix: num(countedPix),
      _counted_card: num(countedCard),
      _notes: notes || null,
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    const rid = summary?.restaurant_id;
    // Fecha o restaurante automaticamente
    if (rid) {
      const { error: rErr } = await supabase
        .from("restaurants")
        .update({ manual_override: { type: "closed" } as any, is_open: false })
        .eq("id", rid);
      if (rErr) toast.warning(`Caixa fechado, mas falhou ao fechar o restaurante: ${rErr.message}`);
      else toast.success("Caixa e restaurante fechados");
    } else {
      toast.success("Caixa fechado");
    }
    setBusy(false);
    if (rid) {
      await qc.invalidateQueries({ queryKey: cashSessionKey(rid) });
      await qc.invalidateQueries({ queryKey: ["cash-history", rid] });
      await qc.invalidateQueries({ queryKey: ["cash-history-recon", rid] });
      await qc.invalidateQueries({ queryKey: ["previous-cash-close", rid] });
    }
    await qc.invalidateQueries({ queryKey: cashSummaryKey(sessionId) });
    onOpenChange(false);
    onClosed?.();
  };

  const fmtDiff = (d: number) => (d === 0 ? "Sem diferença" : d > 0 ? `Sobra de ${brl(d)}` : `Falta de ${brl(-d)}`);
  const diffCls = (d: number) => (d === 0 ? "text-muted-foreground" : d > 0 ? "text-success" : "text-destructive");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fechar caixa</DialogTitle>
          <DialogDescription>Confira os valores contados em cada forma de pagamento.</DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-4 py-2 text-sm">
          <div className="space-y-1">
            <div className="text-muted-foreground">Valor inicial</div>
            <div className="font-semibold">{brl(summary?.opening_amount ?? 0)}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Vendas totais</div>
            <div className="font-semibold">{brl(summary?.total_sales ?? 0)} ({summary?.orders_count ?? 0} pedidos)</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Entradas manuais</div>
            <div className="font-semibold">{brl(summary?.manual_in ?? 0)}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Retiradas manuais</div>
            <div className="font-semibold">{brl(summary?.manual_out ?? 0)}</div>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <FieldWithExpected label="Dinheiro" expected={summary?.expected_cash ?? 0} value={countedCash} onChange={setCountedCash} diff={diffCash} fmtDiff={fmtDiff} diffCls={diffCls} />
          <FieldWithExpected label="Pix" expected={summary?.expected_pix ?? summary?.pix_sales ?? 0} value={countedPix} onChange={setCountedPix} diff={diffPix} fmtDiff={fmtDiff} diffCls={diffCls} />
          <FieldWithExpected label="Cartão" expected={summary?.card_sales ?? 0} value={countedCard} onChange={setCountedCard} diff={diffCard} fmtDiff={fmtDiff} diffCls={diffCls} />
        </div>

        <div>
          <Label>Observação</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy} variant="destructive">Fechar caixa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldWithExpected({
  label, expected, value, onChange, diff, fmtDiff, diffCls,
}: {
  label: string; expected: number; value: string; onChange: (v: string) => void; diff: number;
  fmtDiff: (d: number) => string; diffCls: (d: number) => string;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type="number" step="0.01" value={value} onChange={(e) => onChange(e.target.value)} />
      <div className="text-xs text-muted-foreground">Esperado: {brl(expected)}</div>
      <div className={`text-xs ${diffCls(diff)}`}>{fmtDiff(diff)}</div>
    </div>
  );
}
