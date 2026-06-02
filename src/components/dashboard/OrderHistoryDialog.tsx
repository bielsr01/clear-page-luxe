import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, Eye, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_TIMEZONE, brl, formatPhone, formatIfoodPhone, orderStatusLabel, displayOrderNumber } from "@/lib/format";
import { OrderDetailsDialog } from "./OrderDetailsDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

type Channel = "all" | "delivery" | "pdv" | "ifood" | "quero";
type DateRange = "7d" | "30d" | "month" | "custom";

interface Order {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  total: number;
  status: string;
  order_type: string;
  external_source: string | null;
  created_at: string;
  updated_at: string;
  [k: string]: any;
}

interface Item {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  notes: string | null;
}

const STATUS_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Novos" },
  { value: "preparing", label: "Em preparo" },
  { value: "out_for_delivery", label: "Em entrega" },
  { value: "awaiting_pickup", label: "Aguardando retirada" },
  { value: "delivered", label: "Entregues" },
  { value: "cancelled", label: "Cancelados" },
];

/** Resolve YYYY-MM-DD components of a Date in Brasília (GMT-3, sem DST). */
function brasiliaYMD(date: Date): { y: number; m: number; d: number } {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date).split("-").map(Number);
  return { y, m, d };
}

/** Início (00:00) e fim (23:59:59.999) de um dia em Brasília, em UTC. */
function brasiliaDayBounds(date: Date): { from: Date; to: Date } {
  const { y, m, d } = brasiliaYMD(date);
  // Brasília = UTC-3 fixo ⇒ 00:00 BRT = 03:00 UTC
  const from = new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0));
  const to = new Date(Date.UTC(y, m - 1, d + 1, 2, 59, 59, 999));
  return { from, to };
}

function rangeFor(kind: DateRange, customFrom?: Date, customTo?: Date): { from: Date; to: Date } {
  const todayBounds = brasiliaDayBounds(new Date());
  if (kind === "7d") {
    const start = brasiliaDayBounds(new Date(Date.now() - 6 * 86400000));
    return { from: start.from, to: todayBounds.to };
  }
  if (kind === "30d") {
    const start = brasiliaDayBounds(new Date(Date.now() - 29 * 86400000));
    return { from: start.from, to: todayBounds.to };
  }
  if (kind === "month") {
    const { y, m } = brasiliaYMD(new Date());
    const from = new Date(Date.UTC(y, m - 1, 1, 3, 0, 0, 0));
    return { from, to: todayBounds.to };
  }
  const from = customFrom ? brasiliaDayBounds(customFrom).from
    : new Date(Date.UTC(brasiliaYMD(new Date()).y, brasiliaYMD(new Date()).m - 1, 1, 3, 0, 0, 0));
  const to = customTo ? brasiliaDayBounds(customTo).to : todayBounds.to;
  return { from, to };
}

