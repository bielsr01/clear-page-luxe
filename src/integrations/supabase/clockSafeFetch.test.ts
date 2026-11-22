import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { clockSafeFetch } from "./clockSafeFetch";

const realNow = Date.now.bind(Date);
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Supabase Auth + REST stand-in that runs on the real clock and refuses refreshes past a limit, like the hosted rate limit. */
function fakeSupabase(refreshLimit = 20) {
  let refreshes = 0;
  let seq = 0;
  const live = new Set<string>();
  const issue = () => {
    const now = Math.floor(realNow() / 1000);
    const refresh_token = `rt${++seq}`;
    live.add(refresh_token);
    const claims = btoa(JSON.stringify({ sub: "u1", exp: now + 3600, iat: now, role: "authenticated", aud: "authenticated" }));
    return { access_token: `h.${claims}.s`, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token, user: { id: "u1", aud: "authenticated" } };
  };
  const server: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname === "/auth/v1/token") {
      if (url.searchParams.get("grant_type") === "password") return json(200, issue());
      refreshes++;
      if (refreshes > refreshLimit) return json(429, { code: 429, error_code: "over_request_rate_limit", msg: "Request rate limit reached" });
      const { refresh_token } = JSON.parse(String(init?.body));
      if (!live.delete(refresh_token)) return json(400, { code: 400, error_code: "refresh_token_already_used", msg: "Invalid Refresh Token: Already Used" });
      return json(200, issue());
    }
    if (url.pathname.startsWith("/rest/v1/")) return json(200, []);
    return json(404, {});
  };
  return { server, refreshes: () => refreshes };
}

async function useDashboard(fetchImpl: typeof fetch) {
  const memory = new Map<string, string>();
  const supabase = createClient("https://example.supabase.co", "anon", {
    auth: {
      storage: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v), removeItem: (k) => void memory.delete(k) },
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `test-${Math.random()}`,
    },
    global: { fetch: fetchImpl },
  });
  const events: string[] = [];
  supabase.auth.onAuthStateChange((event) => events.push(event));
  await supabase.auth.signInWithPassword({ email: "loja@example.com", password: "x" });
  // Every dashboard query asks auth-js for the current token.
  for (let i = 0; i < 40; i++) await supabase.from("orders").select("id").limit(1);
  const { data } = await supabase.auth.getSession();
  return { signedIn: !!data.session, signedOut: events.includes("SIGNED_OUT") };
}

describe("clockSafeFetch", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps a computer whose clock runs 65 minutes ahead signed in", async () => {
    vi.spyOn(Date, "now").mockImplementation(() => realNow() + 65 * 60_000);

    const plain = fakeSupabase();
    expect(await useDashboard(plain.server)).toEqual({ signedIn: false, signedOut: true });
    expect(plain.refreshes()).toBeGreaterThan(20);

    const safe = fakeSupabase();
    expect(await useDashboard(clockSafeFetch(safe.server))).toEqual({ signedIn: true, signedOut: false });
    expect(safe.refreshes()).toBe(0);
  });

  it("still refreshes the token shortly before it really expires", async () => {
    let elapsed = 0;
    vi.spyOn(Date, "now").mockImplementation(() => realNow() + elapsed - 90 * 60_000);
    const api = fakeSupabase();
    const supabase = createClient("https://example.supabase.co", "anon", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: clockSafeFetch(api.server) },
    });
    await supabase.auth.signInWithPassword({ email: "loja@example.com", password: "x" });
    elapsed = 50 * 60_000;
    await supabase.auth.getSession();
    expect(api.refreshes()).toBe(0);
    elapsed = 59 * 60_000;
    const { data } = await supabase.auth.getSession();
    expect(api.refreshes()).toBe(1);
    expect(data.session).not.toBeNull();
  });

  it("drops only the server-clock expiry and leaves other responses untouched", async () => {
    const api = fakeSupabase();
    const wrapped = clockSafeFetch(api.server);

    const token = await (await wrapped("https://example.supabase.co/auth/v1/token?grant_type=password", { method: "POST", body: "{}" })).json();
    expect(token).not.toHaveProperty("expires_at");
    expect(token.expires_in).toBe(3600);
    expect(token.access_token).toBeTruthy();

    const rest = await wrapped("https://example.supabase.co/rest/v1/orders?select=id");
    expect(await rest.json()).toEqual([]);

    const refused = await wrapped("https://example.supabase.co/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: "unknown" }) });
    expect(refused.status).toBe(400);
  });
});
