// Where Flask's hand-off lands (../landing/page.tsx): store the token and go on to `next`, or -
// with no token - back to Flask for one.

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
let params = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => params,
}));

import Landing from "@/app/landing/page";
import { getAuth, setAuth } from "@/lib/auth";
import { _resetHandoffForTests } from "@/lib/handoff";

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";

let go: ReturnType<typeof vi.fn>;

beforeEach(() => {
  go = vi.fn();
  _resetHandoffForTests(go);
});

afterEach(() => {
  _resetHandoffForTests();
  window.history.replaceState(null, "", "/");
});

describe("the landing page", () => {
  // The landing's logic - @minty/shared/landing's useLandingHandoff since the shared-code refactor (2026-10-21).

  it("stores the token for its company and replaces itself with next", async () => {
    params = new URLSearchParams({
      token: "a.b.c",
      entity_id: ENTITY,
      entity_name: "Olive & Vine",
      next: "/entity/360812e1/olive-and-vine/petty-cash",
    });
    render(<Landing />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/entity/360812e1/olive-and-vine/petty-cash"));
    expect(getAuth()).toEqual({ token: "a.b.c", entityId: ENTITY, entityName: "Olive & Vine" });
    expect(go).not.toHaveBeenCalled();
  });

  it.each([null, "//evil.example/x", "https://evil.example"])("goes to / for next=%s", async (next) => {
    params = new URLSearchParams({ token: "a.b.c" });
    if (next !== null) params.set("next", next);
    render(<Landing />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    // no company named: the company cookies hold empty strings
    expect(getAuth()).toEqual({ token: "a.b.c", entityId: "", entityName: "" });
  });

  it("with no token, goes back to Flask for next and the company it named, forgetting any old token", async () => {
    setAuth("old", "old-company", "Old");
    params = new URLSearchParams({ entity_id: ENTITY, next: "/entity/360812e1/olive-and-vine/petty-cash/reports" });
    render(<Landing />);
    await waitFor(() => expect(go).toHaveBeenCalledTimes(1));
    const url = new URL(go.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("http://localhost:8000/handoff/petty-cash-web");
    expect(url.searchParams.get("next")).toBe("/entity/360812e1/olive-and-vine/petty-cash/reports");
    expect(url.searchParams.get("entity_id")).toBe(ENTITY);
    expect(replace).not.toHaveBeenCalled();
    expect(getAuth()).toBeNull();
  });

  it("with no token and no company named, falls back to the cookie's company - then to next's address", async () => {
    setAuth("old", ENTITY, "Old");
    params = new URLSearchParams({ next: "/entity/a1b2c3d4/other/petty-cash" });
    const first = render(<Landing />);
    await waitFor(() => expect(go).toHaveBeenCalledTimes(1));
    expect(new URL(go.mock.calls[0][0]).searchParams.get("entity_id")).toBe(ENTITY);
    first.unmount();

    // the cookie was cleared by that trip, so the next one names the address's company
    _resetHandoffForTests(go);
    render(<Landing />);
    await waitFor(() => expect(go).toHaveBeenCalledTimes(2));
    expect(new URL(go.mock.calls[1][0]).searchParams.get("entity_id")).toBe("a1b2c3d4/other");
  });
});
