import { describe, expect, it } from "vitest";

import { WIZARD_BACK_SKIP } from "@/lib/wizardPages";

const PC = "/entity/3d65f186/e2e-petty-cash-shop/petty-cash";
const skipped = (path: string) => WIZARD_BACK_SKIP.some((rule) => rule.test(path));

describe("WIZARD_BACK_SKIP: what a step's Back steps over", () => {
  it("steps over the wizard's steps and a report's view and Submitted pages", () => {
    for (const step of ["opening", "sale", "expense", "deposit", "cash-count", "ending"])
      expect(skipped(`${PC}/reports/new/${step}`)).toBe(true);
    expect(skipped(`${PC}/reports/8a1d3c55-0f8e-4f4e-9d55-2c4b7d1e0a77/summary`)).toBe(true);
    expect(skipped(`${PC}/reports/8a1d3c55-0f8e-4f4e-9d55-2c4b7d1e0a77/submitted`)).toBe(true);
    // a submitted report's read-only steps
    expect(skipped(`${PC}/reports/8a1d3c55-0f8e-4f4e-9d55-2c4b7d1e0a77/cash-count`)).toBe(true);
  });

  it("stops at the dashboard and the report list - where the wizard is entered from", () => {
    expect(skipped(PC)).toBe(false);
    expect(skipped(`${PC}/reports`)).toBe(false);
  });
});
