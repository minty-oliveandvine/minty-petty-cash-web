import { describe, expect, it } from "vitest";

import { companyRefFromPath, pettyCashHome, reportHref } from "@/lib/companyPages";

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
