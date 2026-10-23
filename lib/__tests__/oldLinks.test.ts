// Old `pettycash.dailyminty.com` links after the host switch (lib/oldLinks.ts): Flask's share links,
// its Petty Cash addresses (and their older forms), its other pages and its backend paths.

import { describe, expect, it } from "vitest";

import { isFlaskBackendPath } from "@/lib/handoff";
import { oldLink } from "@/lib/oldLinks";

const UUID = "360812e1-9f94-46a3-aa31-347e21afde8e";
const CO = "/entity/360812e1/olive-and-vine";
const SECRET = "Ab3_-xYz0123456789abcdefghijklmn";

describe("Flask's share links", () => {
  it.each([
    [`/Minty_Report/OV/13_Oct_2026/${SECRET}/`, `/share/OV/13_Oct_2026/${SECRET}`],
    [`/Minty_Report/OV/13_Oct_2026/${SECRET}`, `/share/OV/13_Oct_2026/${SECRET}`],
    // non-ASCII initials stay escaped exactly once
    [`/Minty_Report/%E8%8C%B6/13_Oct_2026/${SECRET}/`, `/share/%E8%8C%B6/13_Oct_2026/${SECRET}`],
  ])("%s -> the share page", (from, to) => {
    expect(oldLink(from)).toEqual({ kind: "share", to });
  });

  it.each([
    "/Minty_Report/OV/13_Oct_2026/",
    "/Minty_Report/OV/13_Oct_2026/short/",
    `/Minty_Report/OV/13_Oct_2026/${SECRET}/extra/`,
    `/Minty_Report/../13_Oct_2026/${SECRET}/`,
    `/Minty_Report/%E0%A4%A/13_Oct_2026/${SECRET}/`,
    "/Minty_Report",
  ])("leaves a malformed one (%s) to the 404", (from) => {
    expect(oldLink(from)).toBeNull();
  });
});

describe("Petty Cash addresses this app serves as they are", () => {
  it.each([
    `${CO}/petty-cash`,
    `${CO}/petty-cash/`,
    `${CO}/petty-cash/reports`,
    `${CO}/petty-cash/reports/new/opening`,
    `${CO}/petty-cash/reports/new/sale`,
    `${CO}/petty-cash/reports/new/expense`,
    `${CO}/petty-cash/reports/new/deposit`,
    `${CO}/petty-cash/reports/new/cash-count`,
    `${CO}/petty-cash/reports/new/ending`,
    `${CO}/petty-cash/reports/r-1/summary`,
    `${CO}/petty-cash/reports/r-1/submitted`,
    `${CO}/settings/petty-cash`,
    "/",
    "/landing",
    `/share/OV/13_Oct_2026/${SECRET}`,
  ])("%s", (path) => {
    expect(oldLink(path)).toBeNull();
  });
});

describe("Flask's other Petty Cash addresses, mapped to this app's page for them", () => {
  it.each([
    [CO, `${CO}/petty-cash`],
    [`${CO}/`, `${CO}/petty-cash`],
    [`${CO}/reports`, `${CO}/petty-cash/reports`],
    [`${CO}/reports/new/opening`, `${CO}/petty-cash/reports/new/opening`],
    [`${CO}/reports/r-1/summary`, `${CO}/petty-cash/reports/r-1/summary`],
    [`${CO}/reports/r-1/opening`, `${CO}/petty-cash/reports/r-1/summary`],
    [`${CO}/petty-cash/reports/r-1/cash-count`, `${CO}/petty-cash/reports/r-1/summary`],
    [`${CO}/petty-cash/reports/resume`, `${CO}/petty-cash`],
    [`${CO}/petty-cash/reports/summary`, `${CO}/petty-cash`],
    [`${CO}/petty-cash/reports/new/submitted`, `${CO}/petty-cash`],
    [`${CO}/petty-cash/reports/download-csv`, `${CO}/petty-cash/reports`],
    [`${CO}/ending`, `${CO}/petty-cash`],
    [`${CO}/ending/r-1`, `${CO}/petty-cash/reports/r-1/summary`],
    [`${CO}/report/opening`, `${CO}/petty-cash/reports/new/opening`],
  ])("%s -> %s", (from, to) => {
    expect(oldLink(from)).toEqual({ kind: "local", to });
  });

  it("keeps the name as it was written (escaped)", () => {
    expect(oldLink("/entity/360812e1/caf%C3%A9/reports")).toEqual({
      kind: "local",
      to: "/entity/360812e1/caf%C3%A9/petty-cash/reports",
    });
  });

  it.each([
    [`/entity/${UUID}/petty-cash`, "/petty-cash"],
    [`/entity/${UUID}`, "/petty-cash"],
    [`/entity/${UUID.toUpperCase()}/petty-cash/reports`, "/petty-cash/reports"],
    [`/entity/${UUID}/petty-cash/reports/new/cash-count`, "/petty-cash/reports/new/cash-count"],
    [`/entity/${UUID}/petty-cash/reports/r-1/submitted`, "/petty-cash/reports/r-1/submitted"],
    [`/entity/${UUID}/reports/r-1/ending`, "/petty-cash/reports/r-1/summary"],
    [`/entity/${UUID}/settings/petty-cash`, "/settings/petty-cash"],
    [`/entity/${UUID}/ending/r-1`, "/petty-cash/reports/r-1/summary"],
    [`/entity/${UUID}/report/opening`, "/petty-cash/reports/new/opening"],
    [`/entity/settings/entity/${UUID}`, "/settings/petty-cash"],
  ])("a full company id (%s) needs the company's name: it waits for the token", (from, tail) => {
    expect(oldLink(from)).toEqual({ kind: "company-uuid", uuid: UUID, tail });
  });
});

