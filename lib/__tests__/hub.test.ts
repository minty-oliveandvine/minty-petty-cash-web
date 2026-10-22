// Flask as a backend only: the hand-offs and actions this app may send a person to. Since the
// shared-code refactor (2026-10-21) they are @minty/shared's builders over this app's Flask base
// (lib/env.ts), plus lib/hub.ts's two names - pinned here byte for byte as they were.

import { billsUrl as sharedBillsUrl, paymentRequestSettingsUrl as sharedPaymentRequestSettingsUrl, settingsSectionUrl as sharedSettingsSectionUrl, type HubSettingsSection } from "@minty/shared/companyRef";
import { hubHandoffUrl, logoutUrl as sharedLogoutUrl } from "@minty/shared/handoff";
import { describe, expect, it } from "vitest";

import { env } from "@/lib/env";
import { integrationUrl, subscriptionSettingsUrl } from "@/lib/hub";

// As the sidebar host and the settings pills call them.
const hubUrl = (next: string, entityId?: string) => hubHandoffUrl(env.ACCOUNTS_API_URL, next, entityId);
const settingsSectionUrl = (entityId: string, name: string, section: HubSettingsSection) => sharedSettingsSectionUrl(env.ACCOUNTS_API_URL, entityId, name, section);
const paymentRequestSettingsUrl = (entityId: string) => sharedPaymentRequestSettingsUrl(env.ACCOUNTS_API_URL, entityId);
const billsUrl = (entityId: string) => sharedBillsUrl(env.ACCOUNTS_API_URL, entityId);
const logoutUrl = () => sharedLogoutUrl(env.ACCOUNTS_API_URL);

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

describe("Flask's hand-off addresses, exactly", () => {
  // The built strings, unchanged by the move to @minty/shared (the shared-code refactor, 2026-10-21).

  const BACK = "return_origin=http%3A%2F%2Flocalhost%3A3000";

  it("writes hubUrl as next, then entity_id, then the way back", () => {
    expect(hubUrl("/entities")).toBe(`http://localhost:8000/handoff/minty-web?next=%2Fentities&${BACK}`);
    expect(hubUrl("/profile?tab=a b", ENTITY)).toBe(
      `http://localhost:8000/handoff/minty-web?next=%2Fprofile%3Ftab%3Da+b&entity_id=${ENTITY}&${BACK}`,
    );
    // an empty company is no company
    expect(new URL(hubUrl("/profile", "")).searchParams.has("entity_id")).toBe(false);
  });

  it("writes a settings section at the company's slugged address", () => {
    expect(settingsSectionUrl(ENTITY, "Olive & Vine", "users")).toBe(
      `http://localhost:8000/handoff/minty-web?next=%2Fentity%2F360812e1%2Folive-and-vine%2Fsettings%2Fusers&entity_id=${ENTITY}&${BACK}`,
    );
    // a company with no name is "company" in the address
    expect(new URL(settingsSectionUrl(ENTITY, "", "modules")).searchParams.get("next")).toBe("/entity/360812e1/company/settings/modules");
  });

  it("percent-encodes the company id in the payments app's addresses, and names the way back", () => {
    expect(billsUrl("a/b")).toBe(`http://localhost:8000/entity/a%2Fb/payment-request?${BACK}`);
    expect(paymentRequestSettingsUrl("a/b")).toBe(`http://localhost:8000/entity/a%2Fb/settings/payment-request?${BACK}`);
  });

  it("writes this app's two names exactly as hubUrl wrote them", () => {
    expect(integrationUrl(ENTITY, "Olive & Vine")).toBe(hubUrl("/entity/360812e1/olive-and-vine/settings/integration", ENTITY));
    expect(subscriptionSettingsUrl(ENTITY, "Olive & Vine")).toBe(
      `http://localhost:8000/handoff/minty-web?next=%2Fentity%2F360812e1%2Folive-and-vine%2Fsettings%2Fmodules&entity_id=${ENTITY}&${BACK}`,
    );
  });

  it("logs out with no way back", () => {
    expect(logoutUrl()).toBe("http://localhost:8000/logout");
  });
});
