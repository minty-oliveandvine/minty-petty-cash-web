import { addressCompanyRef } from "@minty/shared/companyRef";
import { describe, expect, it } from "vitest";

import { COUNTRY_ANCHOR, currencySettingsHref, pettyCashHome, settingsHref, XERO_ANCHOR, xeroSettingsHref } from "@/lib/companyPages";

// The company an address names is @minty/shared/companyRef's `addressCompanyRef` since the
// shared-code refactor (2026-10-21) - what the proxy and the hand-off read.
// owner 2026-10-21: one shared module (@minty/shared/companyRef) - no company is null (was "").

describe("addressCompanyRef", () => {
  it.each([
    ["/entity/360812e1/olive-and-vine/petty-cash", "360812e1/olive-and-vine"],
    ["/entity/360812E1/olive-and-vine", "360812e1/olive-and-vine"],
    ["/entity/360812e1/vine-caf%C3%A9/petty-cash?x=1", "360812e1/vine-café"],
    ["/entity/360812e1/bad%E0%A4%A/petty-cash", "360812e1/bad%E0%A4%A"],
  ])("reads %s as %s", (path, ref) => {
    expect(addressCompanyRef(path)).toBe(ref);
  });

  it.each(["/", "/landing", "/entity/not-hex1/x", "/entity/360812e1"])("finds no company in %s", (path) => {
    expect(addressCompanyRef(path)).toBeNull();
  });
});

describe("pettyCashHome", () => {
  it("is the company's address, by short id and name", () => {
    expect(pettyCashHome("360812e1-9f94-46a3-aa31-347e21afde8e", "Olive & Vine")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash",
    );
  });
});

describe("the company's addresses, at the edges", () => {
  // The address rules - @minty/shared/companyRef's since the shared-code refactor (2026-10-21).

  it.each([
    ["/entity/360812e1/olive#top", "360812e1/olive"],
    ["/entity/360812e1/olive?x=1", "360812e1/olive"],
    ["/entity/360812e1/olive/", "360812e1/olive"],
    ["/entity/ABCDEF12/Name%20Here/x", "abcdef12/Name Here"],
  ])("reads %s as %s", (path, ref) => {
    expect(addressCompanyRef(path)).toBe(ref);
  });

  it.each(["/entity/360812e1a/olive", "/entity/360812e/olive", "entity/360812e1/olive", "/x/entity/360812e1/olive", "/entity/360812e1/"])(
    "finds no company in %s - exactly 8 hex characters, at the start",
    (path) => {
      expect(addressCompanyRef(path)).toBeNull();
    },
  );

  it("builds the home, settings and Xero settings from the id and name", () => {
    expect(pettyCashHome("360812E1-9f94", "")).toBe("/entity/360812e1/company/petty-cash");
    expect(settingsHref("360812e1-9f94", "Olive & Vine")).toBe("/entity/360812e1/olive-and-vine/settings/petty-cash");
    expect(XERO_ANCHOR).toBe("xero");
    expect(xeroSettingsHref("360812e1-9f94", "Olive & Vine")).toBe("/entity/360812e1/olive-and-vine/settings/petty-cash#xero");
    expect(COUNTRY_ANCHOR).toBe("country");
    expect(currencySettingsHref("360812e1-9f94", "Olive & Vine")).toBe("/entity/360812e1/olive-and-vine/settings/petty-cash#country");
    expect(pettyCashHome("360812e1-9f94", "Café Ünï")).toBe(`/entity/360812e1/${encodeURIComponent("café-ünï")}/petty-cash`);
  });
});
