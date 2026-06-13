import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/format";

interface Row {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opening_amount: number;
  expected_cash: number | null;
  counted_cash: number | null;
  difference: number | null;
  status: "open" | "closed";
}

export function SessionHistoryList({ restaurantId }: { restaurantId: string }) {
  const q = useQuery({
    queryKey: ["cash-history", restaurantId],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("cash_register_sessions")
        .select("id, opened_at, closed_at, opening_amount, expected_cash, counted_cash, difference, status")
        .eq("restaurant_id", restaurantId)
        .order("opened_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
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
                <TableHead>Esperado</TableHead>
                <TableHead>Contado</TableHead>
                <TableHead>Diferença</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.map((r) => {
                const diff = r.difference ?? 0;
                const status = r.status === "open"
                  ? <Badge className="bg-success text-success-foreground">Aberto</Badge>
                  : diff === 0
                    ? <Badge variant="secondary">Sem diferença</Badge>
                    : diff > 0
                      ? <Badge className="bg-success text-success-foreground">Sobra</Badge>
                      : <Badge variant="destructive">Falta</Badge>;
                return (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.opened_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell>{r.closed_at ? new Date(r.closed_at).toLocaleString("pt-BR") : "—"}</TableCell>
                    <TableCell>{brl(Number(r.opening_amount))}</TableCell>
                    <TableCell>{r.expected_cash != null ? brl(Number(r.expected_cash)) : "—"}</TableCell>
                    <TableCell>{r.counted_cash != null ? brl(Number(r.counted_cash)) : "—"}</TableCell>
                    <TableCell className={diff > 0 ? "text-success" : diff < 0 ? "text-destructive" : ""}>
                      {r.difference != null ? brl(Number(r.difference)) : "—"}
                    </TableCell>
                    <TableCell>{status}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
