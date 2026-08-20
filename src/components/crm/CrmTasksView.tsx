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
import { MessageCircle, Settings, Send, RefreshCw, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Store, Users } from "lucide-react";
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

type ClientStatus = "active" | "inactive" | "sleeping" | "risk";

const CLIENT_STATUS_OPTIONS: { value: ClientStatus; label: string; min: number; max: number | null }[] = [
  { value: "active", label: "Ativo (≤15 dias)", min: 0, max: 15 },
  { value: "inactive", label: "Inativo (16–30 dias)", min: 16, max: 30 },
  { value: "sleeping", label: "Dormindo (31–90 dias)", min: 31, max: 90 },
  { value: "risk", label: "Em risco (+90 dias)", min: 91, max: null },
];

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function clientStatusOf(iso: string | null): ClientStatus | null {
  const d = daysSince(iso);
  if (d === null) return null;
  for (const s of CLIENT_STATUS_OPTIONS) {
    if (d >= s.min && (s.max === null || d <= s.max)) return s.value;
  }
  return null;
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
  client_statuses: string[];
  selected_customer_ids: string[];
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

/** Instante UTC correspondente à meia-noite de hoje no fuso de Brasília (GMT-3). */
function brToday(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  // parts = "YYYY-MM-DD" no fuso de Brasília; meia-noite BRT = 03:00 UTC
  return new Date(`${parts}T03:00:00.000Z`);
}

/** Busca todos os registros de uma query paginando (Supabase limita a 1000 linhas). */
async function fetchAllRows<T = any>(build: () => any, page = 1000): Promise<T[]> {
  const acc: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build().range(from, from + page - 1);
    if (error) throw error;
    const arr = (data ?? []) as T[];
    acc.push(...arr);
    if (arr.length < page) break;
  }
  return acc;
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
  restaurantId: string | null;
  isAdmin?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<TaskKey | "custom">("review_next_day");
  const [rows, setRows] = useState<Record<TaskKey, CustomerRow[]>>({} as any);
  const [messages, setMessages] = useState<Record<TaskKey, string>>({} as any);
  const [groupFilter, setGroupFilter] = useState<Record<TaskKey, "pending" | "sent">>({} as any);

  const [loading, setLoading] = useState(false);
  const [configOpen, setConfigOpen] = useState<TaskKey | null>(null);
  const [configText, setConfigText] = useState("");
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [adminTemplate, setAdminTemplate] = useState("");
  const [adminSettingsId, setAdminSettingsId] = useState<string | null>(null);
  const [restaurantInfo, setRestaurantInfo] = useState<{ id: string; name: string; phone: string | null; whatsapp_url: string | null } | null>(null);

  const [customTasks, setCustomTasks] = useState<CustomTask[]>([]);
  const [allRestaurants, setAllRestaurants] = useState<{ id: string; name: string }[]>([]);
  const [customEditor, setCustomEditor] = useState<CustomTask | null>(null);
  const [customExpanded, setCustomExpanded] = useState<Record<string, boolean>>({});
  const [customCustomers, setCustomCustomers] = useState<Record<string, CustomerRow[]>>({});
  const [customLoading, setCustomLoading] = useState<Record<string, boolean>>({});

  // Editor sub-state
  const [restSelectOpen, setRestSelectOpen] = useState(false);
  const [restSelectDraft, setRestSelectDraft] = useState<{ all: boolean; ids: string[] }>({ all: true, ids: [] });
  const [editorCandidates, setEditorCandidates] = useState<CustomerRow[] | null>(null);
  const [editorCandidatesLoading, setEditorCandidatesLoading] = useState(false);

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
    const CUTOFF_ISO = "2026-08-05T00:00:00.000Z";
    // Get today at 00:00 in Brasilia time (GMT-3)
    const now = new Date();
    // Brasilia is UTC-3. To get the start of the day in Brasilia:
    const brDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const today = new Date(brDate.getFullYear(), brDate.getMonth(), brDate.getDate());
    
    // For review_next_day, we only look at orders from yesterday onwards
    // BUT we also apply the 5-day expiration rule for pending items
    const REVIEW_START_ISO = new Date(today.getTime() - 7 * 86400000).toISOString();

    let q = supabase
      .from("customers")
      .select("id,restaurant_id,name,phone,orders_count,last_order_at")
      .not("last_order_at", "is", null)
      .gte("last_order_at", task.isReview ? REVIEW_START_ISO : CUTOFF_ISO)
      .limit(500);
    if (restaurantId) q = q.eq("restaurant_id", restaurantId);

    if (task.isReview) {
      // Pedidos que ocorreram ANTES de hoje (ontem ou antes até 5 dias atrás)
      q = q.lt("last_order_at", today.toISOString());
    } else if (task.range) {
      const [minD, maxD] = task.range;
      const maxDate = new Date(today.getTime() - minD * 86400000).toISOString();
      q = q.lte("last_order_at", maxDate);
      if (maxD !== null) {
        const minDate = new Date(today.getTime() - (maxD + 1) * 86400000).toISOString();
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

    return customers
      .map((c) => {
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
      })
      .filter((row) => {
        // Regra de 5 dias para Avaliação (dia seguinte)
        if (task.isReview && row.status === "pending") {
          const orderDate = new Date(row.last_order_at!);
          const orderDay = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate());
          const diffDays = Math.floor((today.getTime() - orderDay.getTime()) / 86400000);
          return diffDays <= 5;
        }
        return true;
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

  // Fetch customers for a given filter set (used both at runtime for a task and in editor preview)
  const fetchCustomersFor = async (opts: {
    restaurantIds: string[];
    minOrders?: number | null;
    clientType?: string | null;
    clientStatuses?: string[];
    selectedCustomerIds?: string[];
    withTicket?: boolean;
    taskKey?: string;
  }): Promise<CustomerRow[]> => {
    const CUTOFF_ISO = "2026-08-05T00:00:00.000Z";
    if (opts.restaurantIds.length === 0) return [];

    const hasSelection = (opts.selectedCustomerIds ?? []).length > 0;

    let q = supabase
      .from("customers")
      .select("id,restaurant_id,name,phone,orders_count,last_order_at")
      .in("restaurant_id", opts.restaurantIds)
      .limit(2000);

    if (hasSelection) {
      q = q.in("id", opts.selectedCustomerIds as string[]);
    } else {
      q = q.not("last_order_at", "is", null).gte("last_order_at", CUTOFF_ISO);
      if (opts.minOrders && opts.minOrders > 0) q = q.gte("orders_count", opts.minOrders);
      if (opts.clientType) {
        const opt = CLIENT_TYPE_OPTIONS.find((o) => o.value === opts.clientType);
        if (opt) {
          q = q.gte("orders_count", opt.min);
          if (opt.max !== null) q = q.lte("orders_count", opt.max);
        }
      }
    }

    const { data, error } = await q;
    if (error) { toast.error(error.message); return []; }
    let customers = (data ?? []) as any[];

    // In-memory client_statuses filter (only when not using explicit selection)
    if (!hasSelection && (opts.clientStatuses ?? []).length > 0) {
      const set = new Set(opts.clientStatuses);
      customers = customers.filter((c) => {
        const s = clientStatusOf(c.last_order_at);
        return s && set.has(s);
      });
    }

    const restIds = Array.from(new Set(customers.map((c) => c.restaurant_id))) as string[];

    // Ticket médio (optional)
    const agg = new Map<string, { sum: number; count: number }>();
    if (opts.withTicket && restIds.length > 0) {
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

    // Sends map (only if a taskKey given)
    const sendMap = new Map<string, { status: string; sent_at: string | null }>();
    if (opts.taskKey && restIds.length > 0) {
      const { data: sends } = await supabase
        .from("crm_task_sends")
        .select("customer_id,reference_date,status,sent_at")
        .eq("task_key", opts.taskKey)
        .in("restaurant_id", restIds);
      (sends ?? []).forEach((s: any) => {
        sendMap.set(`${s.customer_id}|${s.reference_date}`, { status: s.status, sent_at: s.sent_at });
      });
    }

    const refDate = new Date().toISOString().slice(0, 10);
    return customers.map((c) => {
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
  };

  const loadCustomTaskCustomers = async (task: CustomTask, withTicket = true) => {
    setCustomLoading((p) => ({ ...p, [task.id]: true }));
    try {
      const targetRests = restaurantId
        ? [restaurantId]
        : task.applies_to_all
          ? allRestaurants.map((r) => r.id)
          : task.restaurant_ids;
      const result = await fetchCustomersFor({
        restaurantIds: targetRests,
        minOrders: task.min_orders,
        clientType: task.client_type,
        clientStatuses: task.client_statuses ?? [],
        selectedCustomerIds: task.selected_customer_ids ?? [],
        withTicket,
        taskKey: `custom:${task.id}`,
      });
      setCustomCustomers((p) => ({ ...p, [task.id]: result }));
    } finally {
      setCustomLoading((p) => ({ ...p, [task.id]: false }));
    }
  };

  useEffect(() => { loadMessages(); loadRestaurantInfo(); loadAll(); loadCustomTasks(); }, [restaurantId]);
  useEffect(() => { if (isAdmin) { loadAdminSettings(); } loadAllRestaurants(); }, [isAdmin]);

  // Custom tasks visible to current context
  const visibleCustomTasks = useMemo(() => {
    if (isAdmin) return customTasks;
    if (!restaurantId) return [];
    return customTasks.filter((t) => t.applies_to_all || t.restaurant_ids.includes(restaurantId));
  }, [customTasks, isAdmin, restaurantId]);

  // Auto-load counts for all visible custom tasks (without ticket enrichment for perf)
  useEffect(() => {
    if (visibleCustomTasks.length === 0) return;
    visibleCustomTasks.forEach((t) => {
      if (customCustomers[t.id] === undefined && !customLoading[t.id]) {
        loadCustomTaskCustomers(t, false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCustomTasks, allRestaurants]);

  const customPendingTotal = useMemo(() => {
    let total = 0;
    visibleCustomTasks.forEach((t) => {
      const list = customCustomers[t.id] ?? [];
      total += list.filter((r) => r.status === "pending").length;
    });
    return total;
  }, [visibleCustomTasks, customCustomers]);

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

  const toggleCustomExpand = (task: CustomTask) => {
    const isOpen = customExpanded[task.id];
    setCustomExpanded((p) => ({ ...p, [task.id]: !isOpen }));
    if (!isOpen) {
      // reload with ticket info
      loadCustomTaskCustomers(task, true);
    }
  };

  const openNewCustom = () => {
    setEditorCandidates(null);
    setCustomEditor({
      id: "", title: "", message_template: "", restaurant_ids: [],
      applies_to_all: true, filter_days: null, min_orders: null, client_type: null,
      client_statuses: [], selected_customer_ids: [], active: true,
    });
  };

  const openEditCustom = (task: CustomTask) => {
    setEditorCandidates(null);
    setCustomEditor({
      ...task,
      client_statuses: task.client_statuses ?? [],
      selected_customer_ids: task.selected_customer_ids ?? [],
    });
  };

  const loadEditorCandidates = async () => {
    if (!customEditor) return;
    if (!customEditor.applies_to_all && customEditor.restaurant_ids.length === 0) {
      toast.error("Selecione ao menos um restaurante");
      return;
    }
    setEditorCandidatesLoading(true);
    try {
      const targetRests = customEditor.applies_to_all
        ? allRestaurants.map((r) => r.id)
        : customEditor.restaurant_ids;
      // when loading candidates we ignore selected_customer_ids so users can pick anew from filter matches
      const result = await fetchCustomersFor({
        restaurantIds: targetRests,
        minOrders: customEditor.min_orders,
        clientType: customEditor.client_type,
        clientStatuses: customEditor.client_statuses,
        withTicket: false,
      });
      // sort by last_order_at desc
      result.sort((a, b) => (b.last_order_at ?? "").localeCompare(a.last_order_at ?? ""));
      setEditorCandidates(result);
      // if no prior selection, pre-select all found
      if ((customEditor.selected_customer_ids ?? []).length === 0) {
        setCustomEditor({ ...customEditor, selected_customer_ids: result.map((r) => r.id) });
      }
    } finally {
      setEditorCandidatesLoading(false);
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
      client_statuses: customEditor.client_statuses,
      selected_customer_ids: customEditor.selected_customer_ids,
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
    setEditorCandidates(null);
    // reset customCustomers so counts refresh
    setCustomCustomers({});
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

  const openRestSelect = () => {
    if (!customEditor) return;
    setRestSelectDraft({ all: customEditor.applies_to_all, ids: [...customEditor.restaurant_ids] });
    setRestSelectOpen(true);
  };

  const confirmRestSelect = () => {
    if (!customEditor) return;
    setCustomEditor({
      ...customEditor,
      applies_to_all: restSelectDraft.all,
      restaurant_ids: restSelectDraft.all ? [] : restSelectDraft.ids,
    });
    setRestSelectOpen(false);
    setEditorCandidates(null);
  };

  const toggleEditorStatus = (s: ClientStatus) => {
    if (!customEditor) return;
    const cur = new Set(customEditor.client_statuses);
    cur.has(s) ? cur.delete(s) : cur.add(s);
    setCustomEditor({ ...customEditor, client_statuses: Array.from(cur) });
    setEditorCandidates(null);
  };

  const toggleCandidate = (id: string) => {
    if (!customEditor) return;
    const cur = new Set(customEditor.selected_customer_ids);
    cur.has(id) ? cur.delete(id) : cur.add(id);
    setCustomEditor({ ...customEditor, selected_customer_ids: Array.from(cur) });
  };

  const restSelectLabel = customEditor
    ? customEditor.applies_to_all
      ? `Todos os restaurantes (${allRestaurants.length})`
      : customEditor.restaurant_ids.length === 0
        ? "Selecionar restaurantes..."
        : customEditor.restaurant_ids.length === 1
          ? (allRestaurants.find((r) => r.id === customEditor.restaurant_ids[0])?.name ?? "1 restaurante")
          : `${customEditor.restaurant_ids.length} restaurantes`
    : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={() => { loadAll(); loadCustomTasks(); setCustomCustomers({}); }} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
        {isAdmin && (
          <Button size="sm" onClick={openNewCustom}>
            <Plus className="w-4 h-4 mr-2" />Tarefa personalizada
          </Button>
        )}
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
            <Badge variant="secondary" className="ml-2">{customPendingTotal}</Badge>
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
          <p className="text-sm text-muted-foreground">
            Tarefas personalizadas criadas pelo admin, com filtros customizados de clientes.
          </p>

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
                if (task.min_orders) filterBadges.push(`Mín. ${task.min_orders} pedidos`);
                if (task.client_type) {
                  const ct = CLIENT_TYPE_OPTIONS.find((o) => o.value === task.client_type);
                  if (ct) filterBadges.push(ct.label);
                }
                (task.client_statuses ?? []).forEach((s) => {
                  const opt = CLIENT_STATUS_OPTIONS.find((o) => o.value === s);
                  if (opt) filterBadges.push(opt.label);
                });
                if ((task.selected_customer_ids ?? []).length > 0) {
                  filterBadges.push(`${task.selected_customer_ids.length} contatos selecionados`);
                }
                return (
                  <Card key={task.id}>
                    <CardContent className="p-3 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <button className="flex items-center gap-2 text-left" onClick={() => toggleCustomExpand(task)}>
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            <div className="font-medium">{task.title}</div>
                            <Badge variant="secondary" className="ml-1">{pending.length} pendentes</Badge>
                          </button>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {isAdmin ? (
                              task.applies_to_all
                                ? <Badge variant="secondary">Todos os restaurantes</Badge>
                                : restaurantNames(task.restaurant_ids).map((n) => (
                                    <Badge key={n} variant="outline">{n}</Badge>
                                  ))
                            ) : (
                              restaurantInfo && <Badge variant="outline">{restaurantInfo.name}</Badge>
                            )}
                            {filterBadges.map((b) => <Badge key={b} variant="outline">{b}</Badge>)}
                          </div>
                          {task.message_template && (
                            <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">{task.message_template}</p>
                          )}
                        </div>
                        {isAdmin && (
                          <div className="flex gap-1">
                            <Button size="icon" variant="outline" onClick={() => openEditCustom(task)}>
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
      <Dialog open={customEditor !== null} onOpenChange={(o) => { if (!o) { setCustomEditor(null); setEditorCandidates(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
                <Textarea rows={4} value={customEditor.message_template}
                  onChange={(e) => setCustomEditor({ ...customEditor, message_template: e.target.value })}
                  placeholder="Ex.: Olá {nome}, temos uma oferta especial para você!" />
                <p className="text-xs text-muted-foreground">Use <code>{"{nome}"}</code> para o nome do cliente.</p>
              </div>

              <div className="space-y-2">
                <Label>Restaurantes</Label>
                <Button type="button" variant="outline" onClick={openRestSelect} className="w-full justify-start">
                  <Store className="w-4 h-4 mr-2" />
                  <span className="truncate">{restSelectLabel}</span>
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Status do cliente (mesmo filtro da aba Clientes)</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CLIENT_STATUS_OPTIONS.map((o) => {
                    const checked = customEditor.client_statuses.includes(o.value);
                    return (
                      <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer border rounded px-2 py-1.5 hover:bg-accent">
                        <Checkbox checked={checked} onCheckedChange={() => toggleEditorStatus(o.value)} />
                        <span className="truncate">{o.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">Sem seleção = qualquer status.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Mínimo de pedidos</Label>
                  <Input
                    type="number" min={0}
                    value={customEditor.min_orders ?? ""}
                    onChange={(e) => { setCustomEditor({ ...customEditor, min_orders: e.target.value ? Number(e.target.value) : null }); setEditorCandidates(null); }}
                    placeholder="Sem mínimo"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Categoria de cliente</Label>
                  <Select
                    value={customEditor.client_type ?? "none"}
                    onValueChange={(v) => { setCustomEditor({ ...customEditor, client_type: v === "none" ? null : v }); setEditorCandidates(null); }}
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

              <div className="border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <Users className="w-4 h-4" /> Contatos
                    {editorCandidates && (
                      <Badge variant="secondary">
                        {customEditor.selected_customer_ids.length} de {editorCandidates.length} selecionados
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {editorCandidates && editorCandidates.length > 0 && (
                      <>
                        <Button type="button" size="sm" variant="outline"
                          onClick={() => setCustomEditor({ ...customEditor, selected_customer_ids: editorCandidates.map((r) => r.id) })}>
                          Todos
                        </Button>
                        <Button type="button" size="sm" variant="outline"
                          onClick={() => setCustomEditor({ ...customEditor, selected_customer_ids: [] })}>
                          Nenhum
                        </Button>
                      </>
                    )}
                    <Button type="button" size="sm" onClick={loadEditorCandidates} disabled={editorCandidatesLoading}>
                      <RefreshCw className={`w-4 h-4 mr-2 ${editorCandidatesLoading ? "animate-spin" : ""}`} />
                      Carregar contatos
                    </Button>
                  </div>
                </div>

                {editorCandidates === null ? (
                  <div className="text-xs text-muted-foreground text-center py-6">
                    Ajuste os filtros e clique em <b>Carregar contatos</b> para escolher os clientes desta tarefa.
                  </div>
                ) : editorCandidates.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-6">
                    Nenhum cliente encontrado com esses filtros.
                  </div>
                ) : (
                  <div className="max-h-72 overflow-auto border rounded divide-y">
                    {editorCandidates.map((c) => {
                      const checked = customEditor.selected_customer_ids.includes(c.id);
                      const type = CLIENT_TYPE_OPTIONS.find((o) => (c.orders_count ?? 0) >= o.min && (o.max === null || (c.orders_count ?? 0) <= o.max));
                      const restName = allRestaurants.find((r) => r.id === c.restaurant_id)?.name ?? "—";
                      return (
                        <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent cursor-pointer text-sm">
                          <Checkbox checked={checked} onCheckedChange={() => toggleCandidate(c.id)} />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{c.name}</div>
                            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                              <span>{c.phone ?? "—"}</span>
                              <span>Restaurante: {restName}</span>
                              <span>Último: {c.last_order_at ? new Date(c.last_order_at).toLocaleDateString("pt-BR") : "—"}</span>
                              <span>{c.orders_count ?? 0} pedidos</span>
                              {type && <span>{type.label}</span>}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
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
            <Button variant="outline" onClick={() => { setCustomEditor(null); setEditorCandidates(null); }}>Cancelar</Button>
            <Button onClick={saveCustomTask}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sub-dialog: restaurant selection */}
      <Dialog open={restSelectOpen} onOpenChange={setRestSelectOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Selecionar restaurantes</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer border rounded px-2 py-1.5 hover:bg-accent">
              <Checkbox
                checked={restSelectDraft.all}
                onCheckedChange={(v) => setRestSelectDraft({ all: !!v, ids: !!v ? [] : restSelectDraft.ids })}
              />
              <span>Aplicar a todos os restaurantes</span>
            </label>
            {!restSelectDraft.all && (
              <>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setRestSelectDraft({ all: false, ids: allRestaurants.map((r) => r.id) })}>Todos</Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setRestSelectDraft({ all: false, ids: [] })}>Nenhum</Button>
                </div>
                <div className="border rounded p-2 max-h-72 overflow-auto space-y-1">
                  {allRestaurants.map((r) => {
                    const checked = restSelectDraft.ids.includes(r.id);
                    return (
                      <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5 hover:bg-accent rounded">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const ids = v ? [...restSelectDraft.ids, r.id] : restSelectDraft.ids.filter((x) => x !== r.id);
                            setRestSelectDraft({ all: false, ids });
                          }}
                        />
                        {r.name}
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestSelectOpen(false)}>Cancelar</Button>
            <Button onClick={confirmRestSelect}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
