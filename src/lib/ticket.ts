import { brl, formatPhone, formatIfoodPhone, orderTypeLabel, paymentLabel } from "./format";
import {
  DEFAULT_KITCHEN_PRINT_SETTINGS,
  DEFAULT_PRINT_SETTINGS,
  PrintSettings,
  normalizePrintSettings,
} from "@/components/dashboard/PrintSettings";

export type TicketMode = "customer" | "kitchen";

export interface TicketOrder {
  id: string;
  order_number: number;
  order_type: "delivery" | "pickup" | "pdv";
  customer_name: string;
  customer_phone: string;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_cep?: string | null;
  address_notes?: string | null;
  payment_method: string;
  change_for?: number | null;
  subtotal?: number;
  delivery_fee?: number;
  discount?: number | null;
  service_fee?: number | null;
  coupon_code?: string | null;
  total: number;
  created_at: string;
  external_source?: string | null;
  external_order_id?: string | null;
}

export interface TicketOrderOption {
  group_name: string | null;
  item_name: string | null;
  extra_price: number;
}
export type TicketOrderOptions = Record<string, TicketOrderOption[]>;

export interface TicketItem {
  id: string;
  product_id?: string | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  notes?: string | null;
}

interface TicketOptionCatalogEntry {
  groupName: string;
  itemName: string;
  groupSortOrder?: number;
  itemSortOrder?: number;
}

export type TicketOptionCatalog = Record<string, TicketOptionCatalogEntry[]>;

