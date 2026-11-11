// This app's sidebar host (../sidebarHost.ts): where the menu leads FROM Petty Cash.

import { afterEach, describe, expect, it, vi } from "vitest";

import { sidebarHost } from "@/components/ui/sidebarHost";
import { setAuth } from "@/lib/auth";
import { _resetHandoffForTests } from "@/lib/handoff";

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";
const HOME = "/entity/360812e1/olive-and-vine/petty-cash";

afterEach(() => _resetHandoffForTests());

describe("the menu's links", () => {
  it("keeps the dashboard and Reports in this app; Settings is the hub's Petty Cash Settings tab", () => {
    setAuth("tok", ENTITY, "Olive & Vine");
    expect(sidebarHost.links.pettyCashDashboard()).toBe(HOME);
    expect(sidebarHost.links.pettyCashReports(ENTITY)).toBe(`${HOME}/reports`);
    const settings = new URL(sidebarHost.links.settings());
    expect(settings.origin + settings.pathname).toBe("http://localhost:8000/handoff/minty-web");
    expect(settings.searchParams.get("next")).toBe(
      "/entity/360812e1/olive-and-vine/settings/petty-cash",
    );
  });

  it("reaches minty-web's pages and the payments app through Flask", () => {
    setAuth("tok", ENTITY, "Olive & Vine");
    const entities = new URL(sidebarHost.links.entities());
    expect(entities.origin + entities.pathname).toBe("http://localhost:8000/handoff/minty-web");
    expect(entities.searchParams.get("next")).toBe("/entities");
    expect(new URL(sidebarHost.links.subscriptions()).searchParams.get("next")).toBe(
      "/subscription",
    );
    expect(new URL(sidebarHost.links.bills()).pathname).toBe(`/entity/${ENTITY}/payment-request`);
    // no profile link: My Profile opens only in the sidebar (@minty/shared v0.12)
    expect("profile" in sidebarHost.links).toBe(false);
  });

  it("marks nothing current: no menu item is this app's own page since Settings moved (2026-11-10)", () => {
    expect(sidebarHost.currentOf("/entity/360812e1/olive-and-vine/settings/petty-cash")).toBeNull();
    expect(sidebarHost.currentOf(`${HOME}/settings`)).toBeNull();
    expect(sidebarHost.currentOf(HOME)).toBeNull();
  });
});

describe("logging out", () => {
  it("forgets the token and ends the session at Flask with a POST (a GET answers 405)", () => {
    setAuth("tok", ENTITY, "Olive & Vine");
    const go = vi.fn();
    _resetHandoffForTests(go);
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
    sidebarHost.logOut();
    expect(document.cookie).not.toContain("petty_cash_token=tok");
    expect(submit).toHaveBeenCalledTimes(1);
    const form = submit.mock.contexts[0] as HTMLFormElement;
    expect(form.getAttribute("method")).toBe("POST");
    expect(form.getAttribute("action")).toBe("http://localhost:8000/logout");
    expect(go).not.toHaveBeenCalled();
  });
});
