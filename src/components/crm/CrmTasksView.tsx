import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { MessageCircle, Settings, Send, RefreshCw, Plus, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";

const sb = supabase as any;

export type TaskKey =
  | "review_next_day"
  | "no_purchase_15_29"
  | "no_purchase_30_59"
  | "no_purchase_60_89"
  | "no_purchase_90";

interface TaskDef {
  key: TaskKey;
  label: string;
  description: string;
  range?: [number, number | null];
  isReview?: boolean;
}

const TASKS: TaskDef[] = [
  { key: "review_next_day", label: "Avaliação (dia seguinte)", description: "Clientes que compraram ontem — convidar para avaliar.", isReview: true },
  { key: "no_purchase_15_29", label: "Sem compra 15–29 dias", description: "", range: [15, 29] },
  { key: "no_purchase_30_59", label: "Sem compra 30–59 dias", description: "", range: [30, 59] },
  { key: "no_purchase_60_89", label: "Sem compra 60–89 dias", description: "", range: [60, 89] },
  { key: "no_purchase_90", label: "Sem compra 90+ dias", description: "", range: [90, null] },
];

interface CustomerRow {
  id: string;
  restaurant_id: string;
  name: string;
  phone: string | null;
  orders_count: number | null;
  last_order_at: string | null;
  ticket_medio: number;
  reference_date: string;
  status: "pending" | "sent";
  sent_at?: string | null;
}

interface CustomTask {
  id: string;
  title: string;
  message_template: string;
  restaurant_ids: string[];
  applies_to_all: boolean;
  filter_days: number | null;
  min_orders: number | null;
  client_type: string | null;
  active: boolean;
}

const CLIENT_TYPE_OPTIONS: { value: string; label: string; min: number; max: number | null }[] = [
  { value: "new", label: "Novo Cliente (1–2)", min: 1, max: 2 },
  { value: "frequent", label: "Comprador Frequente (3–4)", min: 3, max: 4 },
  { value: "best", label: "Melhor Comprador (5–7)", min: 5, max: 7 },
  { value: "elite", label: "Comprador Elite (8–15)", min: 8, max: 15 },
  { value: "diamond", label: "Comprador Diamond (+15)", min: 16, max: null },
];

function onlyDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function buildWhatsAppLink(phone: string | null, message: string): string | null {
  const d = onlyDigits(phone);
  if (d.length < 10) return null;
  const withCountry = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

function personalize(template: string, name: string): string {
  return (template || "").replace(/\{nome\}/gi, name || "");
}

export function CrmTasksView({
  restaurantId,
  isAdmin = false,
}: {
  restaurantId: string | null; // null = "todos" (admin)
  isAdmin?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<TaskKey | "custom">("review_next_day");
  const [rows, setRows] = useState<Record<TaskKey, CustomerRow[]>>({} as any);
  const [messages, setMessages] = useState<Record<TaskKey, string>>({} as any);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "sent">("all");
  const [groupFilter, setGroupFilter] = useState<Record<TaskKey, "pending" | "sent">>({} as any);

  const [loading, setLoading] = useState(false);
  const [configOpen, setConfigOpen] = useState<TaskKey | null>(null);
  const [configText, setConfigText] = useState("");
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [adminTemplate, setAdminTemplate] = useState("");
  const [adminSettingsId, setAdminSettingsId] = useState<string | null>(null);
  const [restaurantInfo, setRestaurantInfo] = useState<{ id: string; name: string; phone: string | null; whatsapp_url: string | null } | null>(null);

  // custom tasks state
  const [customTasks, setCustomTasks] = useState<CustomTask[]>([]);
  const [allRestaurants, setAllRestaurants] = useState<{ id: string; name: string }[]>([]);
  const [customEditor, setCustomEditor] = useState<CustomTask | null>(null);
  const [customExpanded, setCustomExpanded] = useState<Record<string, boolean>>({});
  const [customCustomers, setCustomCustomers] = useState<Record<string, CustomerRow[]>>({});
  const [customLoading, setCustomLoading] = useState<Record<string, boolean>>({});

  const loadMessages = async () => {
    if (!restaurantId) { setMessages({} as any); return; }
    const { data } = await supabase
      .from("crm_task_messages")
      .select("task_key,template")
      .eq("restaurant_id", restaurantId);
    const m: any = {};
    (data ?? []).forEach((r: any) => { m[r.task_key] = r.template; });
    setMessages(m);
  };

  const loadAdminSettings = async () => {
    const { data } = await supabase.from("crm_admin_settings").select("*").limit(1).maybeSingle();
    if (data) {
      setAdminSettingsId((data as any).id);
      setAdminTemplate((data as any).notify_template ?? "");
    } else {
      setAdminSettingsId(null);
      setAdminTemplate("");
    }
  };

  const loadRestaurantInfo = async () => {
    if (!restaurantId) { setRestaurantInfo(null); return; }
    const { data } = await supabase.from("restaurants").select("id,name,phone,whatsapp_url").eq("id", restaurantId).maybeSingle();
    setRestaurantInfo((data as any) ?? null);
  };

  const loadAllRestaurants = async () => {
    const { data } = await supabase.from("restaurants").select("id,name").order("name");
    setAllRestaurants((data as any) ?? []);
  };

  const loadCustomTasks = async () => {
    const { data, error } = await sb.from("crm_custom_tasks").select("*").order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    setCustomTasks((data ?? []) as CustomTask[]);
  };

  const loadTask = async (task: TaskDef): Promise<CustomerRow[]> => {
    // Cutoff: só considerar clientes/pedidos a partir de 01/06/2026
    const CUTOFF_ISO = "2026-06-01T00:00:00.000Z";
    // Cutoff específico da aba "Avaliação (dia seguinte)": recomeçar a contar a partir de hoje.
    const REVIEW_START_ISO = "2026-11-19T00:00:00.000Z";

    let q = supabase
      .from("customers")
      .select("id,restaurant_id,name,phone,orders_count,last_order_at")
      .not("last_order_at", "is", null)
      .gte("last_order_at", task.isReview ? REVIEW_START_ISO : CUTOFF_ISO)
      .limit(500);
    if (restaurantId) q = q.eq("restaurant_id", restaurantId);

    const now = new Date();
    if (task.isReview) {
      const today = new Date(now); today.setHours(0, 0, 0, 0);
      q = q.lt("last_order_at", today.toISOString());
    } else if (task.range) {
      const [minD, maxD] = task.range;
      const maxDate = new Date(now.getTime() - minD * 86400000).toISOString();
      q = q.lte("last_order_at", maxDate);
      if (maxD !== null) {
        const minDate = new Date(now.getTime() - (maxD + 1) * 86400000).toISOString();
        q = q.gt("last_order_at", minDate);
      }
    }
    const { data: cust, error } = await q;
    if (error) { toast.error(error.message); return []; }
    const customers = (cust ?? []) as any[];
    if (customers.length === 0) return [];

    const restIds = Array.from(new Set(customers.map((c) => c.restaurant_id))) as string[];
    const orders: any[] = [];
    if (restIds.length > 0) {
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data: batch, error: oErr } = await supabase
          .from("orders")
          .select("customer_phone,total,restaurant_id")
          .neq("status", "cancelled")
          .gte("created_at", CUTOFF_ISO)
          .in("restaurant_id", restIds)
          .range(from, from + PAGE - 1);
        if (oErr) break;
        const arr = batch ?? [];
        orders.push(...arr);
        if (arr.length < PAGE) break;
      }
    }

    const agg = new Map<string, { sum: number; count: number }>();
    (orders ?? []).forEach((o: any) => {
      const digits = onlyDigits(o.customer_phone);
      if (!digits) return;
      const key = `${o.restaurant_id}|${digits}`;
      const cur = agg.get(key) ?? { sum: 0, count: 0 };
      cur.sum += Number(o.total ?? 0);
      cur.count += 1;
      agg.set(key, cur);
    });

    const { data: sends } = await supabase
      .from("crm_task_sends")
      .select("customer_id,reference_date,status,sent_at")
      .eq("task_key", task.key)
      .in("restaurant_id", restIds);
    const sendMap = new Map<string, { status: string; sent_at: string | null }>();
    (sends ?? []).forEach((s: any) => {
      sendMap.set(`${s.customer_id}|${s.reference_date}`, { status: s.status, sent_at: s.sent_at });
    });

    return customers.map((c) => {
      const key = `${c.restaurant_id}|${onlyDigits(c.phone)}`;
      const a = agg.get(key);
      const refDate = (c.last_order_at ?? "").slice(0, 10);
      const s = sendMap.get(`${c.id}|${refDate}`);
      return {
        id: c.id,
        restaurant_id: c.restaurant_id,
        name: c.name,
        phone: c.phone,
        orders_count: c.orders_count,
        last_order_at: c.last_order_at,
        ticket_medio: a && a.count > 0 ? a.sum / a.count : 0,
        reference_date: refDate,
        status: (s?.status === "sent" ? "sent" : "pending") as "pending" | "sent",
        sent_at: s?.sent_at ?? null,
      };
    });
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const results = await Promise.all(TASKS.map((t) => loadTask(t)));
      const map: any = {};
      TASKS.forEach((t, i) => { map[t.key] = results[i]; });
      setRows(map);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomTaskCustomers = async (task: CustomTask) => {
    setCustomLoading((p) => ({ ...p, [task.id]: true }));
    try {
      const CUTOFF_ISO = "2026-06-01T00:00:00.000Z";
      const targetRests = restaurantId
        ? [restaurantId]
        : task.applies_to_all
          ? allRestaurants.map((r) => r.id)
          : task.restaurant_ids;
      if (targetRests.length === 0) {
        setCustomCustomers((p) => ({ ...p, [task.id]: [] }));
        return;
      }

      let q = supabase
        .from("customers")
        .select("id,restaurant_id,name,phone,orders_count,last_order_at")
        .in("restaurant_id", targetRests)
        .not("last_order_at", "is", null)
        .gte("last_order_at", CUTOFF_ISO)
        .limit(1000);

      if (task.filter_days) {
        const since = new Date(Date.now() - task.filter_days * 86400000).toISOString();
        q = q.gte("last_order_at", since);
      }
      if (task.min_orders && task.min_orders > 0) {
        q = q.gte("orders_count", task.min_orders);
      }
      if (task.client_type) {
        const opt = CLIENT_TYPE_OPTIONS.find((o) => o.value === task.client_type);
        if (opt) {
          q = q.gte("orders_count", opt.min);
          if (opt.max !== null) q = q.lte("orders_count", opt.max);
        }
      }

      const { data: cust, error } = await q;
      if (error) { toast.error(error.message); return; }
      const customers = (cust ?? []) as any[];

      // ticket medio
      const restIds = Array.from(new Set(customers.map((c) => c.restaurant_id))) as string[];
      const agg = new Map<string, { sum: number; count: number }>();
      if (restIds.length > 0) {
        const PAGE = 1000;
        for (let from = 0; ; from += PAGE) {
          const { data: batch, error: oErr } = await supabase
            .from("orders")
            .select("customer_phone,total,restaurant_id")
            .neq("status", "cancelled")
            .gte("created_at", CUTOFF_ISO)
            .in("restaurant_id", restIds)
            .range(from, from + PAGE - 1);
          if (oErr) break;
          const arr = batch ?? [];
          arr.forEach((o: any) => {
            const digits = onlyDigits(o.customer_phone);
            if (!digits) return;
            const key = `${o.restaurant_id}|${digits}`;
            const cur = agg.get(key) ?? { sum: 0, count: 0 };
            cur.sum += Number(o.total ?? 0);
            cur.count += 1;
            agg.set(key, cur);
          });
          if (arr.length < PAGE) break;
        }
      }

      const taskKey = `custom:${task.id}`;
      const { data: sends } = await supabase
        .from("crm_task_sends")
        .select("customer_id,reference_date,status,sent_at")
        .eq("task_key", taskKey)
        .in("restaurant_id", restIds);
      const sendMap = new Map<string, { status: string; sent_at: string | null }>();
      (sends ?? []).forEach((s: any) => {
        sendMap.set(`${s.customer_id}|${s.reference_date}`, { status: s.status, sent_at: s.sent_at });
      });

      const refDate = new Date().toISOString().slice(0, 10);
      const result: CustomerRow[] = customers.map((c) => {
        const key = `${c.restaurant_id}|${onlyDigits(c.phone)}`;
        const a = agg.get(key);
        const s = sendMap.get(`${c.id}|${refDate}`);
        return {
          id: c.id,
          restaurant_id: c.restaurant_id,
          name: c.name,
          phone: c.phone,
          orders_count: c.orders_count,
          last_order_at: c.last_order_at,
          ticket_medio: a && a.count > 0 ? a.sum / a.count : 0,
          reference_date: refDate,
          status: (s?.status === "sent" ? "sent" : "pending") as "pending" | "sent",
          sent_at: s?.sent_at ?? null,
        };
      });

      setCustomCustomers((p) => ({ ...p, [task.id]: result }));
    } finally {
      setCustomLoading((p) => ({ ...p, [task.id]: false }));
    }
  };

  useEffect(() => { loadMessages(); loadRestaurantInfo(); loadAll(); loadCustomTasks(); }, [restaurantId]);
  useEffect(() => { if (isAdmin) { loadAdminSettings(); loadAllRestaurants(); } }, [isAdmin]);

  const openConfig = (key: TaskKey) => {
    if (!restaurantId) { toast.error("Selecione um restaurante para configurar a mensagem"); return; }
    setConfigText(messages[key] ?? "");
    setConfigOpen(key);
  };

  const saveConfig = async () => {
    if (!configOpen || !restaurantId) return;
    const payload = { restaurant_id: restaurantId, task_key: configOpen, template: configText };
    const { error } = await supabase.from("crm_task_messages").upsert(payload, { onConflict: "restaurant_id,task_key" });
    if (error) return toast.error(error.message);
    toast.success("Mensagem salva");
    setConfigOpen(null);
    loadMessages();
  };

  const handleSend = async (task: TaskKey, row: CustomerRow) => {
    const template = messages[task] ?? "";
    if (!template) { toast.error("Configure a mensagem antes de enviar"); return; }
    const link = buildWhatsAppLink(row.phone, personalize(template, row.name));
    if (!link) { toast.error("Cliente sem telefone válido"); return; }

    const payload = {
      restaurant_id: row.restaurant_id,
      task_key: task,
      customer_id: row.id,
      reference_date: row.reference_date,
      status: "sent",
      sent_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("crm_task_sends").upsert(payload, {
      onConflict: "restaurant_id,task_key,customer_id,reference_date",
    });
    if (error) { toast.error(error.message); return; }
    window.open(link, "_blank", "noopener,noreferrer");
    setRows((prev) => ({
      ...prev,
      [task]: prev[task].map((r) => (r.id === row.id && r.reference_date === row.reference_date ? { ...r, status: "sent", sent_at: payload.sent_at } : r)),
    }));
  };

  const handleSendCustom = async (task: CustomTask, row: CustomerRow) => {
    const template = task.message_template ?? "";
    if (!template) { toast.error("Tarefa sem mensagem definida"); return; }
    const link = buildWhatsAppLink(row.phone, personalize(template, row.name));
    if (!link) { toast.error("Cliente sem telefone válido"); return; }

    const payload = {
      restaurant_id: row.restaurant_id,
      task_key: `custom:${task.id}`,
      customer_id: row.id,
      reference_date: row.reference_date,
      status: "sent",
      sent_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("crm_task_sends").upsert(payload, {
      onConflict: "restaurant_id,task_key,customer_id,reference_date",
    });
    if (error) { toast.error(error.message); return; }
    window.open(link, "_blank", "noopener,noreferrer");
    setCustomCustomers((prev) => ({
      ...prev,
      [task.id]: (prev[task.id] ?? []).map((r) => r.id === row.id && r.reference_date === row.reference_date
        ? { ...r, status: "sent", sent_at: payload.sent_at }
        : r),
    }));
  };

  const saveAdminTemplate = async () => {
    const payload: any = { notify_template: adminTemplate };
    if (adminSettingsId) payload.id = adminSettingsId;
    const { error } = await supabase.from("crm_admin_settings").upsert(payload);
    if (error) return toast.error(error.message);
    toast.success("Modelo salvo");
    loadAdminSettings();
  };

  const notifyRestaurant = () => {
    if (!restaurantInfo) return;
    if (!adminTemplate) { toast.error("Configure a mensagem de notificação"); return; }
    const msg = personalize(adminTemplate, restaurantInfo.name);
    const link = buildWhatsAppLink(restaurantInfo.phone, msg);
    if (!link) { toast.error("Restaurante sem telefone válido"); return; }
    window.open(link, "_blank", "noopener,noreferrer");
  };

  const filtered = (list: CustomerRow[] | undefined) => {
    const arr = list ?? [];
    if (statusFilter === "all") return arr;
    return arr.filter((r) => r.status === statusFilter);
  };

  // Custom tasks visible to current context
  const visibleCustomTasks = useMemo(() => {
    if (isAdmin) return customTasks;
    if (!restaurantId) return [];
    return customTasks.filter((t) => t.applies_to_all || t.restaurant_ids.includes(restaurantId));
  }, [customTasks, isAdmin, restaurantId]);

  const toggleCustomExpand = (task: CustomTask) => {
    const isOpen = customExpanded[task.id];
    setCustomExpanded((p) => ({ ...p, [task.id]: !isOpen }));
    if (!isOpen && !customCustomers[task.id]) {
      loadCustomTaskCustomers(task);
    }
  };

  const saveCustomTask = async () => {
    if (!customEditor) return;
    if (!customEditor.title.trim()) { toast.error("Informe um título"); return; }
    if (!customEditor.applies_to_all && customEditor.restaurant_ids.length === 0) {
      toast.error("Selecione ao menos um restaurante");
      return;
    }
    const payload: any = {
      title: customEditor.title.trim(),
      message_template: customEditor.message_template,
      restaurant_ids: customEditor.applies_to_all ? [] : customEditor.restaurant_ids,
      applies_to_all: customEditor.applies_to_all,
      filter_days: customEditor.filter_days,
      min_orders: customEditor.min_orders,
      client_type: customEditor.client_type,
      active: customEditor.active,
    };
    let res;
    if (customEditor.id) {
      res = await sb.from("crm_custom_tasks").update(payload).eq("id", customEditor.id);
    } else {
      res = await sb.from("crm_custom_tasks").insert(payload);
    }
    if (res.error) return toast.error(res.error.message);
    toast.success("Tarefa salva");
    setCustomEditor(null);
    loadCustomTasks();
  };

  const deleteCustomTask = async (id: string) => {
    if (!confirm("Excluir esta tarefa?")) return;
    const { error } = await sb.from("crm_custom_tasks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Tarefa excluída");
    loadCustomTasks();
  };

  const restaurantNames = (ids: string[]) =>
    ids.map((id) => allRestaurants.find((r) => r.id === id)?.name ?? "").filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={() => { loadAll(); loadCustomTasks(); }} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
        {isAdmin && (
          <>
            <Button variant="outline" size="sm" onClick={() => setNotifyOpen(true)}>
              <Settings className="w-4 h-4 mr-2" />Modelo notificação
            </Button>
            {restaurantInfo && (
              <Button size="sm" onClick={notifyRestaurant}>
                <Send className="w-4 h-4 mr-2" />Notificar restaurante
              </Button>
            )}
          </>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TaskKey | "custom")}>
        <TabsList className="w-full flex-wrap h-auto">
          {TASKS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="text-xs">
              {t.label}
              <Badge variant="secondary" className="ml-2">{(rows[t.key] ?? []).filter((r) => r.status === "pending").length}</Badge>
            </TabsTrigger>
          ))}
          <TabsTrigger value="custom" className="text-xs">
            Personalizado
            <Badge variant="secondary" className="ml-2">{visibleCustomTasks.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {TASKS.map((t) => {
          const list = rows[t.key] ?? [];
          const pending = list.filter((r) => r.status === "pending");
          const sent = list.filter((r) => r.status === "sent");
          const sub = groupFilter[t.key] ?? "pending";
          const visible = sub === "sent" ? sent : pending;
          return (
            <TabsContent key={t.key} value={t.key} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{t.description}</p>
                <Button variant="outline" size="sm" onClick={() => openConfig(t.key)}>
                  <Settings className="w-4 h-4 mr-2" />Configurar mensagem
                </Button>
              </div>

              <Tabs value={sub} onValueChange={(v) => setGroupFilter((p) => ({ ...p, [t.key]: v as "pending" | "sent" }))}>
                <TabsList>
                  <TabsTrigger value="pending">
                    Pendentes <Badge variant="secondary" className="ml-2">{pending.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="sent">
                    Enviadas <Badge variant="secondary" className="ml-2">{sent.length}</Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <Card>
                <CardContent className="p-0">
                  {loading ? (
                    <div className="p-8 text-center text-muted-foreground">Carregando...</div>
                  ) : visible.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      {sub === "sent" ? "Nenhuma mensagem enviada." : "Nenhum cliente pendente."}
                    </div>
                  ) : (
                    <div className="divide-y">
                      {visible.map((r) => (
                        <div key={`${r.id}-${r.reference_date}`} className="p-3 flex flex-wrap items-center gap-3 justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium flex items-center gap-2">
                              {r.name}
                              {r.status === "sent" ? (
                                <Badge className="bg-success text-success-foreground">Enviado</Badge>
                              ) : (
                                <Badge variant="secondary">Pendente</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                              <span>{r.phone ?? "—"}</span>
                              <span>Ticket médio: {brl(r.ticket_medio)}</span>
                              <span>{r.orders_count ?? 0} pedidos</span>
                              <span>Último: {r.last_order_at ? new Date(r.last_order_at).toLocaleDateString("pt-BR") : "—"}</span>
                              {r.status === "sent" && r.sent_at && (
                                <span>Enviado em: {new Date(r.sent_at).toLocaleString("pt-BR")}</span>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant={r.status === "sent" ? "outline" : "default"}
                            onClick={() => handleSend(t.key, r)}
                            className="gap-2"
                          >
                            <MessageCircle className="w-4 h-4" />
                            {r.status === "sent" ? "Reenviar" : "Enviar"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}

        <TabsContent value="custom" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Tarefas personalizadas criadas pelo admin, com filtros customizados de clientes.
            </p>
            {isAdmin && (
              <Button size="sm" onClick={() => setCustomEditor({
                id: "", title: "", message_template: "", restaurant_ids: [],
                applies_to_all: true, filter_days: null, min_orders: null, client_type: null, active: true,
              })}>
                <Plus className="w-4 h-4 mr-2" />Nova tarefa
              </Button>
            )}
          </div>

          {visibleCustomTasks.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhuma tarefa personalizada.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {visibleCustomTasks.map((task) => {
                const isOpen = !!customExpanded[task.id];
                const list = customCustomers[task.id] ?? [];
                const pending = list.filter((r) => r.status === "pending");
                const sent = list.filter((r) => r.status === "sent");
                const filterBadges: string[] = [];
                if (task.filter_days) filterBadges.push(`Últimos ${task.filter_days} dias`);
                if (task.min_orders) filterBadges.push(`Mín. ${task.min_orders} pedidos`);
                if (task.client_type) {
                  const ct = CLIENT_TYPE_OPTIONS.find((o) => o.value === task.client_type);
                  if (ct) filterBadges.push(ct.label);
                }
                return (
                  <Card key={task.id}>
                    <CardContent className="p-3 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <button className="flex items-center gap-2 text-left" onClick={() => toggleCustomExpand(task)}>
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            <div className="font-medium">{task.title}</div>
                          </button>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {task.applies_to_all
                              ? <Badge variant="secondary">Todos os restaurantes</Badge>
                              : restaurantNames(task.restaurant_ids).map((n) => (
                                  <Badge key={n} variant="outline">{n}</Badge>
                                ))}
                            {filterBadges.map((b) => <Badge key={b} variant="outline">{b}</Badge>)}
                          </div>
                          {task.message_template && (
                            <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">{task.message_template}</p>
                          )}
                        </div>
                        {isAdmin && (
                          <div className="flex gap-1">
                            <Button size="icon" variant="outline" onClick={() => setCustomEditor(task)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="outline" onClick={() => deleteCustomTask(task.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {isOpen && (
                        <div className="border-t pt-3">
                          {customLoading[task.id] ? (
                            <div className="p-6 text-center text-muted-foreground text-sm">Carregando clientes...</div>
                          ) : list.length === 0 ? (
                            <div className="p-6 text-center text-muted-foreground text-sm">Nenhum cliente encontrado com esse filtro.</div>
                          ) : (
                            <>
                              <div className="text-xs text-muted-foreground mb-2">
                                {pending.length} pendentes · {sent.length} enviadas
                              </div>
                              <div className="divide-y">
                                {list.map((r) => (
                                  <div key={`${r.id}-${r.reference_date}`} className="py-2 flex flex-wrap items-center gap-3 justify-between">
                                    <div className="min-w-0 flex-1">
                                      <div className="font-medium flex items-center gap-2">
                                        {r.name}
                                        {r.status === "sent"
                                          ? <Badge className="bg-success text-success-foreground">Enviado</Badge>
                                          : <Badge variant="secondary">Pendente</Badge>}
                                      </div>
                                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                                        <span>{r.phone ?? "—"}</span>
                                        <span>Ticket médio: {brl(r.ticket_medio)}</span>
                                        <span>{r.orders_count ?? 0} pedidos</span>
                                        <span>Último: {r.last_order_at ? new Date(r.last_order_at).toLocaleDateString("pt-BR") : "—"}</span>
                                      </div>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant={r.status === "sent" ? "outline" : "default"}
                                      onClick={() => handleSendCustom(task, r)}
                                      className="gap-2"
                                    >
                                      <MessageCircle className="w-4 h-4" />
                                      {r.status === "sent" ? "Reenviar" : "Enviar"}
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={configOpen !== null} onOpenChange={(o) => !o && setConfigOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar mensagem</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Modelo da mensagem</Label>
            <Textarea rows={6} value={configText} onChange={(e) => setConfigText(e.target.value)} placeholder="Ex.: Olá {nome}, tudo bem?" />
            <p className="text-xs text-muted-foreground">Use <code>{"{nome}"}</code> para inserir o nome do cliente automaticamente.</p>
          </div>
          <DialogFooter>
            <Button onClick={saveConfig}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={notifyOpen} onOpenChange={setNotifyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modelo de notificação para restaurantes</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea rows={6} value={adminTemplate} onChange={(e) => setAdminTemplate(e.target.value)} placeholder="Olá {nome}, você tem tarefas pendentes no CRM..." />
            <p className="text-xs text-muted-foreground">Use <code>{"{nome}"}</code> para o nome do restaurante.</p>
          </div>
          <DialogFooter>
            <Button onClick={() => { saveAdminTemplate(); setNotifyOpen(false); }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom task editor */}
      <Dialog open={customEditor !== null} onOpenChange={(o) => !o && setCustomEditor(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{customEditor?.id ? "Editar tarefa personalizada" : "Nova tarefa personalizada"}</DialogTitle>
          </DialogHeader>
          {customEditor && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={customEditor.title} onChange={(e) => setCustomEditor({ ...customEditor, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Textarea rows={5} value={customEditor.message_template}
                  onChange={(e) => setCustomEditor({ ...customEditor, message_template: e.target.value })}
                  placeholder="Ex.: Olá {nome}, temos uma oferta especial para você!" />
                <p className="text-xs text-muted-foreground">Use <code>{"{nome}"}</code> para o nome do cliente.</p>
              </div>

              <div className="space-y-2">
                <Label>Restaurantes</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={customEditor.applies_to_all}
                    onCheckedChange={(v) => setCustomEditor({ ...customEditor, applies_to_all: !!v, restaurant_ids: v ? [] : customEditor.restaurant_ids })}
                  />
                  <span className="text-sm">Aplicar a todos os restaurantes</span>
                </div>
                {!customEditor.applies_to_all && (
                  <div className="border rounded p-2 max-h-56 overflow-auto space-y-1">
                    {allRestaurants.map((r) => {
                      const checked = customEditor.restaurant_ids.includes(r.id);
                      return (
                        <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5 hover:bg-accent rounded">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const ids = v
                                ? [...customEditor.restaurant_ids, r.id]
                                : customEditor.restaurant_ids.filter((x) => x !== r.id);
                              setCustomEditor({ ...customEditor, restaurant_ids: ids });
                            }}
                          />
                          {r.name}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Compraram nos últimos</Label>
                  <Select
                    value={customEditor.filter_days?.toString() ?? "none"}
                    onValueChange={(v) => setCustomEditor({ ...customEditor, filter_days: v === "none" ? null : Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Qualquer data</SelectItem>
                      <SelectItem value="15">15 dias</SelectItem>
                      <SelectItem value="30">30 dias</SelectItem>
                      <SelectItem value="60">60 dias</SelectItem>
                      <SelectItem value="90">90 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Mínimo de pedidos</Label>
                  <Input
                    type="number" min={0}
                    value={customEditor.min_orders ?? ""}
                    onChange={(e) => setCustomEditor({ ...customEditor, min_orders: e.target.value ? Number(e.target.value) : null })}
                    placeholder="Sem mínimo"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Categoria de cliente</Label>
                  <Select
                    value={customEditor.client_type ?? "none"}
                    onValueChange={(v) => setCustomEditor({ ...customEditor, client_type: v === "none" ? null : v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Todas</SelectItem>
                      {CLIENT_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  checked={customEditor.active}
                  onCheckedChange={(v) => setCustomEditor({ ...customEditor, active: !!v })}
                />
                <span className="text-sm">Tarefa ativa</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomEditor(null)}>Cancelar</Button>
            <Button onClick={saveCustomTask}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
