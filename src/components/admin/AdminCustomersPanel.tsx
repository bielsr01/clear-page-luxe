import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Users, Filter, X, ChevronLeft, ChevronRight } from "lucide-react";
import { unmaskPhone } from "@/lib/format";
import { RestaurantMultiSelect, useRestaurants } from "./RestaurantMultiSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

const sb = supabase as any;

type ClientType = "diamond" | "elite" | "best" | "frequent" | "new" | "none";
type ClientStatus = "active" | "inactive" | "sleeping" | "risk";

const TYPE_LABELS: Record<ClientType, string> = {
  diamond: "Comprador Diamond (+15)",
  elite: "Comprador Elite (8–15)",
  best: "Melhor Comprador (5–7)",
  frequent: "Comprador Frequente (3–4)",
  new: "Novo Cliente (1–2)",
  none: "Sem pedido",
};
const STATUS_LABELS: Record<ClientStatus, string> = {
  active: "Ativo (≤15 dias)",
  inactive: "Inativo (16–30 dias)",
  sleeping: "Dormindo (31–90 dias)",
  risk: "Em risco (+90 dias)",
};
const TYPE_BADGE: Record<ClientType, string> = {
  diamond: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  elite: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  best: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  frequent: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  new: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200",
  none: "bg-muted text-muted-foreground",
};
const STATUS_BADGE: Record<ClientStatus, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  inactive: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
  sleeping: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  risk: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

function getClientType(orders: number): ClientType | null {
  if (orders > 15) return "diamond";
  if (orders >= 8) return "elite";
  if (orders >= 5) return "best";
  if (orders >= 3) return "frequent";
  if (orders >= 1) return "new";
  if (orders === 0) return "none";
  return null;
}
function getClientStatus(lastOrderAt: string | null): ClientStatus | null {
  if (!lastOrderAt) return null;
  const days = (Date.now() - new Date(lastOrderAt).getTime()) / 86400000;
  if (days <= 15) return "active";
  if (days <= 30) return "inactive";
  if (days <= 90) return "sleeping";
  return "risk";
}

