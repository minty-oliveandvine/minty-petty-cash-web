// Getting a token and a new one (../handoff.ts): always Flask's login-gated
// /handoff/petty-cash-web, for one company, never an open redirect, never twice at once.

import { withReturnOrigin } from "@minty/shared/previewSibling";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getAuth, setAuth } from "@/lib/auth";
import { _resetHandoffForTests, APP_HOME, handoffUrl, leaveTo, redirectToHandoff, safeNext } from "@/lib/handoff";

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

describe("the hand-off's edges", () => {
  // redirectToHandoff, leaveTo, withReturnOrigin and the address fallback - this app's instance
  // of @minty/shared/handoff (and @minty/shared/previewSibling) since the shared-code refactor
  // (2026-10-21), every address byte for byte as before.

  afterEach(() => window.history.replaceState(null, "", "/"));

  it("names the page's own origin as return_origin by default, and overwrites one already there", () => {
    expect(window.location.origin).toBe("http://localhost:3000");
    expect(withReturnOrigin("http://localhost:8000/logout")).toBe(
      "http://localhost:8000/logout?return_origin=http%3A%2F%2Flocalhost%3A3000",
    );
    expect(withReturnOrigin("http://localhost:8000/x?return_origin=old&a=1", "https://pr-dev-pettycash.dailyminty.com")).toBe(
      "http://localhost:8000/x?return_origin=https%3A%2F%2Fpr-dev-pettycash.dailyminty.com&a=1",
    );
  });

  it("writes the whole hand-off address in one order: next, entity_id, return_origin", () => {
    expect(handoffUrl("/entity/360812e1/olive-and-vine/petty-cash?x=1", ENTITY)).toBe(
      "http://localhost:8000/handoff/petty-cash-web?next=%2Fentity%2F360812e1%2Folive-and-vine%2Fpetty-cash%3Fx%3D1" +
        `&entity_id=${ENTITY}&return_origin=http%3A%2F%2Flocalhost%3A3000`,
    );
    // no company anywhere: no entity_id at all
    expect(handoffUrl("/landing")).toBe("http://localhost:8000/handoff/petty-cash-web?next=%2Flanding&return_origin=http%3A%2F%2Flocalhost%3A3000");
  });

  it("takes the company from the address when the one given is empty, and decodes its name", () => {
    expect(new URL(handoffUrl("/entity/360812e1/vine-caf%C3%A9/petty-cash", "")).searchParams.get("entity_id")).toBe("360812e1/vine-café");
  });

  it("goes back to the page it is on, by the address's company when the cookie has none", () => {
    const go = vi.fn();
    _resetHandoffForTests(go);
    window.history.replaceState(null, "", "/entity/360812e1/olive-and-vine/petty-cash/reports?page=2");
    redirectToHandoff();
    const url = new URL(go.mock.calls[0][0]);
    expect(url.searchParams.get("next")).toBe("/entity/360812e1/olive-and-vine/petty-cash/reports?page=2");
    expect(url.searchParams.get("entity_id")).toBe("360812e1/olive-and-vine");
  });

  it("prefers the company it is given over the cookie's, and clears the cookie either way", () => {
    setAuth("a.b.c", ENTITY, "Olive & Vine");
    const go = vi.fn();
    _resetHandoffForTests(go);
    redirectToHandoff("/x", "other-company");
    expect(new URL(go.mock.calls[0][0]).searchParams.get("entity_id")).toBe("other-company");
    expect(getAuth()).toBeNull();
  });

  it("goes again only after the test seam forgets the first trip", () => {
    const go = vi.fn();
    _resetHandoffForTests(go);
    redirectToHandoff("/a");
    redirectToHandoff("/b");
    _resetHandoffForTests(go);
    redirectToHandoff("/c");
    expect(go.mock.calls.map(([u]) => new URL(u).searchParams.get("next"))).toEqual(["/a", "/c"]);
  });

  it("leaves for an address as given, through the same seam, even while a hand-off is under way", () => {
    const go = vi.fn();
    _resetHandoffForTests(go);
    redirectToHandoff("/a");
    leaveTo("http://localhost:8000/logout");
    expect(go).toHaveBeenLastCalledWith("http://localhost:8000/logout");
    expect(go).toHaveBeenCalledTimes(2);
  });

  it("lands on / by default, or on the fallback it is given", () => {
    expect(APP_HOME).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined, "/home")).toBe("/home");
    expect(safeNext("/entity/360812e1/x/petty-cash?a=1")).toBe("/entity/360812e1/x/petty-cash?a=1");
  });
});
