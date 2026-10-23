// This app's sidebar host (../sidebarHost.ts): where the menu leads FROM Petty Cash.

import { afterEach, describe, expect, it, vi } from "vitest";

import { sidebarHost } from "@/components/ui/sidebarHost";
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
    expect(sidebarHost.links.settings()).toBe(
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
    // straight to minty-web's My Profile through the hand-off, scoped to the company it was opened from
    const profile = new URL(sidebarHost.links.profile());
    expect(profile.origin + profile.pathname).toBe("http://localhost:8000/handoff/minty-web");
    expect(profile.searchParams.get("next")).toBe("/profile");
    expect(profile.searchParams.get("entity_id")).toBe(ENTITY);
  });

  it("marks only its own settings page as current", () => {
    expect(sidebarHost.currentOf("/entity/360812e1/olive-and-vine/settings/petty-cash")).toBe(
      "settings",
    );
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
