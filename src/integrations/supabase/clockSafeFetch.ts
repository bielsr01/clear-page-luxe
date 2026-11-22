/**
 * Supabase Auth answers with `expires_at`, an absolute timestamp taken from the
 * server clock, and auth-js compares it with the computer's clock. On a
 * computer whose clock runs an hour or more ahead, every new token already looks
 * expired: the browser refreshes it on every request, the server soon refuses
 * one refresh (rate limit) and auth-js signs the user out. That is the
 * "logs in, logs out" loop seen on store PCs with a wrong Windows clock.
 *
 * Without `expires_at`, auth-js derives the expiry from `expires_in` and the
 * local clock, so tokens are refreshed shortly before they really expire
 * whatever time the computer shows. Every other response passes through as is.
 */
type Fetch = typeof fetch;

const requestUrl = (input: Parameters<Fetch>[0]) =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

export function clockSafeFetch(baseFetch: Fetch = (input, init) => fetch(input, init)): Fetch {
  return async (input, init) => {
    const response = await baseFetch(input, init);
    if (!response.ok || !requestUrl(input).includes("/auth/v1/")) return response;
    if (!(response.headers.get("content-type") ?? "").includes("json")) return response;

    let body: unknown;
    try {
      body = await response.clone().json();
    } catch {
      return response;
    }
    if (!body || typeof body !== "object" || !("expires_at" in body)) return response;
    const { expires_at: _serverClockExpiry, ...session } = body as Record<string, unknown>;
    if (typeof session.expires_in !== "number") return response;

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    return new Response(JSON.stringify(session), { status: response.status, statusText: response.statusText, headers });
  };
}
