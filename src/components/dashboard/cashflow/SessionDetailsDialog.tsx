import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

export function SessionDetailsDialog({ open, onOpenChange, sessionId, openingAmount }: Props) {
  const q = useQuery({
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalhes do caixa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Valor inicial (espécie): </span>
            <b>{brl(openingAmount)}</b>
          </div>
          {q.isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando…</div>
          ) : !q.data?.length ? (
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
                {q.data.map((r) => {
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
