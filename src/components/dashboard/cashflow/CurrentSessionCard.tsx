import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/format";
import { ArrowDownCircle, ArrowUpCircle, LockOpen, Lock, RefreshCw, Bike } from "lucide-react";
import { useCashSession } from "@/hooks/useCashSession";
import { OpenSessionDialog } from "./OpenSessionDialog";
import { CashMovementDialog } from "./CashMovementDialog";
import { CloseSessionDialog } from "./CloseSessionDialog";
import { PayMotoboyDialog } from "./PayMotoboyDialog";
import { supabase } from "@/integrations/supabase/client";
import { onCashflowRequest } from "@/lib/cashflowBus";

interface Props {
  restaurantId: string;
}

export function CurrentSessionCard({ restaurantId }: Props) {
  const { session, summary, isOpen, refetch } = useCashSession(restaurantId);
  const [openDlg, setOpenDlg] = useState(false);
  const [closeDlg, setCloseDlg] = useState(false);
  const [inDlg, setInDlg] = useState(false);
  const [outDlg, setOutDlg] = useState(false);
  const [motoDlg, setMotoDlg] = useState(false);
  const [openedByName, setOpenedByName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    if (!session?.opened_by) { setOpenedByName(""); return; }
    supabase.from("profiles").select("full_name").eq("id", session.opened_by).maybeSingle()
      .then(({ data }) => { if (!cancelled) setOpenedByName((data as any)?.full_name ?? ""); });
    return () => { cancelled = true; };
  }, [session?.opened_by]);

  // Listen for external prompts (e.g. when the store is opened/closed)
  useEffect(() => {
    return onCashflowRequest((action) => {
      if (action === "open" && !isOpen) setOpenDlg(true);
      if (action === "close" && isOpen) setCloseDlg(true);
    });
  }, [isOpen]);

  if (!isOpen) {
    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle>Nenhum caixa aberto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Abra um caixa para começar a operar. Vendas de PDV ficam bloqueadas enquanto não houver caixa aberto.
            </p>
            <Button onClick={() => setOpenDlg(true)}><LockOpen className="w-4 h-4 mr-1" /> Abrir caixa</Button>
          </CardContent>
        </Card>
        <OpenSessionDialog open={openDlg} onOpenChange={setOpenDlg} restaurantId={restaurantId} onOpened={refetch} />
      </>
    );
  }

  const opened = session!.opened_at ? new Date(session!.opened_at) : null;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              Caixa aberto <Badge className="bg-success text-success-foreground">Ativo</Badge>
            </CardTitle>
            <div className="text-xs text-muted-foreground mt-1">
              {openedByName ? `${openedByName} • ` : ""}{opened ? `Aberto às ${opened.toLocaleString("pt-BR")}` : ""}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={refetch} title="Atualizar"><RefreshCw className="w-4 h-4" /></Button>
            <Button size="sm" variant="secondary" onClick={() => setInDlg(true)}>
              <ArrowDownCircle className="w-4 h-4 mr-1" /> Entrada
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setOutDlg(true)}>
              <ArrowUpCircle className="w-4 h-4 mr-1" /> Retirada
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setMotoDlg(true)}>
              <Bike className="w-4 h-4 mr-1" /> Pagar motoboy
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setCloseDlg(true)}>
              <Lock className="w-4 h-4 mr-1" /> Fechar caixa
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Valor inicial" value={brl(summary?.opening_amount ?? session!.opening_amount)} />
            <Stat label="Vendas em dinheiro" value={brl(summary?.cash_sales ?? 0)} />
            <Stat label="Vendas em Pix" value={brl(summary?.pix_sales ?? 0)} />
            <Stat label="Vendas em cartão" value={brl(summary?.card_sales ?? 0)} />
            <Stat label="Entradas manuais" value={brl(summary?.manual_in ?? 0)} />
            <Stat label="Retiradas manuais" value={brl(summary?.manual_out ?? 0)} />
            <Stat label="Dinheiro esperado" value={brl(summary?.expected_cash ?? 0)} highlight />
            <Stat label="Total geral" value={brl(summary?.total_movement ?? 0)} highlight />
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Pedidos no caixa: <b>{summary?.orders_count ?? 0}</b> • Vendas totais: <b>{brl(summary?.total_sales ?? 0)}</b>
          </div>
        </CardContent>
      </Card>

      <CashMovementDialog open={inDlg} onOpenChange={setInDlg} direction="in" restaurantId={restaurantId} sessionId={session!.id} onDone={refetch} />
      <CashMovementDialog open={outDlg} onOpenChange={setOutDlg} direction="out" restaurantId={restaurantId} sessionId={session!.id} onDone={refetch} />
      <CloseSessionDialog open={closeDlg} onOpenChange={setCloseDlg} sessionId={session!.id} summary={summary} onClosed={refetch} />
    </>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "bg-accent" : "bg-background"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold text-lg">{value}</div>
    </div>
  );
}
