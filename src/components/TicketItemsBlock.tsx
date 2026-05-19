import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";

interface ItemRow {
  id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  notes: string | null;
}

interface OptRow {
  order_item_id: string;
  group_name: string | null;
  item_name: string | null;
  extra_price: number;
}

/**
 * Renderiza itens do pedido em formato ticket (80mm) com grupos de opções
 * detalhados linha por linha. Cada grupo aparece em sua própria linha
 * com seus itens indentados abaixo e o valor adicional respectivo.
 */
export function TicketItemsBlock({
  items,
  showPrices,
}: {
  items: ItemRow[];
  showPrices: boolean;
}) {
  const [opts, setOpts] = useState<Record<string, OptRow[]>>({});

  useEffect(() => {
    let cancel = false;
    (async () => {
      const ids = items.map((i) => i.id).filter(Boolean);
      if (!ids.length) { setOpts({}); return; }
      const { data } = await supabase
        .from("order_item_options")
        .select("order_item_id,group_name,item_name,extra_price")
        .in("order_item_id", ids);
      if (cancel) return;
      const m: Record<string, OptRow[]> = {};
      (data ?? []).forEach((r: any) => {
        (m[r.order_item_id] ||= []).push(r);
      });
      setOpts(m);
    })();
    return () => { cancel = true; };
  }, [items]);

  return (
    <>
      {items.map((it) => {
        const itemOpts = opts[it.id] ?? [];
        // Fallback: legacy notes parse when no structured options
        let parsedFromNotes: OptRow[] = [];
        if (itemOpts.length === 0 && it.notes && !/^obs\s*:/i.test(it.notes.trim())) {
          const parts = String(it.notes).split(/\s+•\s+/);
          parts.forEach((raw) => {
            const clean = raw.replace(/^↳\s*/, "").trim();
            if (!clean) return;
            parsedFromNotes.push({
              order_item_id: it.id,
              group_name: "Adicionais",
              item_name: clean,
              extra_price: 0,
            });
          });
        }
        const allOpts = itemOpts.length ? itemOpts : parsedFromNotes;
        const extrasPerUnit = allOpts.reduce((s, o) => s + Number(o.extra_price ?? 0), 0);
        const baseUnit = Number(it.unit_price) - extrasPerUnit;
        const baseTotal = baseUnit * it.quantity;

        type Agg = { key: string; name: string; qty: number; extra: number };
        const groups: { name: string; items: Agg[] }[] = [];
        allOpts.forEach((o) => {
          const gName = (o.group_name ?? "Opção").trim() || "Opção";
          let g = groups.find((x) => x.name === gName);
          if (!g) { g = { name: gName, items: [] }; groups.push(g); }
          const key = `${o.item_name}|${Number(o.extra_price ?? 0)}`;
          let agg = g.items.find((x) => x.key === key);
          if (!agg) {
            agg = { key, name: o.item_name ?? "", qty: 0, extra: Number(o.extra_price ?? 0) };
            g.items.push(agg);
          }
          agg.qty += 1;
        });

        const isObsOnly = !!it.notes && /^obs\s*:/i.test(it.notes.trim());

        return (
          <div key={it.id} style={{ marginBottom: 6 }}>
            <div className="row">
              <span className="item-name">{it.quantity}× {it.product_name}</span>
              {showPrices && <span>{brl(baseTotal)}</span>}
            </div>
            {groups.map((g) => (
              <div key={g.name} style={{ fontSize: 13, paddingLeft: 4, marginTop: 2 }}>
                <div style={{ fontWeight: 700 }}>{g.name}:</div>
                {g.items.map((opt) => {
                  const totalExtra = opt.extra * opt.qty * it.quantity;
                  return (
                    <div key={opt.key} className="row" style={{ fontSize: 13, paddingLeft: 8 }}>
                      <span>{opt.qty}× {opt.name}</span>
                      {showPrices && totalExtra > 0 && (
                        <span className="muted" style={{ fontSize: 13 }}>+ {brl(totalExtra)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {isObsOnly && (
              <div className="muted" style={{ fontSize: 13, paddingLeft: 4 }}>{it.notes}</div>
            )}
          </div>
        );
      })}
    </>
  );
}
