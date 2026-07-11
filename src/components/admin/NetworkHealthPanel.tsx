import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, Medal, Award, Settings, Store, TrendingUp, AlertTriangle, ShieldAlert } from "lucide-react";
import { brl } from "@/lib/format";
import { toast } from "sonner";

type Thresholds = { destaque: number; atencao: number; risco: number };
const STORAGE_KEY = "admin_network_health_thresholds_v1";
const DEFAULTS: Thresholds = { destaque: 30000, atencao: 15000, risco: 0 };

function loadThresholds(): Thresholds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function cleanRestName(name: string): string {
  if (!name) return name;
  if (/teste/i.test(name)) return name;
  return name.replace(/^\s*coxinha\s*surprise\s*[-–—]\s*/i, "").trim() || name;
}

function monthOptions(count = 12): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return opts;
}

function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

type Row = { id: string; name: string; revenue: number; orders: number };

export function NetworkHealthPanel() {
  const [thresholds, setThresholds] = useState<Thresholds>(loadThresholds);
  const [configOpen, setConfigOpen] = useState(false);
  const monthOpts = useMemo(() => monthOptions(12), []);
  const [month, setMonth] = useState<string>(monthOpts[0].value);
  const range = useMemo(() => monthRange(month), [month]);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["network-health", month],
    queryFn: async () => {
      const { data: rests } = await supabase.from("restaurants").select("id,name");
      const restList = (rests ?? []) as { id: string; name: string }[];

      const CHUNK = 1000;
      const all: { restaurant_id: string; total: number }[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("orders")
          .select("restaurant_id,total,created_at")
          .neq("status", "cancelled")
          .gte("created_at", range.start)
          .lt("created_at", range.end)
          .range(from, from + CHUNK - 1);
        if (error) throw error;
        const chunk = (data ?? []) as { restaurant_id: string; total: number }[];
        all.push(...chunk);
        if (chunk.length < CHUNK) break;
        from += CHUNK;
      }

      const map = new Map<string, { revenue: number; orders: number }>();
      for (const r of restList) map.set(r.id, { revenue: 0, orders: 0 });
      for (const o of all) {
        const row = map.get(o.restaurant_id);
        if (!row) continue;
        row.revenue += Number(o.total) || 0;
        row.orders += 1;
      }
      const result: Row[] = restList.map((r) => ({
        id: r.id,
        name: cleanRestName(r.name),
        revenue: map.get(r.id)?.revenue ?? 0,
        orders: map.get(r.id)?.orders ?? 0,
      }));
      return result.sort((a, b) => b.revenue - a.revenue);
    },
  });

  const groups = useMemo(() => {
    const list = rows ?? [];
    const destaque = list.filter((r) => r.revenue >= thresholds.destaque);
    const atencao = list.filter((r) => r.revenue >= thresholds.atencao && r.revenue < thresholds.destaque);
    const risco = list.filter((r) => r.revenue < thresholds.atencao);
    return { destaque, atencao, risco };
  }, [rows, thresholds]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5" /> Saúde da Rede
          </h2>
          <p className="text-sm text-muted-foreground">Classificação das lojas por faturamento mensal.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <ThresholdConfig
            open={configOpen}
            setOpen={setConfigOpen}
            value={thresholds}
            onSave={(t) => {
              setThresholds(t);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
              toast.success("Faixas atualizadas");
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : (
        <Tabs defaultValue="geral">
          <TabsList className="w-full md:w-auto grid grid-cols-2 md:inline-flex md:grid-cols-none gap-1">
            <TabsTrigger value="geral" className="gap-1"><Trophy className="w-3.5 h-3.5" /> Geral</TabsTrigger>
            <TabsTrigger value="destaque" className="gap-1"><Award className="w-3.5 h-3.5" /> Destaque ({groups.destaque.length})</TabsTrigger>
            <TabsTrigger value="atencao" className="gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Atenção ({groups.atencao.length})</TabsTrigger>
            <TabsTrigger value="risco" className="gap-1"><ShieldAlert className="w-3.5 h-3.5" /> Risco ({groups.risco.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="geral" className="mt-4">
            <RankingCard
              title="Classificação geral"
              description="Todas as lojas ordenadas pelo faturamento no mês."
              rows={rows ?? []}
              limit={undefined}
            />
          </TabsContent>
          <TabsContent value="destaque" className="mt-4">
            <RankingCard
              title="Lojas em destaque"
              description={`Faturamento ≥ ${brl(thresholds.destaque)}. Top 3 exibidos.`}
              rows={groups.destaque}
              limit={3}
              tone="success"
            />
          </TabsContent>
          <TabsContent value="atencao" className="mt-4">
            <RankingCard
              title="Lojas em atenção"
              description={`Faturamento entre ${brl(thresholds.atencao)} e ${brl(thresholds.destaque)}. Top 3 exibidos.`}
              rows={groups.atencao}
              limit={3}
              tone="warning"
            />
          </TabsContent>
          <TabsContent value="risco" className="mt-4">
            <RankingCard
              title="Lojas em risco"
              description={`Faturamento < ${brl(thresholds.atencao)}. Top 3 exibidos.`}
              rows={groups.risco}
              limit={3}
              tone="destructive"
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function RankingCard({
  title,
  description,
  rows,
  limit,
  tone,
}: {
  title: string;
  description: string;
  rows: Row[];
  limit?: number;
  tone?: "success" | "warning" | "destructive";
}) {
  const visible = limit ? rows.slice(0, limit) : rows;
  const border =
    tone === "success" ? "border-l-4 border-l-success"
    : tone === "warning" ? "border-l-4 border-l-warning"
    : tone === "destructive" ? "border-l-4 border-l-destructive"
    : "";
  return (
    <Card className={border}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">Nenhuma loja neste grupo.</div>
        ) : (
          <div className="space-y-2">
            {visible.map((r, i) => <RankRow key={r.id} pos={i + 1} row={r} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RankRow({ pos, row }: { pos: number; row: Row }) {
  const medal =
    pos === 1 ? { icon: Trophy, cls: "text-yellow-500 bg-yellow-500/10" }
    : pos === 2 ? { icon: Medal, cls: "text-slate-400 bg-slate-400/10" }
    : pos === 3 ? { icon: Award, cls: "text-amber-600 bg-amber-600/10" }
    : null;
  const Icon = medal?.icon ?? Store;
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
      <div className={`w-10 h-10 rounded-full grid place-items-center shrink-0 ${medal?.cls ?? "bg-muted text-muted-foreground"}`}>
        {medal ? <Icon className="w-5 h-5" /> : <span className="font-bold text-sm">{pos}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate flex items-center gap-2">
          {row.name}
          {pos <= 3 && <Badge variant="outline" className="text-[10px]">#{pos}</Badge>}
        </div>
        <div className="text-xs text-muted-foreground">{row.orders} pedido(s)</div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-bold tabular-nums">{brl(row.revenue)}</div>
      </div>
    </div>
  );
}

function ThresholdConfig({
  open, setOpen, value, onSave,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  value: Thresholds;
  onSave: (t: Thresholds) => void;
}) {
  const [destaque, setDestaque] = useState(String(value.destaque));
  const [atencao, setAtencao] = useState(String(value.atencao));
  useEffect(() => {
    if (open) {
      setDestaque(String(value.destaque));
      setAtencao(String(value.atencao));
    }
  }, [open, value]);

  const save = () => {
    const d = Number(destaque) || 0;
    const a = Number(atencao) || 0;
    if (a >= d) {
      toast.error("O valor de Atenção deve ser menor que o de Destaque");
      return;
    }
    onSave({ destaque: d, atencao: a, risco: 0 });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1"><Settings className="w-4 h-4" /> Faixas</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar faixas de faturamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Destaque — faturamento mínimo (R$)</Label>
            <Input type="number" min={0} step={100} value={destaque} onChange={(e) => setDestaque(e.target.value)} />
            <p className="text-xs text-muted-foreground">Lojas com faturamento ≥ este valor.</p>
          </div>
          <div className="space-y-1">
            <Label>Atenção — faturamento mínimo (R$)</Label>
            <Input type="number" min={0} step={100} value={atencao} onChange={(e) => setAtencao(e.target.value)} />
            <p className="text-xs text-muted-foreground">Lojas entre este valor e o de Destaque.</p>
          </div>
          <div className="space-y-1">
            <Label>Risco</Label>
            <p className="text-xs text-muted-foreground">Lojas com faturamento abaixo do mínimo de Atenção.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={save}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
