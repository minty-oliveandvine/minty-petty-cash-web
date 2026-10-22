// This app's sidebar host (../sidebarHost.ts): where the menu leads FROM Petty Cash.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sidebarHost } from "@/components/ui/sidebarHost";
import { HOUSE_FALLBACK } from "@/lib/apiClient";
import { setAuth } from "@/lib/auth";
import { _resetHandoffForTests } from "@/lib/handoff";

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";
const HOME = "/entity/360812e1/olive-and-vine/petty-cash";

afterEach(() => _resetHandoffForTests());

describe("the menu's links", () => {
  it("keeps the dashboard, Reports and Settings in this app", () => {
    setAuth("tok", ENTITY, "Olive & Vine");
    expect(sidebarHost.links.pettyCashDashboard()).toBe(HOME);
    expect(sidebarHost.links.pettyCashReports(ENTITY)).toBe(`${HOME}/reports`);
    expect(sidebarHost.links.pettyCashReports("")).toBe(`${HOME}/reports`);
    expect(sidebarHost.links.settings()).toBe("/entity/360812e1/olive-and-vine/settings/petty-cash");
  });

  it("reaches minty-web's pages and the payments app through Flask", () => {
    setAuth("tok", ENTITY, "Olive & Vine");
    const entities = new URL(sidebarHost.links.entities());
    expect(entities.origin + entities.pathname).toBe("http://localhost:8000/handoff/minty-web");
    expect(entities.searchParams.get("next")).toBe("/entities");
    expect(new URL(sidebarHost.links.subscriptions()).searchParams.get("next")).toBe("/subscription");
    expect(new URL(sidebarHost.links.bills()).pathname).toBe(`/entity/${ENTITY}/payment-request`);
    // My Profile is minty-web's, through the hand-off - never Flask's /profile page
    const profile = new URL(sidebarHost.links.profile());
    expect(profile.pathname).toBe("/handoff/minty-web");
    expect(profile.searchParams.get("next")).toBe("/profile");
    expect(profile.searchParams.get("entity_id")).toBe(ENTITY);
  });

  it("marks only its own settings page as current", () => {
    expect(sidebarHost.currentOf("/entity/360812e1/olive-and-vine/settings/petty-cash")).toBe("settings");
    expect(sidebarHost.currentOf(`${HOME}/settings`)).toBeNull();
    expect(sidebarHost.currentOf(HOME)).toBeNull();
  });
});

describe("logging out", () => {
  it("forgets the token and ends the session at Flask", () => {
    setAuth("tok", ENTITY, "Olive & Vine");
    const go = vi.fn();
    _resetHandoffForTests(go);
    sidebarHost.logOut();
    expect(document.cookie).not.toContain("petty_cash_token=tok");
    expect(go).toHaveBeenCalledWith("http://localhost:8000/logout");
  });
});

describe("the viewer's token", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("is the cookie's on this app's pages, and none on the public share page (no profile read there)", () => {
    setAuth("tok", ENTITY, "Olive & Vine");
    window.history.replaceState(null, "", "/entity/360812e1/olive-and-vine/petty-cash");
    expect(sidebarHost.currentToken()).toBe("tok");
    window.history.replaceState(null, "", "/share/OV/13_Oct_2026/AbCdEfGhIjKlMnOpQrStUvWxYz012-_9");
    expect(sidebarHost.currentToken()).toBe("");
  });
});

describe("the host's other seams", () => {
  // loadViewer (@minty/shared/portal), lockScroll (@minty/shared/scrollLock) and the signed-out
  // links, since the shared-code refactor (2026-10-21).

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.style.overflow = "";
  });

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it("locks the body's scroll and puts back whatever it was", () => {
    document.body.style.overflow = "auto";
    const unlock = sidebarHost.lockScroll();
    expect(document.body.style.overflow).toBe("hidden");
    unlock();
    expect(document.body.style.overflow).toBe("auto");
    // nothing set before: nothing set after
    document.body.style.overflow = "";
    sidebarHost.lockScroll()();
    expect(document.body.style.overflow).toBe("");
  });

  it("reads the viewer's name and initials from Flask's profile, with no company in the query", async () => {
    setAuth("tok", ENTITY, "Olive & Vine");
    fetchMock.mockResolvedValue(json(200, { user: { name: "John Birmingha", initials: "JB", email: "x" } }));
    await expect(sidebarHost.loadViewer()).resolves.toEqual({ name: "John Birmingha", initials: "JB" });
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/api/me/profile");
    expect((fetchMock.mock.calls[0][1].headers as Headers).get("Authorization")).toBe("Bearer tok");
  });

  it.each([{}, { user: null }, { user: { name: "J" } }, { user: { name: 1, initials: "J" } }, { user: { name: "J", initials: null } }])(
    "has no viewer for %j",
    async (body) => {
      setAuth("tok", ENTITY, "n");
      fetchMock.mockResolvedValue(json(200, body));
      await expect(sidebarHost.loadViewer()).resolves.toBeNull();
    },
  );

  it("only rejects on a 401 - the page never moves for a decoration - and rejects on any refusal", async () => {
    setAuth("tok", ENTITY, "n");
    const go = vi.fn();
    _resetHandoffForTests(go);
    fetchMock.mockResolvedValueOnce(json(401, null));
    await expect(sidebarHost.loadViewer()).rejects.toMatchObject({ status: 401 });
    expect(go).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(json(500, { error: "Flask is down for a moment." }));
    await expect(sidebarHost.loadViewer()).rejects.toMatchObject({ status: 500, message: "Flask is down for a moment." });
    // owner 2026-10-21: one shared module (@minty/shared/errorCopy) - a one-word "sentence" is not
    // shown (it was: "Down.")
    fetchMock.mockResolvedValueOnce(json(500, { error: "Down." }));
    await expect(sidebarHost.loadViewer()).rejects.toMatchObject({ status: 500, message: HOUSE_FALLBACK });
  });

  it("leads home and to settings at / with no company, and to the payments app's own address", () => {
    expect(sidebarHost.entityId()).toBe("");
    expect(sidebarHost.entityName()).toBe("");
    expect(sidebarHost.links.pettyCashDashboard()).toBe("/");
    expect(sidebarHost.links.settings()).toBe("/");
    expect(sidebarHost.links.bills()).toBe("http://localhost:3020/");
    expect(new URL(sidebarHost.links.profile()).searchParams.has("entity_id")).toBe(false);
    expect(sidebarHost.moduleAccess()).toEqual({ pettyCash: true, billing: true });
  });

  it("calls onLeaving before it forgets the token and leaves", () => {
    setAuth("tok", ENTITY, "n");
    const order: string[] = [];
    _resetHandoffForTests((url) => order.push(`leave ${url} token=${document.cookie.includes("petty_cash_token=tok")}`));
    sidebarHost.logOut(() => order.push(`onLeaving token=${document.cookie.includes("petty_cash_token=tok")}`));
    expect(order).toEqual(["onLeaving token=true", "leave http://localhost:8000/logout token=false"]);
  });
});
