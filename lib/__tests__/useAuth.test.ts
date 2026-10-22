// The cookie's token and company for rendering (../useAuth.ts).

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { clearAuth, setAuth } from "@/lib/auth";
import { useAuth } from "@/lib/useAuth";

describe("useAuth", () => {
  // The hook - @minty/shared/clientValue's useClientValue since the shared-code refactor (2026-10-21).

  it("is the cookie's token and company on a client render, the same object on a re-render", () => {
    setAuth("a.b.c", "id-1", "Olive & Vine");
    const { result, rerender } = renderHook(() => useAuth());
    const first = result.current;
    expect(first).toEqual({ token: "a.b.c", entityId: "id-1", entityName: "Olive & Vine" });
    rerender();
    expect(result.current).toBe(first);
  });

  it("is null with no token", () => {
    clearAuth();
    const { result } = renderHook(() => useAuth());
    expect(result.current).toBeNull();
  });

  it("does not follow a cookie change under a mounted page - it subscribes to nothing", () => {
    setAuth("a.b.c", "id-1", "Olive");
    const { result } = renderHook(() => useAuth());
    setAuth("a.b.c", "id-2", "Vine");
    // no re-render was triggered, so the hook still holds what it read
    expect(result.current?.entityId).toBe("id-1");
  });
});
