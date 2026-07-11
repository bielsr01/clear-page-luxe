import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, BarChart3, Users, DollarSign, TrendingUp, UserPlus, Repeat } from "lucide-react";
import { brl } from "@/lib/format";

type Coupon = { id: string; code: string; name: string; uses_count: number; restaurant_id: string };
type Order = {
  id: string;
  restaurant_id: string;
  customer_phone: string;
  subtotal: number;
  total: number;
  delivery_fee: number;
  coupon_code: string | null;
  created_at: string;
};

const normPhone = (p: string) => (p || "").replace(/\D/g, "");

function cleanRestName(name: string): string {
  if (!name) return name;
  if (/teste/i.test(name)) return name;
  // Remove prefixo "Coxinha Surprise -" (com variações de espaço/traço)
  return name.replace(/^\s*coxinha\s*surprise\s*[-–—]\s*/i, "").trim() || name;
}

type Stats = ReturnType<typeof computeStatsRaw>;

function computeStatsRaw(orders: Order[], codes: Set<string>, filterCode: string | null) {
  const withCoupon = orders.filter((o) => o.coupon_code && codes.has(o.coupon_code.toUpperCase()));
  const withoutCoupon = orders.filter((o) => !o.coupon_code || !codes.has(o.coupon_code.toUpperCase()));
  const targetWithCoupon = filterCode
    ? withCoupon.filter((o) => o.coupon_code?.toUpperCase() === filterCode)
    : withCoupon;

  const firstOrderByPhone = new Map<string, Order>();
  for (const o of orders) {
    const k = normPhone(o.customer_phone);
    if (!k) continue;
    if (!firstOrderByPhone.has(k)) firstOrderByPhone.set(k, o);
  }

  const totalUses = targetWithCoupon.length;
  const uniqueUsers = new Set(targetWithCoupon.map((o) => normPhone(o.customer_phone)).filter(Boolean)).size;
  const grossRevenue = targetWithCoupon.reduce((s, o) => s + Number(o.total), 0);
  const discountTotal = targetWithCoupon.reduce(
    (s, o) => s + Math.max(0, Number(o.subtotal) + Number(o.delivery_fee) - Number(o.total)),
    0,
  );
  const netRevenue = targetWithCoupon.reduce((s, o) => s + (Number(o.total) - Number(o.delivery_fee)), 0);
  const avgWith = targetWithCoupon.length ? grossRevenue / targetWithCoupon.length : 0;
  const sumWithout = withoutCoupon.reduce((s, o) => s + Number(o.total), 0);
  const avgWithout = withoutCoupon.length ? sumWithout / withoutCoupon.length : 0;
  const diffPct = avgWithout > 0 ? ((avgWith - avgWithout) / avgWithout) * 100 : 0;

  const newCustomers = new Set<string>();
  const recurringCustomers = new Set<string>();
  for (const o of targetWithCoupon) {
    const k = normPhone(o.customer_phone);
    if (!k) continue;
    const first = firstOrderByPhone.get(k);
    if (first && first.id === o.id) newCustomers.add(k);
    else recurringCustomers.add(k);
  }
  const newCount = newCustomers.size;
  const recCount = recurringCustomers.size;
  const totalUnique = newCount + recCount;
  const newPct = totalUnique ? (newCount / totalUnique) * 100 : 0;
  const recPct = totalUnique ? (recCount / totalUnique) * 100 : 0;

  const usersByPhone = new Map<string, Order[]>();
  for (const o of orders) {
    const k = normPhone(o.customer_phone);
    if (!k) continue;
    if (!usersByPhone.has(k)) usersByPhone.set(k, []);
    usersByPhone.get(k)!.push(o);
  }
  let returnedWithoutCoupon = 0;
  let repurchasedAny = 0;
  const couponUsers = new Set(targetWithCoupon.map((o) => normPhone(o.customer_phone)).filter(Boolean));
  for (const k of couponUsers) {
    const list = (usersByPhone.get(k) ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
    const firstCouponIdx = list.findIndex(
      (o) => o.coupon_code && (!filterCode || o.coupon_code.toUpperCase() === filterCode) && codes.has(o.coupon_code.toUpperCase()),
    );
    if (firstCouponIdx === -1) continue;
    const after = list.slice(firstCouponIdx + 1);
    if (after.length > 0) repurchasedAny++;
    if (after.some((o) => !o.coupon_code || !codes.has(o.coupon_code.toUpperCase()))) returnedWithoutCoupon++;
  }
  const repurchaseRate = couponUsers.size ? (repurchasedAny / couponUsers.size) * 100 : 0;

  return {
    totalUses,
    uniqueUsers,
    grossRevenue,
    discountTotal,
    netRevenue,
    avgWith,
    avgWithout,
    diffPct,
    newCount,
    recCount,
    newPct,
    recPct,
    returnedWithoutCoupon,
    repurchaseRate,
    couponUsersCount: couponUsers.size,
  };
}

export function CouponMetrics({
  restaurantId,
  restaurantIds,
  onBack,
}: {
  restaurantId?: string;
  restaurantIds?: string[];
  onBack: () => void;
}) {
  const ids = (restaurantIds && restaurantIds.length > 0 ? restaurantIds : restaurantId ? [restaurantId] : []);
  const idsKey = ids.slice().sort().join(",");
  const [selected, setSelected] = useState<string>("__all__");
  const multi = ids.length > 1;

  const { data: restaurants } = useQuery({
    queryKey: ["coupon-metrics-restaurants", idsKey],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("id,name").in("id", ids);
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const restNameById = useMemo(() => {
    const m = new Map<string, string>();
    (restaurants ?? []).forEach((r) => m.set(r.id, cleanRestName(r.name)));
    return m;
  }, [restaurants]);

  const { data: coupons } = useQuery({
    queryKey: ["coupon-metrics-coupons", idsKey],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("coupons" as any)
        .select("id,code,name,uses_count,restaurant_id")
        .in("restaurant_id", ids)
        .order("created_at", { ascending: false });
      return ((data ?? []) as unknown) as Coupon[];
    },
  });

  const { data: allOrders, isLoading } = useQuery({
    queryKey: ["coupon-metrics-orders", idsKey],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id,restaurant_id,customer_phone,subtotal,total,delivery_fee,coupon_code,created_at")
        .in("restaurant_id", ids)
        .neq("status", "cancelled")
        .order("created_at", { ascending: true });
      return (data ?? []) as Order[];
    },
  });

  const codes = useMemo(() => new Set((coupons ?? []).map((c) => c.code.toUpperCase())), [coupons]);
  const filterCode = selected === "__all__" ? null : selected.toUpperCase();

  const stats = useMemo(
    () => computeStatsRaw(allOrders ?? [], codes, filterCode),
    [allOrders, codes, filterCode],
  );

  // Por restaurante (só quando multi): calcula stats individuais e filtra os que têm algum uso
  const perRestStats = useMemo(() => {
    if (!multi) return [];
    const byRest = new Map<string, Order[]>();
    for (const rid of ids) byRest.set(rid, []);
    for (const o of allOrders ?? []) {
      byRest.get(o.restaurant_id)?.push(o);
    }
    return ids
      .map((rid) => ({
        id: rid,
        name: restNameById.get(rid) ?? rid.slice(0, 8),
        stats: computeStatsRaw(byRest.get(rid) ?? [], codes, filterCode),
      }))
      .filter((r) => r.stats.totalUses > 0);
  }, [allOrders, codes, filterCode, ids, multi, restNameById]);

  // Tabela por cupom
  const perCoupon = useMemo(() => {
    const map = new Map<string, { code: string; name: string; uses: number; unique: Set<string>; revenue: number; discount: number }>();
    for (const c of coupons ?? []) {
      if (!map.has(c.code.toUpperCase())) {
        map.set(c.code.toUpperCase(), { code: c.code, name: c.name, uses: 0, unique: new Set(), revenue: 0, discount: 0 });
      }
    }
    for (const o of allOrders ?? []) {
      if (!o.coupon_code) continue;
      const key = o.coupon_code.toUpperCase();
      const row = map.get(key);
      if (!row) continue;
      row.uses++;
      const k = normPhone(o.customer_phone);
      if (k) row.unique.add(k);
      row.revenue += Number(o.total);
      row.discount += Math.max(0, Number(o.subtotal) + Number(o.delivery_fee) - Number(o.total));
    }
    return Array.from(map.values()).sort((a, b) => b.uses - a.uses);
  }, [coupons, allOrders]);

  const breakdownFor = (pick: (s: Stats) => number, fmt: (n: number) => string) =>
    multi ? perRestStats.map((r) => ({ name: r.name, value: fmt(pick(r.stats)) })) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <BarChart3 className="w-5 h-5" /> Métricas de cupons
            </h2>
            <p className="text-sm text-muted-foreground">
              {multi ? `Consolidado de ${ids.length} restaurantes.` : "Desempenho dos seus cupons de desconto."}
            </p>
          </div>
        </div>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent
            position="popper"
            className="max-h-[60vh]"
            ref={(el) => {
              if (el) el.ontouchstart = (e) => e.stopPropagation();
            }}
          >
            <SelectItem value="__all__">Todos os cupons</SelectItem>
            {(coupons ?? []).map((c) => (
              <SelectItem key={c.id} value={c.code}>{c.code} — {c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : (
        <>
          <Section title="Uso básico" icon={Users}>
            <Metric label="Total de usos" value={stats.totalUses.toString()} breakdown={breakdownFor((s) => s.totalUses, (n) => n.toString())} />
            <Metric label="Usuários únicos" value={stats.uniqueUsers.toString()} breakdown={breakdownFor((s) => s.uniqueUsers, (n) => n.toString())} />
          </Section>

          <Section title="Receita gerada" icon={DollarSign}>
            <Metric label="Faturamento bruto" value={brl(stats.grossRevenue)} breakdown={breakdownFor((s) => s.grossRevenue, brl)} />
            <Metric label="Total concedido em desconto" value={brl(stats.discountTotal)} tone="destructive" breakdown={breakdownFor((s) => s.discountTotal, brl)} />
            <Metric label="Receita líquida (sem entrega)" value={brl(stats.netRevenue)} tone="success" breakdown={breakdownFor((s) => s.netRevenue, brl)} />
          </Section>

          <Section title="Ticket médio" icon={TrendingUp}>
            <Metric label="Com cupom" value={brl(stats.avgWith)} breakdown={breakdownFor((s) => s.avgWith, brl)} />
            <Metric label="Sem cupom" value={brl(stats.avgWithout)} breakdown={breakdownFor((s) => s.avgWithout, brl)} />
            <Metric
              label="Diferença"
              value={`${stats.diffPct >= 0 ? "+" : ""}${stats.diffPct.toFixed(1)}%`}
              tone={stats.diffPct >= 0 ? "success" : "destructive"}
              breakdown={breakdownFor((s) => s.diffPct, (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`)}
            />
          </Section>

          <Section title="Aquisição de clientes" icon={UserPlus}>
            <Metric label="Novos clientes" value={`${stats.newCount} (${stats.newPct.toFixed(0)}%)`} breakdown={breakdownFor((s) => s.newCount, (n) => n.toString())} />
            <Metric label="Recorrentes" value={`${stats.recCount} (${stats.recPct.toFixed(0)}%)`} breakdown={breakdownFor((s) => s.recCount, (n) => n.toString())} />
            <Metric label="Primeira compra com cupom" value={stats.newCount.toString()} breakdown={breakdownFor((s) => s.newCount, (n) => n.toString())} />
          </Section>

          <Section title="Retenção" icon={Repeat}>
            <Metric label="Voltaram a comprar (sem cupom)" value={stats.returnedWithoutCoupon.toString()} breakdown={breakdownFor((s) => s.returnedWithoutCoupon, (n) => n.toString())} />
            <Metric label="Taxa de recompra" value={`${stats.repurchaseRate.toFixed(1)}%`} breakdown={breakdownFor((s) => s.repurchaseRate, (n) => `${n.toFixed(1)}%`)} />
            <Metric label="Base de usuários do cupom" value={stats.couponUsersCount.toString()} breakdown={breakdownFor((s) => s.couponUsersCount, (n) => n.toString())} />
          </Section>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Desempenho por cupom</CardTitle>
              <CardDescription>Comparação entre todos os cupons cadastrados.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead className="text-right">Usos</TableHead>
                      <TableHead className="text-right">Únicos</TableHead>
                      <TableHead className="text-right">Faturamento</TableHead>
                      <TableHead className="text-right">Desconto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {perCoupon.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum dado</TableCell></TableRow>
                    )}
                    {perCoupon.map((r) => (
                      <TableRow key={r.code}>
                        <TableCell className="font-mono font-semibold">{r.code}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="text-right">{r.uses}</TableCell>
                        <TableCell className="text-right">{r.unique.size}</TableCell>
                        <TableCell className="text-right">{brl(r.revenue)}</TableCell>
                        <TableCell className="text-right">{brl(r.discount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Icon className="w-4 h-4 text-primary" /> {title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">{children}</div>
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
  breakdown,
}: {
  label: string;
  value: string;
  tone?: "success" | "destructive";
  breakdown?: { name: string; value: string }[];
}) {
  const color = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
      {breakdown && breakdown.length > 0 && (
        <div className="mt-3 pt-3 border-t space-y-1">
          {breakdown.map((b) => (
            <div key={b.name} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground truncate">{b.name}</span>
              <span className="font-medium tabular-nums">{b.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
