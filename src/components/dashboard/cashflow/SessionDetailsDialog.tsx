import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowDownCircle, ArrowUpCircle, DoorOpen, DoorClosed, ShoppingBag } from "lucide-react";
import { brl } from "@/lib/format";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sessionId: string | null;
  openingAmount: number;
}

interface ReconRow {
  method: string;
  gross: number;
  net: number;
}

const METHOD_LABEL: Record<string, string> = {
  cash: "Espécie",
  pix: "PIX",
  card: "Cartão",
};

const MOVEMENT_LABEL: Record<string, string> = {
  order_cash: "Venda (espécie)",
  change_out: "Troco",
  withdrawal: "Sangria",
  supply: "Suprimento",
  adjustment: "Ajuste",
  opening: "Abertura",
};

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Espécie",
  pix: "PIX",
  card: "Cartão",
  credit_card: "Crédito",
  debit_card: "Débito",
};

type TimelineEvent = {
  at: string;
  kind: "open" | "close" | "order" | "in" | "out";
  title: string;
  amount?: number;
  detail?: string;
  user?: string | null;
};

export function SessionDetailsDialog({ open, onOpenChange, sessionId, openingAmount }: Props) {
  const recon = useQuery({
    queryKey: ["cash-session-details", sessionId],
    enabled: !!sessionId && open,
    queryFn: async (): Promise<ReconRow[]> => {
      const { data, error } = await supabase
        .from("payment_reconciliation")
        .select("method, gross, net")
        .eq("session_id", sessionId!)
        .eq("platform", "cash_session");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        method: r.method,
        gross: Number(r.gross ?? 0),
        net: Number(r.net ?? 0),
      }));
    },
  });

  const timeline = useQuery({
    queryKey: ["cash-session-timeline", sessionId],
    enabled: !!sessionId && open,
    queryFn: async (): Promise<{ events: TimelineEvent[]; openedBy: string | null; closedBy: string | null; openedAt: string | null; closedAt: string | null }> => {
      const [sessionRes, movRes, wdRes, ordersRes] = await Promise.all([
        supabase
          .from("cash_register_sessions")
          .select("opened_at, closed_at, opened_by, closed_by, opening_notes, closing_notes")
          .eq("id", sessionId!)
          .maybeSingle(),
        supabase
          .from("cash_movements")
          .select("id, type, amount, description, order_id, created_at, created_by")
          .eq("session_id", sessionId!),
        supabase
          .from("cash_withdrawals")
          .select("id, amount, reason, created_at, created_by")
          .eq("session_id", sessionId!),
        supabase
          .from("orders")
          .select("id, order_number, total, payment_method, created_at")
          .eq("cash_session_id", sessionId!),
      ]);

      const session: any = sessionRes.data ?? {};
      const movs: any[] = movRes.data ?? [];
      const wds: any[] = wdRes.data ?? [];
      const orders: any[] = ordersRes.data ?? [];

      const userIds = Array.from(
        new Set(
          [session.opened_by, session.closed_by, ...movs.map((m) => m.created_by), ...wds.map((w) => w.created_by)].filter(Boolean),
        ),
      );
      const profMap: Record<string, string> = {};
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
        for (const p of profs ?? []) profMap[(p as any).id] = (p as any).full_name ?? "—";
      }

      const orderById: Record<string, any> = {};
      for (const o of orders) orderById[o.id] = o;

      const events: TimelineEvent[] = [];

      if (session.opened_at) {
        events.push({
          at: session.opened_at,
          kind: "open",
          title: "Abertura de caixa",
          amount: openingAmount,
          detail: session.opening_notes || undefined,
          user: profMap[session.opened_by] ?? null,
        });
      }

      // Orders (entradas automáticas por finalização de pedido)
      for (const o of orders) {
        const pm = PAYMENT_LABEL[o.payment_method] ?? o.payment_method ?? "—";
        events.push({
          at: o.created_at,
          kind: "order",
          title: `Pedido #${o.order_number ?? "—"}`,
          amount: Number(o.total ?? 0),
          detail: `${pm} · id ${String(o.id).slice(0, 8)}`,
        });
      }

      // Cash movements (entradas/saídas manuais e automáticas)
      for (const m of movs) {
        const amt = Number(m.amount ?? 0);
        const isOut = amt < 0 || m.type === "withdrawal" || m.type === "change_out";
        const orderRef = m.order_id ? orderById[m.order_id] : null;
        const detailParts: string[] = [];
        if (m.description) detailParts.push(m.description);
        if (orderRef) detailParts.push(`Pedido #${orderRef.order_number ?? String(m.order_id).slice(0, 8)}`);
        else if (m.order_id) detailParts.push(`Pedido id ${String(m.order_id).slice(0, 8)}`);
        // Skip opening duplicates already shown
        if (m.type === "opening") continue;
        // Skip order_cash if we already added the order event (avoid duplication)
        if (m.type === "order_cash" && m.order_id && orderById[m.order_id]) continue;

        events.push({
          at: m.created_at,
          kind: isOut ? "out" : "in",
          title: MOVEMENT_LABEL[m.type] ?? m.type,
          amount: Math.abs(amt),
          detail: detailParts.join(" · ") || undefined,
          user: profMap[m.created_by] ?? null,
        });
      }

      // Withdrawals (sangrias manuais)
      for (const w of wds) {
        events.push({
          at: w.created_at,
          kind: "out",
          title: "Sangria",
          amount: Number(w.amount ?? 0),
          detail: w.reason || undefined,
          user: profMap[w.created_by] ?? null,
        });
      }

      if (session.closed_at) {
        events.push({
          at: session.closed_at,
          kind: "close",
          title: "Fechamento de caixa",
          detail: session.closing_notes || undefined,
          user: profMap[session.closed_by] ?? null,
        });
      }

      events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

      return {
        events,
        openedBy: profMap[session.opened_by] ?? null,
        closedBy: profMap[session.closed_by] ?? null,
        openedAt: session.opened_at ?? null,
        closedAt: session.closed_at ?? null,
      };
    },
  });

  const iconFor = (k: TimelineEvent["kind"]) => {
    switch (k) {
      case "open": return <DoorOpen className="h-4 w-4 text-success" />;
      case "close": return <DoorClosed className="h-4 w-4 text-muted-foreground" />;
      case "order": return <ShoppingBag className="h-4 w-4 text-primary" />;
      case "in": return <ArrowDownCircle className="h-4 w-4 text-success" />;
      case "out": return <ArrowUpCircle className="h-4 w-4 text-destructive" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do caixa</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Valor inicial: </span>
              <b>{brl(openingAmount)}</b>
            </div>
            <div>
              <span className="text-muted-foreground">Aberto por: </span>
              <b>{timeline.data?.openedBy ?? "—"}</b>
              {timeline.data?.openedAt && (
                <div className="text-xs text-muted-foreground">
                  {new Date(timeline.data.openedAt).toLocaleString("pt-BR")}
                </div>
              )}
            </div>
            <div className="col-start-2">
              <span className="text-muted-foreground">Fechado por: </span>
              <b>{timeline.data?.closedBy ?? "—"}</b>
              {timeline.data?.closedAt && (
                <div className="text-xs text-muted-foreground">
                  {new Date(timeline.data.closedAt).toLocaleString("pt-BR")}
                </div>
              )}
            </div>
          </div>

          {recon.isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando…</div>
          ) : !recon.data?.length ? (
            <div className="text-sm text-muted-foreground">Sem dados de fechamento.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Método</TableHead>
                  <TableHead>Esperado</TableHead>
                  <TableHead>Contado</TableHead>
                  <TableHead>Diferença</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recon.data.map((r) => {
                  const expected = r.gross - r.net;
                  const diff = r.net;
                  return (
                    <TableRow key={r.method}>
                      <TableCell>{METHOD_LABEL[r.method] ?? r.method}</TableCell>
                      <TableCell>{brl(expected)}</TableCell>
                      <TableCell>{brl(r.gross)}</TableCell>
                      <TableCell className={diff > 0 ? "text-success" : diff < 0 ? "text-destructive" : ""}>
                        {brl(diff)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <div>
            <div className="text-sm font-semibold mb-2">Movimentações</div>
            {timeline.isLoading ? (
              <div className="text-sm text-muted-foreground">Carregando…</div>
            ) : !timeline.data?.events.length ? (
              <div className="text-sm text-muted-foreground">Sem movimentações.</div>
            ) : (
              <ol className="space-y-2">
                {timeline.data.events.map((e, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-md border p-2 text-sm">
                    <div className="mt-0.5">{iconFor(e.kind)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium truncate">{e.title}</div>
                        {typeof e.amount === "number" && (
                          <Badge
                            variant="outline"
                            className={
                              e.kind === "out"
                                ? "text-destructive border-destructive/40"
                                : e.kind === "in" || e.kind === "order" || e.kind === "open"
                                ? "text-success border-success/40"
                                : ""
                            }
                          >
                            {e.kind === "out" ? "- " : ""}
                            {brl(e.amount)}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(e.at).toLocaleString("pt-BR")}
                        {e.user ? ` · ${e.user}` : ""}
                      </div>
                      {e.detail && <div className="text-xs mt-0.5">{e.detail}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