export function OrderHistoryDialog({
  open, onOpenChange, restaurantId,
  onAdvance, onCancel, onDelete, onPrint,
  pendingAction, canChangeStatus = false, canEditOrders = false, canCancelFinalized = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  restaurantId: string;
  onAdvance?: (o: any) => void;
  onCancel?: (o: any) => void;
  onDelete?: (o: any) => void;
  onPrint?: (o: any) => void;
  pendingAction?: Record<string, boolean>;
  canChangeStatus?: boolean;
  canEditOrders?: boolean;
  canCancelFinalized?: boolean;
}) {
  const [channel, setChannel] = useState<Channel>("all");
  const [status, setStatus] = useState<string>("all");
  const [dateKind, setDateKind] = useState<DateRange>("7d");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [search, setSearch] = useState("");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const { can } = usePermissions(restaurantId);
  const qc = useQueryClient();
  const canViewFeeBreakdown = can("finance.view_fee_breakdown");


  const range = useMemo(() => rangeFor(dateKind, customFrom, customTo), [dateKind, customFrom, customTo]);

  const historyKey = useMemo(
    () => ["order-history", restaurantId, range.from.toISOString(), range.to.toISOString()] as const,
    [restaurantId, range.from, range.to],
  );

  const { data, isLoading, refetch } = useQuery({
    queryKey: historyKey,
    enabled: open,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: orders } = await supabase
        .from("orders")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString())
        .order("created_at", { ascending: false })
        .limit(2000);
      const list = (orders ?? []) as Order[];
      const ids = list.map((o) => o.id);
      const itemsByOrder: Record<string, Item[]> = {};
      if (ids.length) {
        const { data: its } = await supabase.from("order_items").select("*").in("order_id", ids);
        (its ?? []).forEach((it: any) => { (itemsByOrder[it.order_id] ||= []).push(it); });
      }
      return { orders: list, items: itemsByOrder };
    },
  });

  // Sempre que o diálogo abrir, força refetch
  useEffect(() => {
    if (open) refetch();
  }, [open, refetch]);

  // Realtime: invalida o histórico quando há mudança nos pedidos
  useEffect(() => {
    if (!open) return;
    const ch = supabase
      .channel(`order-history-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, () => {
        qc.invalidateQueries({ queryKey: ["order-history", restaurantId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [open, restaurantId, qc]);

  const orders = data?.orders ?? [];
  const items = data?.items ?? {};
  const detailsTarget = detailsId ? orders.find((o) => o.id === detailsId) ?? null : null;

  const channelOrders = orders.filter((o) => {
    if (channel === "all") return true;
    if (channel === "pdv") return o.order_type === "pdv";
    if (channel === "ifood") return o.external_source === "ifood";
    if (channel === "quero") return o.external_source === "quero";
    return o.order_type !== "pdv" && o.external_source !== "ifood" && o.external_source !== "quero";
  });

  const filtered = channelOrders.filter((o) => {
    if (status !== "all" && o.status !== status) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !String(o.order_number).includes(q) &&
        !(o.customer_name ?? "").toLowerCase().includes(q) &&
        !(o.customer_phone ?? "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const statusColor = (s: string) => {
    if (s === "pending") return "bg-warning text-warning-foreground";
    if (s === "delivered") return "bg-success text-success-foreground";
    if (s === "cancelled") return "bg-destructive text-destructive-foreground";
    return "bg-primary text-primary-foreground";
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de pedidos</DialogTitle>
            <DialogDescription>Todos os pedidos do período selecionado.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="all">Todos</TabsTrigger>
                <TabsTrigger value="pdv">PDV</TabsTrigger>
                <TabsTrigger value="delivery">Delivery / Retirada</TabsTrigger>
                <TabsTrigger value="ifood">iFood</TabsTrigger>
                <TabsTrigger value="quero">Quero Delivery</TabsTrigger>
              </TabsList>
            </Tabs>

            <Tabs value={status} onValueChange={setStatus}>
              <TabsList className="flex-wrap h-auto">
                {STATUS_FILTERS.map((f) => (
                  <TabsTrigger key={f.value} value={f.value}>{f.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2">
              <Tabs value={dateKind} onValueChange={(v) => setDateKind(v as DateRange)}>
                <TabsList>
                  <TabsTrigger value="7d">Últimos 7 dias</TabsTrigger>
                  <TabsTrigger value="30d">Últimos 30 dias</TabsTrigger>
                  <TabsTrigger value="month">Este mês</TabsTrigger>
                  <TabsTrigger value="custom">Personalizado</TabsTrigger>
                </TabsList>
              </Tabs>

              {dateKind === "custom" && (
                <div className="flex gap-2 items-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("gap-2", !customFrom && "text-muted-foreground")}>
                        <CalendarIcon className="w-4 h-4" />
                        {customFrom ? format(customFrom, "dd/MM/yyyy") : "Data início"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                  <span className="text-muted-foreground">até</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("gap-2", !customTo && "text-muted-foreground")}>
                        <CalendarIcon className="w-4 h-4" />
                        {customTo ? format(customTo, "dd/MM/yyyy") : "Data fim"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              <div className="relative ml-auto">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar nº, cliente, telefone…"
                  className="pl-8 h-9 w-64"
                />
              </div>
            </div>

            <div className="border rounded-md overflow-hidden">
              <div className="grid grid-cols-[90px_130px_1fr_120px_110px_110px_50px] gap-2 px-3 py-2 bg-muted/50 text-xs font-semibold text-muted-foreground">
                <div>Pedido</div>
                <div>Data</div>
                <div>Cliente</div>
                <div>Origem</div>
                <div>Status</div>
                <div className="text-right">Valor</div>
                <div></div>
              </div>
              {isLoading ? (
                <div className="p-3 space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">Nenhum pedido encontrado.</div>
              ) : (
                <div className="divide-y">
                  {filtered.map((o) => {
                    const origem = o.external_source === "ifood" ? "iFood"
                      : o.external_source === "quero" ? "Quero Delivery"
                      : o.order_type === "pdv" ? "PDV"
                      : o.order_type === "pickup" ? "Retirada"
                      : "Delivery";
                    const phoneFmt = o.external_source === "ifood" ? formatIfoodPhone(o.customer_phone) : formatPhone(o.customer_phone);
                    return (
                    <div key={o.id} className="grid grid-cols-[90px_130px_1fr_120px_110px_110px_50px] gap-2 px-3 py-2 items-center text-sm hover:bg-accent/30">
                      <div className="font-mono">#{displayOrderNumber(o)}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString("pt-BR", { timeZone: APP_TIMEZONE })}<br />
                        {new Date(o.created_at).toLocaleTimeString("pt-BR", { timeZone: APP_TIMEZONE, hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{o.customer_name}</div>
                        <div className="text-xs text-muted-foreground truncate">{phoneFmt}</div>
                      </div>
                      <div>
                        <Badge variant="outline" className="text-xs">{origem}</Badge>
                      </div>
                      <div>
                        <Badge className={statusColor(o.status)}>{orderStatusLabel[o.status as keyof typeof orderStatusLabel]}</Badge>
                      </div>
                      <div className="text-right font-semibold">{brl(Number(o.total))}</div>
                      <div className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => setDetailsId(o.id)} title="Ver detalhes">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground text-right">
              {filtered.length} pedido(s) • {brl(filtered.reduce((s, o) => s + Number(o.total), 0))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <OrderDetailsDialog
        order={detailsTarget as any}
        items={detailsTarget ? (items[detailsTarget.id] ?? []) as any : []}
        onClose={() => setDetailsId(null)}
        onAdvance={(o) => onAdvance?.(o)}
        onCancel={(o) => onCancel?.(o)}
        onDelete={(o) => onDelete?.(o)}
        onPrint={(o) => onPrint?.(o)}
        pending={detailsTarget ? !!pendingAction?.[detailsTarget.id] : false}
        canChangeStatus={canChangeStatus}
        canEditOrders={canEditOrders}
        canCancelFinalized={canCancelFinalized}
        canViewFeeBreakdown={canViewFeeBreakdown}
      />

    </>
  );
}
