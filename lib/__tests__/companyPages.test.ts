import { describe, expect, it } from "vitest";

import {
  companyRefFromPath,
  isReportStepView,
  pettyCashHome,
  reportHref,
  reportStepHref,
} from "@/lib/companyPages";

describe("companyRefFromPath", () => {
  it.each([
    ["/entity/360812e1/olive-and-vine/petty-cash", "360812e1/olive-and-vine"],
    ["/entity/360812E1/olive-and-vine", "360812e1/olive-and-vine"],
    ["/entity/360812e1/vine-caf%C3%A9/petty-cash?x=1", "360812e1/vine-café"],
    ["/entity/360812e1/bad%E0%A4%A/petty-cash", "360812e1/bad%E0%A4%A"],
  ])("reads %s as %s", (path, ref) => {
    expect(companyRefFromPath(path)).toBe(ref);
  });

  it.each(["/", "/landing", "/entity/not-hex1/x", "/entity/360812e1"])(
    "finds no company in %s",
    (path) => {
      expect(companyRefFromPath(path)).toBe("");
    },
  );
});

describe("pettyCashHome", () => {
  it("is the company's address, by short id and name", () => {
    expect(pettyCashHome("360812e1-9f94-46a3-aa31-347e21afde8e", "Olive & Vine")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash",
    );
  });
});

describe("reportHref", () => {
  it("is a report's own page, at Flask's address for it", () => {
    const id = "360812e1-9f94-46a3-aa31-347e21afde8e";
    expect(reportHref(id, "Olive & Vine", "8a1d3c55-0f8e-4f4e-9d55-2c4b7d1e0a77", "summary")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash/reports/8a1d3c55-0f8e-4f4e-9d55-2c4b7d1e0a77/summary",
    );
    expect(reportHref(id, "Olive & Vine", "r/1", "submitted")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash/reports/r%2F1/submitted",
    );
  });
});

describe("reportStepHref", () => {
  const id = "360812e1-9f94-46a3-aa31-347e21afde8e";
  const base = "/entity/360812e1/olive-and-vine/petty-cash/reports/r1";

  it.each([
    ["opening", "opening"],
    ["sales", "sale"],
    ["expenses", "expense"],
    ["deposit", "deposit"],
    ["cash_count", "cash-count"],
  ] as const)("leads %s to its read-only view at /%s", (step, segment) => {
    expect(reportStepHref(id, "Olive & Vine", "r1", step)).toBe(`${base}/${segment}`);
    expect(isReportStepView(segment)).toBe(true);
  });

  it("leads Ending back to the summary", () => {
    expect(reportStepHref(id, "Olive & Vine", "r1", "ending")).toBe(`${base}/summary`);
  });

  it.each(["ending", "summary", "sales", "cash_count", "toString", ""])(
    "knows %s is no step view",
    (segment) => {
      expect(isReportStepView(segment)).toBe(false);
    },
  );
});
