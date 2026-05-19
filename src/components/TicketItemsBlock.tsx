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
 * Renderiza itens do pedido em formato ticket (80mm).
 * Layout (uma linha por elemento, nunca preço na mesma linha do produto):
 *   1× Produto
 *   R$ valor-base
 *   Nome do grupo:
 *     1× Opção A     + R$ extra
 *     1× Opção B     + R$ extra
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
        // Fallback legacy: parse notes only when there are zero structured options
        let parsedFromNotes: OptRow[] = [];
        if (itemOpts.length === 0 && it.notes && !/^obs\s*:/i.test(it.notes.trim())) {
          const parts = String(it.notes).split(/\n|\s+•\s+/);
          parts.forEach((raw) => {
            const clean = raw.replace(/^[+↳-]\s*/, "").trim();
            if (!clean) return;
            if (/^obs\s*:/i.test(clean)) return;
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

        // Group preserving first-seen order; aggregate duplicates as Nx
        type AggOpt = { name: string; extra_price: number; qty: number };
        const groups: { name: string; items: AggOpt[] }[] = [];
        allOpts.forEach((o) => {
          const gName = (o.group_name ?? "Opção").trim() || "Opção";
          let g = groups.find((x) => x.name === gName);
          if (!g) { g = { name: gName, items: [] }; groups.push(g); }
          const name = (o.item_name ?? "").trim();
          const price = Number(o.extra_price ?? 0);
          const existing = g.items.find((x) => x.name === name && x.extra_price === price);
          if (existing) existing.qty += 1;
          else g.items.push({ name, extra_price: price, qty: 1 });
        });

        const isObsOnly = !!it.notes && /^obs\s*:/i.test(it.notes.trim());

        return (
          <div key={it.id} style={{ marginBottom: 8 }}>
            <div className="item-name">{it.quantity}× {it.product_name}</div>
            {showPrices && (
              <div style={{ fontSize: 13 }}>{brl(baseUnit * it.quantity)}</div>
            )}
            {groups.map((g, gi) => (
              <div key={`${g.name}-${gi}`} style={{ fontSize: 13, paddingLeft: 4, marginTop: 2 }}>
                <div style={{ fontWeight: 700 }}>{g.name}:</div>
                {g.items.map((opt, oi) => {
                  const totalQty = opt.qty * it.quantity;
                  const extra = opt.extra_price * totalQty;
                  return (
                    <div key={oi} className="row" style={{ fontSize: 13, paddingLeft: 8 }}>
                      <span>{totalQty}× {opt.name}</span>
                      {showPrices && extra > 0 && <span>+ {brl(extra)}</span>}
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
