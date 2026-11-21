import { describe, expect, it, vi } from "vitest";
import { confirmedQuery } from "../../supabase/functions/_shared/confirmed-query";

describe("account deletion prerequisite queries", () => {
  it.each([null, 0, []])("blocks deletion when a prerequisite request fails", (data) => {
    const deleteUser = vi.fn();
    const error = new Error("offline");
    expect(() => { confirmedQuery(data, error); deleteUser(); }).toThrow("offline");
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it("does not treat an unknown count as zero", () => {
    expect(() => confirmedQuery(null, null)).toThrow();
  });
  it("accepts an explicitly confirmed zero count", () => {
    expect(confirmedQuery(0, null)).toBe(0);
    expect(confirmedQuery([], null)).toEqual([]);
    expect(confirmedQuery(2, null)).toBe(2);
  });
});