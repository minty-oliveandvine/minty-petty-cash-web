// Flask as a backend only (lib/hub.ts): the hand-offs and actions this app may send a person to.

import { describe, expect, it } from "vitest";

import {
  billsUrl,
  hubUrl,
  integrationUrl,
  logoutUrl,
  paymentRequestSettingsUrl,
  settingsSectionUrl,
  subscriptionSettingsUrl,
} from "@/lib/hub";

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";

describe("Flask's hand-offs", () => {
  it("reaches a minty-web page through /handoff/minty-web, scoped to a company only when given one", () => {
    const plain = new URL(hubUrl("/entities"));
    expect(plain.origin + plain.pathname).toBe("http://localhost:8000/handoff/minty-web");
    expect(plain.searchParams.get("next")).toBe("/entities");
    expect(plain.searchParams.has("entity_id")).toBe(false);
    // the preview set's way back (Minty preview_origin)
    expect(plain.searchParams.get("return_origin")).toBe(window.location.origin);

    const scoped = new URL(hubUrl("/profile", ENTITY));
    expect(scoped.searchParams.get("next")).toBe("/profile");
    expect(scoped.searchParams.get("entity_id")).toBe(ENTITY);
  });

  it("connects Xero in minty-web's Entity & Integration, at the company's own address", () => {
    const url = new URL(integrationUrl(ENTITY, "Olive & Vine"));
    expect(url.origin + url.pathname).toBe("http://localhost:8000/handoff/minty-web");
    expect(url.searchParams.get("next")).toBe("/entity/360812e1/olive-and-vine/settings/integration");
    expect(url.searchParams.get("entity_id")).toBe(ENTITY);
  });

  it("opens minty-web's Module page for the subscription notice, through the same hand-off", () => {
    const url = new URL(subscriptionSettingsUrl(ENTITY, "Olive & Vine"));
    expect(url.origin + url.pathname).toBe("http://localhost:8000/handoff/minty-web");
    expect(url.searchParams.get("next")).toBe("/entity/360812e1/olive-and-vine/settings/modules");
    expect(url.searchParams.get("entity_id")).toBe(ENTITY);
  });

  it("opens each of minty-web's settings sections at the company's address, through the hand-off", () => {
    for (const section of ["users", "integration", "modules"] as const) {
      const url = new URL(settingsSectionUrl(ENTITY, "Olive & Vine", section));
      expect(url.origin + url.pathname).toBe("http://localhost:8000/handoff/minty-web");
      expect(url.searchParams.get("next")).toBe(`/entity/360812e1/olive-and-vine/settings/${section}`);
      expect(url.searchParams.get("entity_id")).toBe(ENTITY);
      expect(url.searchParams.has("token")).toBe(false);
    }
  });

  it("opens the payments app's settings through Flask's settings hand-off, never a page", () => {
    const url = new URL(paymentRequestSettingsUrl(ENTITY));
    expect(url.origin + url.pathname).toBe(`http://localhost:8000/entity/${ENTITY}/settings/payment-request`);
    expect(url.searchParams.has("token")).toBe(false);
  });

  it("hands the payments app over through Flask's token hand-off, and logs out at Flask", () => {
    expect(new URL(billsUrl(ENTITY)).pathname).toBe(`/entity/${ENTITY}/payment-request`);
    expect(logoutUrl()).toBe("http://localhost:8000/logout");
  });
});