export interface TicketRestaurant {
  name?: string | null;
  logo_url?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_cep?: string | null;
  print_settings?: PrintSettings | null;
  kitchen_print_settings?: PrintSettings | null;
}

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const normalizeOptionText = (s: string) =>
  s
    .replace(/^[+•-]\s*/, "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const ticketItemDetailLines = (item: TicketItem, catalog: TicketOptionCatalog) => {
  const rawLines = (item.notes ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const lines = rawLines.flatMap((line) => {
    if (line.includes(":") || /^obs\s*:/i.test(line)) return [line];
    const parts = line.match(/[+•-]\s*[^+•-]+/g);
    return parts && parts.length > 1 ? parts.map((p) => p.trim()) : [line];
  });

  const productOptions = item.product_id ? (catalog[item.product_id] ?? []) : [];
  const productGroups = Array.from(new Set(productOptions.map((o) => o.groupName).filter(Boolean)));
  const grouped = new Map<string, string[]>();
  const details: string[] = [];

  lines.forEach((line) => {
    if (/^obs\s*:/i.test(line) || line.includes(":")) {
      details.push(line);
      return;
    }

    const optionName = line.replace(/^[+•-]\s*/, "").trim();
    const normalized = normalizeOptionText(optionName);
    const match = productOptions.find((o) => normalizeOptionText(o.itemName) === normalized);
    const groupName = match?.groupName ?? (productGroups.length === 1 ? productGroups[0] : "");

    if (!groupName) {
      details.push(optionName);
      return;
    }

    const arr = grouped.get(groupName) ?? [];
    arr.push(match?.itemName ?? optionName);
    grouped.set(groupName, arr);
  });

  return [
    ...Array.from(grouped.entries()).map(([groupName, names]) => `${groupName}: ${names.join(", ")}`),
    ...details,
  ];
};

export function buildTicketHtml(
  order: TicketOrder,
  items: TicketItem[],
  restaurant: TicketRestaurant | null,
  optionCatalog: TicketOptionCatalog = {},
  mode: TicketMode = "customer",
  orderOptions: TicketOrderOptions = {},
): string {
  const rawSettings =
    mode === "kitchen" ? restaurant?.kitchen_print_settings : restaurant?.print_settings;
  const defaults = mode === "kitchen" ? DEFAULT_KITCHEN_PRINT_SETTINGS : DEFAULT_PRINT_SETTINGS;
  const ps: PrintSettings = normalizePrintSettings(rawSettings as any, defaults);

  const fullBizAddress = [
    [restaurant?.address_street, restaurant?.address_number].filter(Boolean).join(", "),
    restaurant?.address_neighborhood,
    [restaurant?.address_city, restaurant?.address_state].filter(Boolean).join(" - "),
    restaurant?.address_cep,
  ].filter(Boolean).join(" • ");

  const fullCustAddress = [
    [order.address_street, order.address_number].filter(Boolean).join(", "),
    order.address_complement,
    order.address_neighborhood,
    [order.address_city, order.address_state].filter(Boolean).join(" - "),
    order.address_cep,
  ].filter(Boolean).join(" • ");

  const created = new Date(order.created_at);
  const dateStr = `${created.toLocaleDateString("pt-BR")} - ${created.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  const subtotal = order.subtotal ?? items.reduce((s, it) => s + it.unit_price * it.quantity, 0);
  const deliveryFee = order.delivery_fee ?? 0;
  const discount = Number(order.discount ?? 0);
  const serviceFee = Number(order.service_fee ?? 0);

  const renderStructuredItem = (it: TicketItem, opts: TicketOrderOption[]) => {
    const extrasPerUnit = opts.reduce((s, o) => s + Number(o.extra_price ?? 0), 0);
    const baseUnit = Number(it.unit_price) - extrasPerUnit;
    const baseTotal = baseUnit * it.quantity;

    // Group preserving order; aggregate duplicate option rows as Nx
    type AggOpt = { name: string; extra_price: number; qty: number };
    const groups: { name: string; items: AggOpt[] }[] = [];
    opts.forEach((o) => {
      const gName = (o.group_name ?? "Opção").trim() || "Opção";
      let g = groups.find((x) => x.name === gName);
      if (!g) { g = { name: gName, items: [] }; groups.push(g); }
      const name = (o.item_name ?? "").trim();
      const price = Number(o.extra_price ?? 0);
      const existing = g.items.find((x) => x.name === name && x.extra_price === price);
      if (existing) existing.qty += 1;
      else g.items.push({ name, extra_price: price, qty: 1 });
    });

    const groupsHtml = groups.map((g) => {
      const itemsHtmlInner = g.items.map((opt) => {
        const totalQty = opt.qty * it.quantity;
        const extra = opt.extra_price * totalQty;
        const right = ps.prices && extra > 0 ? `<span style="font-size:13px">+ ${brl(extra)}</span>` : "";
        return `<div class="row" style="font-size:13px;padding-left:8px"><span>${totalQty}× ${esc(opt.name)}</span>${right}</div>`;
      }).join("");
      return `
        <div style="font-size:13px;padding-left:4px;margin-top:2px">
          <div style="font-weight:700">${esc(g.name)}:</div>
          ${itemsHtmlInner}
        </div>`;
    }).join("");

    // Free-text obs lines (only when starts with "obs:")
    const notesLines = (it.notes ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && /^obs\s*:/i.test(l));
    const notesHtml = notesLines.map((l) => `<div class="muted" style="font-size:13px;padding-left:4px">${esc(l)}</div>`).join("");

    const priceLine = ps.prices
      ? `<div style="font-size:13px">${brl(baseTotal)}</div>`
      : "";
    return `
      <div style="margin-bottom:8px">
        <div class="item-name">${it.quantity}× ${esc(it.product_name)}</div>
        ${priceLine}
        ${groupsHtml}
        ${notesHtml}
      </div>`;
  };

  const itemsHtml = items
    .map((it) => {
      const structured = orderOptions[it.id];
      if (structured && structured.length) return renderStructuredItem(it, structured);
      const notesHtml = ticketItemDetailLines(it, optionCatalog)
        .map((l) => `<div class="muted" style="font-size:13px">${esc(l)}</div>`)
        .join("");
      const priceCell = ps.prices
        ? `<span>${brl(it.unit_price * it.quantity)}</span>`
        : "";
      return `
      <div style="margin-bottom:4px">
        <div class="row"><span class="item-name">${it.quantity}× ${esc(it.product_name)}</span>${priceCell}</div>
        ${notesHtml}
      </div>`;
    })
    .join("");

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>Ticket #${order.order_number}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  @media print {
    body { background:#fff !important; }
    .no-print { display:none !important; }
    .ticket, .ticket * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color:#000 !important; }
  }
  body { margin:0; background:#f5f5f5; }
  .ticket { width:72mm; margin:0 auto; padding:8px; font-family:'Arial',sans-serif; color:#000; font-size:14px; line-height:1.45; font-weight:700; background:#fff; -webkit-text-stroke:0.3px #000; }
  .ticket h1 { font-size:18px; font-weight:900; margin:0; text-align:center; -webkit-text-stroke:0.6px #000; }
  .muted { color:#000; font-weight:700; }
  .center { text-align:center; }
  .row { display:flex; justify-content:space-between; gap:8px; }
  .sep { border-top:1.5px solid #000; margin:6px 0; }
  .item-name { font-weight:900; -webkit-text-stroke:0.5px #000; }
  .total { font-size:17px; font-weight:900; -webkit-text-stroke:0.6px #000; }
  .logo { max-width:50mm; max-height:25mm; display:block; margin:0 auto 6px; object-fit:contain; filter:contrast(1.4) brightness(0.85); }
  .no-print { padding:12px; text-align:center; }
  .no-print button { padding:8px 16px; border:1px solid #333; border-radius:6px; cursor:pointer; background:#fff; }
</style></head>
<body>
<div class="no-print"><button onclick="window.print()">🖨️ Imprimir novamente</button></div>
<div class="ticket">
  ${ps.logo && restaurant?.logo_url ? `<img src="${esc(restaurant.logo_url)}" alt="" class="logo" />` : ""}
  ${ps.business_name && restaurant?.name ? `<h1>${esc(restaurant.name)}</h1>` : ""}
  ${ps.business_address && fullBizAddress ? `<div class="center muted" style="margin-top:4px">${esc(fullBizAddress)}</div>` : ""}
  ${ps.order_type_date ? `
    <div class="sep"></div>
    <div class="center">${dateStr}</div>
    <div class="center" style="font-weight:800;margin-top:2px">${orderTypeLabel[order.order_type]} #${order.order_number}</div>
    ${order.external_source === "ifood" ? `<div class="center" style="font-weight:900;margin-top:2px">IFOOD</div>` : ""}
    ${order.external_source === "quero" ? `<div class="center" style="font-weight:900;margin-top:2px">QUERO DELIVERY</div>` : ""}
  ` : ""}
  ${(() => {
    const showAddr = ps.customer_address && order.order_type === "delivery" && !!fullCustAddress;
    const hasAny = ps.customer_name || ps.customer_phone || showAddr;
    if (!hasAny) return "";
    return `
    <div class="sep"></div>
    ${ps.customer_name ? `<div><strong>${esc(order.customer_name)}</strong></div>` : ""}
    ${ps.customer_phone ? `<div>${esc(order.external_source === "ifood" ? formatIfoodPhone(order.customer_phone) : formatPhone(order.customer_phone))}</div>` : ""}
    
    ${showAddr ? `<div style="margin-top:2px">${esc(fullCustAddress)}${order.address_notes ? ` (${esc(order.address_notes)})` : ""}</div>` : ""}`;
  })()}
  ${ps.products ? `
    <div class="sep"></div>
    ${itemsHtml}
  ` : ""}
  ${ps.prices ? `
    <div class="sep"></div>
    <div class="row"><span>Subtotal</span><span>${brl(subtotal)}</span></div>
    ${order.order_type === "delivery" ? `<div class="row"><span>Taxa de entrega</span><span>${brl(deliveryFee)}</span></div>` : ""}
    ${serviceFee > 0 ? `<div class="row"><span>Taxa de serviço</span><span>${brl(serviceFee)}</span></div>` : ""}
    ${discount > 0 ? `<div class="row"><span>Desconto${(order as any).coupon_code ? ` (${esc((order as any).coupon_code)})` : ""}</span><span>- ${brl(discount)}</span></div>` : ""}
    <div class="row total" style="margin-top:4px"><span>TOTAL</span><span>${brl(order.total)}</span></div>
  ` : ""}
  ${ps.payment_method ? `
    <div class="muted" style="margin-top:4px">Pagamento: ${esc(paymentLabel[order.payment_method] ?? order.payment_method)}${order.change_for ? ` (troco p/ ${brl(order.change_for)})` : ""}</div>
  ` : ""}
  ${(ps as any).extra_message_enabled && ((ps as any).extra_message ?? "").trim() ? `
    <div class="sep"></div>
    <div class="center" style="white-space:pre-wrap">${esc((ps as any).extra_message)}</div>
  ` : ""}
  <div class="sep"></div>
  <div class="center muted" style="font-size:12px">Esse documento não tem valor fiscal.</div>
</div>
<script>
  (function(){
    function go(){ try { window.focus(); window.print(); } catch(e){} }
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go);
  })();
</script>
</body></html>`;
}
