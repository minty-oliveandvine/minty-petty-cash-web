// Getting a token and a new one (../handoff.ts): always Flask's login-gated
// /handoff/petty-cash-web, for one company, never an open redirect, never twice at once.

import { afterEach, describe, expect, it, vi } from "vitest";

import { getAuth, setAuth } from "@/lib/auth";
import { _resetHandoffForTests, handoffUrl, redirectToHandoff, safeNext } from "@/lib/handoff";

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";

afterEach(() => _resetHandoffForTests());

describe("handoffUrl", () => {
  it("is Flask's petty-cash hand-off with the page and the company", () => {
    const url = new URL(handoffUrl("/entity/360812e1/olive-and-vine/petty-cash", ENTITY, "http://localhost:3010"));
    expect(url.origin).toBe("http://localhost:8000");
    expect(url.pathname).toBe("/handoff/petty-cash-web");
    expect(url.searchParams.get("next")).toBe("/entity/360812e1/olive-and-vine/petty-cash");
    expect(url.searchParams.get("entity_id")).toBe(ENTITY);
    expect(url.searchParams.get("return_origin")).toBe("http://localhost:3010");
  });

  it("takes the company from the address when none is given", () => {
    const url = new URL(handoffUrl("/entity/360812E1/olive-and-vine/petty-cash/reports"));
    expect(url.searchParams.get("entity_id")).toBe("360812e1/olive-and-vine");
  });

  it.each(["//evil.example/x", "https://evil.example", "javascript:alert(1)"])(
    "never carries %s as the way back",
    (bad) => {
      expect(safeNext(bad)).toBe("/");
      expect(new URL(handoffUrl(bad)).searchParams.get("next")).toBe("/");
    },
  );
});

describe("redirectToHandoff", () => {
  it("forgets the token, keeps the company, and goes once however many calls fail together", () => {
    setAuth("a.b.c", ENTITY, "Olive & Vine");
    const go = vi.fn();
    _resetHandoffForTests(go);

    redirectToHandoff("/entity/360812e1/olive-and-vine/petty-cash");
    redirectToHandoff("/somewhere-else");

    expect(go).toHaveBeenCalledTimes(1);
    expect(new URL(go.mock.calls[0][0]).searchParams.get("entity_id")).toBe(ENTITY);
    expect(getAuth()).toBeNull();
  });
});
