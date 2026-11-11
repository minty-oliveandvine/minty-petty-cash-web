// Every company setting lives in the hub (minty-web) since 2026-11-10 (owner) - Petty Cash Settings
// and Payment Settings included. This app only links there, through accounts-api's
// /handoff/minty-web, which mints the hub's token for the company.

import { describe, expect, it } from "vitest";

import { settingsHref, settingsTabUrl } from "@/lib/settings";

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";

describe("the settings tabs - every one the hub's", () => {
  it.each(["users", "general", "integration", "petty-cash", "payment", "modules"] as const)(
    "%s is minty-web's tab, through /handoff/minty-web",
    (tab) => {
      const url = new URL(settingsTabUrl(ENTITY, "Olive & Vine", tab));
      expect(url.origin + url.pathname).toBe("http://localhost:8000/handoff/minty-web");
      expect(url.searchParams.get("next")).toBe(`/entity/360812e1/olive-and-vine/settings/${tab}`);
      expect(url.searchParams.get("entity_id")).toBe(ENTITY);
    },
  );

  it("Petty Cash Settings - the menu's Settings, the Setup Required gate - is the hub's tab", () => {
    expect(settingsHref(ENTITY, "Olive & Vine")).toBe(
      settingsTabUrl(ENTITY, "Olive & Vine", "petty-cash"),
    );
  });
});
