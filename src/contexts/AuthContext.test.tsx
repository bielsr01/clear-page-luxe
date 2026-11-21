import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), eq: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange },
  from: () => ({ select: () => ({ eq: mocks.eq }) }),
} }));

function Probe() {
  const auth = useAuth();
  return <div data-testid="state">{JSON.stringify({ user: auth.user?.id ?? null, manager: auth.isManager, rolesLoading: auth.rolesLoading, loading: auth.loading })}</div>;
}
const state = () => JSON.parse(screen.getByTestId("state").textContent ?? "{}");
const session = (id: string) => ({ user: { id } });
let authEvent: (event: string, value: unknown) => void;
async function tick(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mocks.eq.mockResolvedValue({ data: [{ role: "manager" }], error: null });
  mocks.onAuthStateChange.mockImplementation((callback) => {
    authEvent = callback;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("session stability", () => {
  it("does not let an old empty session overwrite a newer sign-in", async () => {
    let resolve: (value: unknown) => void = () => {};
    mocks.getSession.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<AuthProvider><Probe /></AuthProvider>);
    act(() => authEvent("SIGNED_IN", session("restaurant-user")));
    await tick();
    await act(async () => resolve({ data: { session: null }, error: null }));
    expect(state()).toMatchObject({ user: "restaurant-user", manager: true, loading: false });
  });

  it("retries a connection error fetching roles instead of concluding access is absent", async () => {
    mocks.eq.mockResolvedValueOnce({ data: null, error: { message: "Failed to fetch" } });
    render(<AuthProvider><Probe /></AuthProvider>);
    act(() => authEvent("SIGNED_IN", session("restaurant-user")));
    await tick();
    expect(state()).toMatchObject({ user: "restaurant-user", rolesLoading: true });
    await tick(2_000);
    expect(mocks.eq).toHaveBeenCalledTimes(2);
    expect(state()).toMatchObject({ user: "restaurant-user", manager: true, rolesLoading: false });
  });

  it("ignores role results arriving after genuine sign-out", async () => {
    let resolve: (value: unknown) => void = () => {};
    mocks.eq.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<AuthProvider><Probe /></AuthProvider>);
    act(() => authEvent("SIGNED_IN", session("restaurant-user")));
    await tick();
    act(() => authEvent("SIGNED_OUT", null));
    await act(async () => resolve({ data: [{ role: "manager" }], error: null }));
    expect(state()).toMatchObject({ user: null, manager: false, rolesLoading: false });
  });

  it("keeps the account and roles when its token is refreshed", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    act(() => authEvent("SIGNED_IN", session("restaurant-user")));
    await tick();
    act(() => authEvent("TOKEN_REFRESHED", session("restaurant-user")));
    expect(mocks.eq).toHaveBeenCalledTimes(1);
    expect(state()).toMatchObject({ user: "restaurant-user", manager: true, rolesLoading: false });
  });

  it("does not interpret a session lookup network error as logged out", async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null }, error: { message: "offline" } });
    mocks.getSession.mockResolvedValueOnce({ data: { session: session("restaurant-user") }, error: null });
    render(<AuthProvider><Probe /></AuthProvider>);
    await tick();
    expect(state().loading).toBe(true);
    await tick(2_001);
    expect(state()).toMatchObject({ user: "restaurant-user", manager: true, loading: false });
  });
});