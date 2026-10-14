import { describe, expect, it } from "vitest";

import { companyRefFromPath, pettyCashHome } from "@/lib/companyPages";

describe("companyRefFromPath", () => {
  it.each([
    ["/entity/360812e1/olive-and-vine/petty-cash", "360812e1/olive-and-vine"],
    ["/entity/360812E1/olive-and-vine", "360812e1/olive-and-vine"],
    ["/entity/360812e1/vine-caf%C3%A9/petty-cash?x=1", "360812e1/vine-café"],
    ["/entity/360812e1/bad%E0%A4%A/petty-cash", "360812e1/bad%E0%A4%A"],
  ])("reads %s as %s", (path, ref) => {
    expect(companyRefFromPath(path)).toBe(ref);
  });

  it.each(["/", "/landing", "/entity/not-hex1/x", "/entity/360812e1"])("finds no company in %s", (path) => {
    expect(companyRefFromPath(path)).toBe("");
  });
});

describe("pettyCashHome", () => {
  it("is the company's address, by short id and name", () => {
    expect(pettyCashHome("360812e1-9f94-46a3-aa31-347e21afde8e", "Olive & Vine")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash",
    );
  });
});
