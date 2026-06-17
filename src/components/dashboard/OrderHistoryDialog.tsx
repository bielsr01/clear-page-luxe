import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, Eye, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

function shouldUseDocumentScrollSurface() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator;
  const ua = nav.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  return isIOS && window.matchMedia("(max-width: 767px)").matches;
}

function OrderHistorySurface({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const useDocumentScroll = shouldUseDocumentScrollSurface();
  const documentSurfaceRef = useRef<HTMLDivElement | null>(null);
  const previousScrollYRef = useRef(typeof window !== "undefined" ? window.scrollY : 0);

  useEffect(() => {
    if (!open) return;

    const active = document.activeElement as HTMLElement | null;
    active?.blur?.();

    const html = document.documentElement;
    const body = document.body;
    const appRoot = document.getElementById("root");
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlOverflowY: html.style.overflowY,
      htmlTouchAction: html.style.touchAction,
      bodyOverflow: body.style.overflow,
      bodyOverflowY: body.style.overflowY,
      bodyTouchAction: body.style.touchAction,
      bodyPointerEvents: body.style.pointerEvents,
      rootDisplay: appRoot?.style.display ?? "",
      rootAriaHidden: appRoot?.getAttribute("aria-hidden") ?? null,
    };

    html.style.overflow = "auto";
    html.style.overflowY = "auto";
    html.style.touchAction = "pan-y";
    body.style.overflow = "auto";
    body.style.overflowY = "auto";
    body.style.touchAction = "pan-y";
    body.style.pointerEvents = "auto";
    if (useDocumentScroll && appRoot) {
      appRoot.style.display = "none";
      appRoot.setAttribute("aria-hidden", "true");
    }

    const frame = window.requestAnimationFrame(() => {
      if (useDocumentScroll) documentSurfaceRef.current?.scrollIntoView({ block: "start" });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      html.style.overflow = prev.htmlOverflow;
      html.style.overflowY = prev.htmlOverflowY;
      html.style.touchAction = prev.htmlTouchAction;
      body.style.overflow = prev.bodyOverflow;
      body.style.overflowY = prev.bodyOverflowY;
      body.style.touchAction = prev.bodyTouchAction;
      body.style.pointerEvents = prev.bodyPointerEvents;
      if (useDocumentScroll && appRoot) {
        appRoot.style.display = prev.rootDisplay;
        if (prev.rootAriaHidden == null) appRoot.removeAttribute("aria-hidden");
        else appRoot.setAttribute("aria-hidden", prev.rootAriaHidden);
        window.requestAnimationFrame(() => window.scrollTo(0, previousScrollYRef.current));
      }
    };
  }, [open, useDocumentScroll]);

  if (!open) return null;

  if (useDocumentScroll) {
    return createPortal(
      <div
        ref={documentSurfaceRef}
        className="relative z-[9999] min-h-[100dvh] w-full bg-background pointer-events-auto"
        style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", pointerEvents: "auto", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <article role="dialog" aria-modal="true" aria-labelledby="order-history-title" className="mx-auto min-h-[100dvh] w-full max-w-5xl bg-background">
          <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
            <div className="min-w-0 space-y-1">
              <h2 id="order-history-title" className="text-lg font-semibold leading-snug">Histórico de pedidos</h2>
              <p className="text-sm text-muted-foreground">Todos os pedidos do período selecionado.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Fechar histórico de pedidos"
            >
              <X className="h-5 w-5" />
            </button>
          </header>
          <div className="min-w-0 space-y-3 overflow-x-hidden px-4 pb-6 pt-4">{children}</div>
        </article>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-50 bg-background sm:bg-foreground/80 pointer-events-auto" role="presentation" style={{ pointerEvents: "auto" }}>
      <div
        className="h-[100dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain bg-background sm:bg-transparent pointer-events-auto"
        style={{ WebkitOverflowScrolling: "touch", pointerEvents: "auto", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <article role="dialog" aria-modal="true" aria-labelledby="order-history-title" className="mx-auto min-h-[100dvh] w-full max-w-5xl bg-background sm:my-6 sm:min-h-0 sm:max-h-[90vh] sm:overflow-y-auto sm:rounded-lg sm:border sm:shadow-lg">
          <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur sm:rounded-t-lg sm:px-6">
            <div className="min-w-0 space-y-1">
              <h2 id="order-history-title" className="text-lg font-semibold leading-snug">Histórico de pedidos</h2>
              <p className="text-sm text-muted-foreground">Todos os pedidos do período selecionado.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Fechar histórico de pedidos"
            >
              <X className="h-5 w-5" />
            </button>
          </header>
          <div className="min-w-0 space-y-3 overflow-x-hidden px-4 pb-6 pt-4 sm:px-6">{children}</div>
        </article>
      </div>
    </div>,
    document.body,
  );
}

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
  const historyDialogOpen = open && !detailsTarget;

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
        !displayOrderNumber(o).toLowerCase().includes(q) &&
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
      <OrderHistorySurface open={historyDialogOpen} onClose={() => onOpenChange(false)}>
          <div className="space-y-3 min-w-0">
            <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
              <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1">
                <TabsTrigger value="all">Todos</TabsTrigger>
                <TabsTrigger value="pdv">PDV</TabsTrigger>
                <TabsTrigger value="delivery">Delivery / Retirada</TabsTrigger>
                <TabsTrigger value="ifood">iFood</TabsTrigger>
                <TabsTrigger value="quero">Quero Delivery</TabsTrigger>
              </TabsList>
            </Tabs>

            <Tabs value={status} onValueChange={setStatus}>
              <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1">
                {STATUS_FILTERS.map((f) => (
                  <TabsTrigger key={f.value} value={f.value}>{f.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2">
              <Tabs value={dateKind} onValueChange={(v) => setDateKind(v as DateRange)} className="w-full sm:w-auto">
                <TabsList className="flex flex-wrap h-auto w-full sm:w-auto justify-start gap-1">
                  <TabsTrigger value="7d">Últimos 7 dias</TabsTrigger>
                  <TabsTrigger value="30d">Últimos 30 dias</TabsTrigger>
                  <TabsTrigger value="month">Este mês</TabsTrigger>
                  <TabsTrigger value="custom">Personalizado</TabsTrigger>
                </TabsList>
              </Tabs>

              {dateKind === "custom" && (
                <div className="flex gap-2 items-center flex-wrap">
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

              <div className="relative w-full sm:w-64 sm:ml-auto">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar nº, cliente, telefone…"
                  className="pl-8 h-9 w-full"
                />
              </div>
            </div>

            <div className="border rounded-md overflow-hidden">
              <div className="hidden md:grid grid-cols-[90px_130px_1fr_120px_110px_110px_50px] gap-2 px-3 py-2 bg-muted/50 text-xs font-semibold text-muted-foreground">
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
                    const dateStr = new Date(o.created_at).toLocaleDateString("pt-BR", { timeZone: APP_TIMEZONE });
                    const timeStr = new Date(o.created_at).toLocaleTimeString("pt-BR", { timeZone: APP_TIMEZONE, hour: "2-digit", minute: "2-digit" });
                    return (
                    <div key={o.id}>
                      {/* Desktop row */}
                      <div className="hidden md:grid grid-cols-[90px_130px_1fr_120px_110px_110px_50px] gap-2 px-3 py-2 items-center text-sm hover:bg-accent/30">
                        <div className="font-mono">#{displayOrderNumber(o)}</div>
                        <div className="text-xs text-muted-foreground">
                          {dateStr}<br />
                          {timeStr}
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

                      {/* Mobile card */}
                      <div className="md:hidden p-3 hover:bg-accent/30">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-semibold text-sm">#{displayOrderNumber(o)}</span>
                              <Badge variant="outline" className="text-[10px]">{origem}</Badge>
                            </div>
                            <div className="font-medium text-sm truncate mt-1">{o.customer_name}</div>
                            <div className="text-xs text-muted-foreground truncate">{phoneFmt}</div>
                          </div>
                          <Button size="icon" variant="ghost" onClick={() => setDetailsId(o.id)} title="Ver detalhes" className="shrink-0">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <Badge className={cn(statusColor(o.status), "text-[10px]")}>
                            {orderStatusLabel[o.status as keyof typeof orderStatusLabel]}
                          </Badge>
                          <div className="text-xs text-muted-foreground">{dateStr} {timeStr}</div>
                          <div className="font-semibold text-sm">{brl(Number(o.total))}</div>
                        </div>
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
      </OrderHistorySurface>

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
