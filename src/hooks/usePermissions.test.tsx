import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePermissions } from "./usePermissions";

const mocks = vi.hoisted(() => ({ query: vi.fn(), read: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.query }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "operator" }, isMasterAdmin: false, rolesLoading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: mocks.read };
  return chain;
} } }));

beforeEach(() => { vi.resetAllMocks(); mocks.query.mockReturnValue({ data: undefined, isLoading: true }); });
describe("access lookup connection errors", () => {
  it("does not downgrade an owner when the restaurant lookup fails", async () => {
    const error = new Error("offline");
    mocks.read.mockResolvedValueOnce({ data: null, error });
    renderHook(() => usePermissions("restaurant"));
    await expect(mocks.query.mock.calls[0][0].queryFn()).rejects.toBe(error);
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it("does not store empty permissions when the access-group lookup fails", async () => {
    const error = new Error("offline");
    mocks.read.mockResolvedValueOnce({ data: { owner_id: "owner" }, error: null });
    mocks.read.mockResolvedValueOnce({ data: { access_group_id: "group" }, error: null });
    mocks.read.mockResolvedValueOnce({ data: null, error });
    renderHook(() => usePermissions("restaurant"));
    await expect(mocks.query.mock.calls[0][0].queryFn()).rejects.toBe(error);
    expect(mocks.read).toHaveBeenCalledTimes(3);
  });
});