describe("Flask's other pages -> minty-web through the hand-off", () => {
  it.each([
    ["/profile", "/profile"],
    ["/subscription", "/subscription"],
    ["/subscription/entities/360812e1/olive-and-vine/modules", "/subscription"],
    ["/entity", "/entities"],
    ["/entities", "/entities"],
    ["/entities/360812e1/olive-and-vine", "/entities"],
    ["/entity/create", "/entities"],
    ["/entity/success", "/entities"],
    ["/login", "/entities"],
    ["/register", "/entities"],
    ["/index", "/entities"],
    ["/reset_password", "/entities"],
    ["/reset_password/tok", "/entities"],
    ["/no-permission", "/entities"],
    ["/admin", "/entities"],
    ["/admin_dashboard", "/entities"],
    ["/find_user", "/entities"],
    ["/create", "/entities"],
    ["/report/r-1", "/entities"],
    ["/report/edit/r-1", "/entities"],
    ["/payment-request", "/entities"],
    ["/payment_request/new", "/entities"],
  ])("%s -> minty-web's %s", (from, next) => {
    expect(oldLink(from)).toEqual({ kind: "hub", next });
  });

  it.each([
    [`${CO}/settings/users`, `${CO}/settings/users`],
    [`${CO}/settings/integration`, `${CO}/settings/integration`],
    [`${CO}/settings/modules`, `${CO}/settings/modules`],
    [`${CO}/settings/xero`, `${CO}/settings/integration`],
    [`${CO}/xero-not-connected`, `${CO}/settings/integration`],
    [`${CO}/modules`, CO],
  ])("a company page %s -> minty-web's %s (it resolves the company itself)", (from, next) => {
    expect(oldLink(from)).toEqual({ kind: "hub", next });
  });

  it.each([
    [`/entity/${UUID}/settings/users`, `/entity/${UUID}/company/settings/users`],
    [`/entity/${UUID}/modules`, `/entity/${UUID}/company`],
    [`/entity/settings/users/${UUID}`, `/entity/${UUID}/company/settings/users`],
    [`/entity/settings/module/${UUID}`, `/entity/${UUID}/company/settings/modules`],
    [`/invitation/xero-not-connected/${UUID}`, `/entity/${UUID}/company/settings/integration`],
  ])("a full company id %s -> minty-web's %s, scoped to it", (from, next) => {
    expect(oldLink(from)).toEqual({ kind: "hub", next, entityId: UUID });
  });
});

describe("Flask's backend paths -> the same path on accounts-api", () => {
  it.each([
    "/handoff/petty-cash-web",
    "/handoff/minty-web",
    "/api/me/profile",
    "/api/petty-cash/v1/companies/x/home",
    "/minty/api/users/me",
    "/callback",
    "/logout",
    "/auth/email/handoff",
    "/invitation/accept/tok",
    "/xero_auth",
    "/xero_connect",
    "/xero_reconnect",
    `${CO}/payment-request`,
    `${CO}/settings/payment-request`,
    `/entity/${UUID}/payment-request`,
    `/entity/${UUID}/bills`,
    `/entity/settings/payments/${UUID}`,
  ])("%s", (path) => {
    expect(isFlaskBackendPath(path)).toBe(true);
    expect(oldLink(path)).toEqual({ kind: "backend", path });
  });

  it.each([
    "/handoffx",
    "/apix",
    "/callbacks",
    "/logout/x",
    "/entity",
    `${CO}/petty-cash`,
    "/profile",
    "/xero_authx",
  ])("%s is not one", (path) => {
    expect(isFlaskBackendPath(path)).toBe(false);
  });
});

describe("anything else keeps Next's 404", () => {
  it.each([
    "/nothing-here",
    "/sharex/OV",
    `${CO}/petty-cash/nothing`,
    `${CO}/petty-cash/reports/new/nothing`,
    `${CO}/petty-cash/reports/r-1/nothing`,
    `${CO}/settings/nothing`,
    `${CO}/settings`,
    `${CO}/nothing`,
    "/entity/not-an-id/name",
    "/entity/360812e1",
    `/entity/${UUID}/nothing`,
    "/entity/settings/users/not-a-uuid",
  ])("%s", (path) => {
    expect(oldLink(path)).toBeNull();
  });
});
