import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireRole } from "@/components/RequireRole";
import Index from "@/pages/Index";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), eq: vi.fn(), unsubscribe: vi.fn(), signOut: vi.fn(), toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("@/components/dashboard/IfoodWidgetMount", () => ({ cleanupIfoodWidgetDom: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange, signOut: mocks.signOut },
  from: () => ({ select: () => ({ eq: mocks.eq }) }),
} }));

function Probe() {
  const auth = useAuth();
  return <><div data-testid="state">{JSON.stringify({ user: auth.user?.id ?? null, manager: auth.isManager, rolesLoading: auth.rolesLoading, loading: auth.loading })}</div><button onClick={() => void auth.signOut()}>Sair</button></>;
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
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.onAuthStateChange.mockImplementation((callback) => {
    authEvent = callback;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("session stability", () => {
  it("retains access when a sign-out request fails", async () => {
    mocks.signOut.mockResolvedValue({ error: { message: "offline" } });
    render(<AuthProvider><Probe /></AuthProvider>);
    act(() => authEvent("SIGNED_IN", session("restaurant-user")));
    await tick();
    await act(async () => screen.getByRole("button", { name: "Sair" }).click());
    expect(state()).toMatchObject({ user: "restaurant-user", manager: true, rolesLoading: false });
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });

  it("restores roles when React reinitializes the auth subscription", async () => {
    mocks.onAuthStateChange.mockImplementation((callback) => {
      authEvent = callback;
      callback("INITIAL_SESSION", session("restaurant-user"));
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
    });
    render(<StrictMode><AuthProvider><Probe /></AuthProvider></StrictMode>);
    await tick();
    expect(state()).toMatchObject({ user: "restaurant-user", manager: true, rolesLoading: false });
  });

  it.each([
    ["/", "manager", "manager"],
    ["/dashboard", "manager", "manager"],
    ["/ticket/order", "manager", "manager"],
    ["/admin", "master_admin", "master_admin"],
    ["/links", "master_admin", "master_admin"],
    ["/curriculos", "master_admin", "master_admin"],
  ] as const)("does not redirect %s to login during a role connection error", async (path, required, actual) => {
    mocks.eq.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    mocks.eq.mockResolvedValueOnce({ data: [{ role: actual }], error: null });
    render(<MemoryRouter initialEntries={[path]}><AuthProvider><Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<div>login-destination</div>} />
      <Route path="/dashboard" element={<RequireRole role="manager"><div>protected-destination</div></RequireRole>} />
      <Route path={path === "/" || path === "/dashboard" ? "/unused" : path} element={<RequireRole role={required}><div>protected-destination</div></RequireRole>} />
    </Routes></AuthProvider></MemoryRouter>);
    act(() => authEvent("SIGNED_IN", session("restaurant-user")));
    await tick();
    expect(screen.queryByText("login-destination")).toBeNull();
    expect(screen.queryByText("protected-destination")).toBeNull();
    await tick(2_000);
    expect(screen.getByText("protected-destination")).toBeInTheDocument();
    expect(screen.queryByText("login-destination")).toBeNull();
  });

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