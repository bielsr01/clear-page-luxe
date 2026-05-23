// Auto open/close restaurants based on opening_hours + manual_override.
// Scheduled via pg_cron every minute.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type DayHours = { open: string; close: string; enabled: boolean };
type OpeningHours = Record<string, DayHours>;
type ManualOverride = { type: "open" | "closed"; until: string | null } | null;

// Compute current time in America/Sao_Paulo
function nowInSaoPaulo(): { day: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const wk = parts.find(p => p.type === "weekday")?.value ?? "Sun";
  const hh = parseInt(parts.find(p => p.type === "hour")?.value ?? "0");
  const mm = parseInt(parts.find(p => p.type === "minute")?.value ?? "0");
  const dayMap: Record<string, number> = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
  return { day: dayMap[wk] ?? 0, minutes: hh * 60 + mm };
}

function isWithinSchedule(hours: OpeningHours | null | undefined): boolean {
  if (!hours) return false;
  const { day, minutes } = nowInSaoPaulo();
  const cfg = hours[String(day)];
  if (!cfg || !cfg.enabled) return false;
  const [oh, om] = (cfg.open || "00:00").split(":").map(Number);
  const [ch, cm] = (cfg.close || "00:00").split(":").map(Number);
  const openMin = oh * 60 + om;
  let closeMin = ch * 60 + cm;
  if (closeMin <= openMin) closeMin += 24 * 60;
  const curAdj = minutes < openMin ? minutes + 24 * 60 : minutes;
  return curAdj >= openMin && curAdj < closeMin;
}

function overrideActive(ov: ManualOverride): ManualOverride {
  if (!ov) return null;
  if (ov.until && new Date(ov.until).getTime() <= Date.now()) return null;
  return ov;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: restaurants, error } = await supabase
    .from("restaurants")
    .select("id, opening_hours, manual_override, is_open");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let updated = 0;
  let cleared = 0;
  for (const r of restaurants ?? []) {
    const within = isWithinSchedule(r.opening_hours as any);
    const rawOv = r.manual_override as ManualOverride;
    const ov = overrideActive(rawOv);

    // Clear expired override
    if (rawOv && !ov) {
      await supabase.from("restaurants").update({ manual_override: null, is_open: within }).eq("id", r.id);
      cleared++;
      continue;
    }

    let desired: boolean;
    if (ov?.type === "open") desired = true;
    else if (ov?.type === "closed") desired = false;
    else desired = within;

    if (r.is_open !== desired) {
      await supabase.from("restaurants").update({ is_open: desired }).eq("id", r.id);
      updated++;
    }
  }

  return new Response(JSON.stringify({ ok: true, updated, cleared, total: restaurants?.length ?? 0 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
