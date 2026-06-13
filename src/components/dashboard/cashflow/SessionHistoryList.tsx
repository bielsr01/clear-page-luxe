import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import { brl } from "@/lib/format";
import { SessionDetailsDialog } from "./SessionDetailsDialog";

interface Row {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opening_amount: number;
  expected_cash: number | null;
  counted_cash: number | null;
  difference: number | null;
  status: "open" | "closed";
  opening_notes: string | null;
  closing_notes: string | null;
}

interface ReconAgg {
  cash_diff: number;
  pix_diff: number;
  card_diff: number;
  pix_counted: number;
  card_counted: number;
}

const EPS = 0.005;

export function SessionHistoryList({ restaurantId }: { restaurantId: string }) {
  const [detail, setDetail] = useState<{ id: string; opening: number } | null>(null);

  const q = useQuery({
    queryKey: ["cash-history", restaurantId],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("cash_register_sessions")
        .select("id, opened_at, closed_at, opening_amount, expected_cash, counted_cash, difference, status, opening_notes, closing_notes")
        .eq("restaurant_id", restaurantId)
        .order("opened_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
    staleTime: 30_000,
  });

  const sessionIds = useMemo(() => (q.data ?? []).map((r) => r.id), [q.data]);

  const recon = useQuery({
    queryKey: ["cash-history-recon", restaurantId, sessionIds],
    enabled: sessionIds.length > 0,
    queryFn: async (): Promise<Record<string, ReconAgg>> => {
      const { data, error } = await supabase
        .from("payment_reconciliation")
        .select("session_id, method, gross, net")
        .eq("platform", "cash_session")
        .in("session_id", sessionIds);
      if (error) throw error;
      const map: Record<string, ReconAgg> = {};
      for (const r of data ?? []) {
        const id = (r as any).session_id as string;
        const m = (r as any).method as string;
        const gross = Number((r as any).gross ?? 0);
        const net = Number((r as any).net ?? 0);
        if (!map[id]) map[id] = { cash_diff: 0, pix_diff: 0, card_diff: 0, pix_counted: 0, card_counted: 0 };
        if (m === "cash") map[id].cash_diff = net;
        else if (m === "pix") { map[id].pix_diff = net; map[id].pix_counted = gross; }
        else if (m === "card") { map[id].card_diff = net; map[id].card_counted = gross; }
      }
      return map;
    },
    staleTime: 30_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico de caixas</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : !q.data?.length ? (
          <div className="text-sm text-muted-foreground">Nenhum caixa registrado.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aberto em</TableHead>
                <TableHead>Fechado em</TableHead>
                <TableHead>Inicial</TableHead>
                <TableHead>Espécie</TableHead>
                <TableHead>PIX</TableHead>
                <TableHead>Cartão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Obs.</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.map((r) => {
                const agg = recon.data?.[r.id];
                const cashDiff = r.difference ?? agg?.cash_diff ?? 0;
                const pixDiff = agg?.pix_diff ?? 0;
                const cardDiff = agg?.card_diff ?? 0;

                let status: JSX.Element;
                if (r.status === "open") {
                  status = <Badge className="bg-success text-success-foreground">Aberto</Badge>;
                } else {
                  const hasDiff =
                    Math.abs(cashDiff) > EPS ||
                    Math.abs(pixDiff) > EPS ||
                    Math.abs(cardDiff) > EPS;
                  status = hasDiff
                    ? <Badge variant="destructive">Diferença</Badge>
                    : <Badge className="bg-success text-success-foreground">Sem diferença</Badge>;
                }

                const cell = (counted: number | null | undefined, diff: number) => {
                  if (r.status === "open") return <span className="text-muted-foreground">—</span>;
                  return (
                    <div className="text-xs">
                      <div>{brl(Number(counted ?? 0))}</div>
                      <div className={diff > 0 ? "text-success" : diff < 0 ? "text-destructive" : "text-muted-foreground"}>
                        {diff === 0 ? "—" : `Δ ${brl(diff)}`}
                      </div>
                    </div>
                  );
                };

                return (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.opened_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell>{r.closed_at ? new Date(r.closed_at).toLocaleString("pt-BR") : "—"}</TableCell>
                    <TableCell>{brl(Number(r.opening_amount))}</TableCell>
                    <TableCell>{cell(r.counted_cash, cashDiff)}</TableCell>
                    <TableCell>{cell(agg?.pix_counted, pixDiff)}</TableCell>
                    <TableCell>{cell(agg?.card_counted, cardDiff)}</TableCell>
                    <TableCell>{status}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[220px]">
                      {r.opening_notes && <div><b>Abertura:</b> {r.opening_notes}</div>}
                      {r.closing_notes && <div><b>Fechamento:</b> {r.closing_notes}</div>}
                      {!r.opening_notes && !r.closing_notes && "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDetail({ id: r.id, opening: Number(r.opening_amount) })}
                        aria-label="Ver detalhes"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <SessionDetailsDialog
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        sessionId={detail?.id ?? null}
        openingAmount={detail?.opening ?? 0}
      />
    </Card>
  );
}