export function AdminCustomersPanel() {
  const restaurantsQ = useRestaurants();
  const all = restaurantsQ.data ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilters, setTypeFilters] = useState<Set<ClientType>>(new Set());
  const [statusFilters, setStatusFilters] = useState<Set<ClientStatus>>(new Set());
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 30;
  const idsKey = selected.slice().sort().join(",");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-customers", idsKey],
    enabled: selected.length > 0,
    queryFn: async () => {
      const CHUNK = 1000;
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await sb
          .from("customers")
          .select("id, restaurant_id, name, phone, orders_count, last_order_at, created_at")
          .in("restaurant_id", selected)
          .order("last_order_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, from + CHUNK - 1);
        if (error) throw error;
        const rows = data ?? [];
        all.push(...rows);
        if (rows.length < CHUNK) break;
        from += CHUNK;
      }
      return all;
    },
  });

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    all.forEach((r) => m.set(r.id, r.name));
    return m;
  }, [all]);

  const filtered = useMemo(() => (data ?? []).filter((c) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const qDigits = unmaskPhone(search);
      const nameMatch = (c.name || "").toLowerCase().includes(q);
      const phoneMatch = qDigits.length > 0 && unmaskPhone(c.phone || "").includes(qDigits);
      if (!nameMatch && !phoneMatch) return false;
    }
    if (typeFilters.size > 0) {
      const t = getClientType(c.orders_count);
      if (!t || !typeFilters.has(t)) return false;
    }
    if (statusFilters.size > 0) {
      const s = getClientStatus(c.last_order_at);
      if (!s || !statusFilters.has(s)) return false;
    }
    return true;
  }), [data, search, typeFilters, statusFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );
  const rangeStart = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, filtered.length);

  useEffect(() => { setPage(1); }, [idsKey, search, typeFilters, statusFilters]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const toggleType = (t: ClientType) => {
    const n = new Set(typeFilters);
    n.has(t) ? n.delete(t) : n.add(t);
    setTypeFilters(n);
  };
  const toggleStatus = (s: ClientStatus) => {
    const n = new Set(statusFilters);
    n.has(s) ? n.delete(s) : n.add(s);
    setStatusFilters(n);
  };
  const clearFilters = () => { setTypeFilters(new Set()); setStatusFilters(new Set()); };
  const activeFilterCount = typeFilters.size + statusFilters.size;

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4"><RestaurantMultiSelect all={all} selected={selected} onChange={setSelected} /></CardContent></Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Clientes</CardTitle>
          <CardDescription>Visualize e classifique clientes de todas as lojas selecionadas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por nome ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="w-4 h-4 mr-1" /> Filtros
                  {activeFilterCount > 0 && <Badge variant="secondary" className="ml-2">{activeFilterCount}</Badge>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="start">
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Tipo de cliente</div>
                    <div className="space-y-2">
                      {(Object.keys(TYPE_LABELS) as ClientType[]).map((t) => (
                        <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox checked={typeFilters.has(t)} onCheckedChange={() => toggleType(t)} />
                          {TYPE_LABELS[t]}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Status</div>
                    <div className="space-y-2">
                      {(Object.keys(STATUS_LABELS) as ClientStatus[]).map((s) => (
                        <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox checked={statusFilters.has(s)} onCheckedChange={() => toggleStatus(s)} />
                          {STATUS_LABELS[s]}
                        </label>
                      ))}
                    </div>
                  </div>
                  {activeFilterCount > 0 && (
                    <Button variant="ghost" size="sm" className="w-full" onClick={clearFilters}>
                      <X className="w-4 h-4 mr-1" /> Limpar filtros
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-1">
                {Array.from(typeFilters).map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {TYPE_LABELS[t]}
                    <button onClick={() => toggleType(t)}><X className="w-3 h-3" /></button>
                  </Badge>
                ))}
                {Array.from(statusFilters).map((s) => (
                  <Badge key={s} variant="secondary" className="gap-1">
                    {STATUS_LABELS[s]}
                    <button onClick={() => toggleStatus(s)}><X className="w-3 h-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {selected.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Selecione ao menos um restaurante.</div>
          ) : isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhum cliente encontrado.</div>
          ) : (
            <>
              <div className="hidden md:block border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Restaurante</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Pedidos</TableHead>
                      <TableHead className="whitespace-nowrap">Último pedido</TableHead>
                      <TableHead>Cadastrado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.map((c) => {
                      const t = getClientType(c.orders_count);
                      const s = getClientStatus(c.last_order_at);
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.phone}</TableCell>
                          <TableCell><Badge variant="outline">{nameById.get(c.restaurant_id) ?? "—"}</Badge></TableCell>
                          <TableCell>{t ? <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${TYPE_BADGE[t]}`}>{TYPE_LABELS[t]}</span> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                          <TableCell>{s ? <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[s]}`}>{STATUS_LABELS[s]}</span> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                          <TableCell className="text-center">{c.orders_count}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.last_order_at ? new Date(c.last_order_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{new Date(c.created_at).toLocaleDateString("pt-BR")}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="md:hidden space-y-2">
                {paginated.map((c) => {
                  const t = getClientType(c.orders_count);
                  const s = getClientStatus(c.last_order_at);
                  return (
                    <div key={c.id} className="border rounded-lg p-3 space-y-2 bg-card">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.phone}</div>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[10px]">{nameById.get(c.restaurant_id) ?? "—"}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {t && <span className={`text-[10px] px-2 py-0.5 rounded-full ${TYPE_BADGE[t]}`}>{TYPE_LABELS[t]}</span>}
                        {s && <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_BADGE[s]}`}>{STATUS_LABELS[s]}</span>}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs border-t pt-2">
                        <div><div className="font-semibold">{c.orders_count}</div><div className="text-muted-foreground text-[10px]">Pedidos</div></div>
                        <div><div className="font-semibold text-[11px]">{c.last_order_at ? new Date(c.last_order_at).toLocaleDateString("pt-BR") : "—"}</div><div className="text-muted-foreground text-[10px]">Último</div></div>
                        <div><div className="font-semibold text-[11px]">{new Date(c.created_at).toLocaleDateString("pt-BR")}</div><div className="text-muted-foreground text-[10px]">Cadastro</div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {filtered.length > 0 && (
            <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
              <div className="text-xs text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {filtered.length} cliente(s)
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  <ChevronLeft className="w-4 h-4" /> Anterior
                </Button>
                <span className="text-sm tabular-nums">Página {page} de {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  Próxima <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
