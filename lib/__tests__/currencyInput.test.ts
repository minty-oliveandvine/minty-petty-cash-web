import { describe, expect, it } from "vitest";

import { isWizardStep, outcomeHref, reportHref, resumeHref, stepHref } from "@/lib/wizardPages";

// The money inputs' rules moved to @minty/shared/money (owner 2026-10-21: one money rule); the
// app's use of them is pinned in lib/__tests__/money.test.ts and components/closing/__tests__/AmountInput.test.tsx.

describe("step addresses", () => {
  const ID = "360812e1-9f94-46a3-aa31-347e21afde8e";
  it("send every step to this app", () => {
    expect(stepHref(ID, "Olive & Vine", "opening", "2026-10-14")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash/reports/new/opening?transaction_date=2026-10-14",
    );
    expect(stepHref(ID, "Olive & Vine", "sales", "2026-10-14")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash/reports/new/sale?transaction_date=2026-10-14",
    );
    expect(stepHref(ID, "Olive & Vine", "expenses", "2026-10-14")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash/reports/new/expense?transaction_date=2026-10-14",
    );
    // the deposit is Cash Count's first section (D15-05): both land on the one stage
    for (const step of ["deposit", "cash_count"] as const) {
      expect(stepHref(ID, "Olive & Vine", step, "2026-10-14")).toBe(
        "/entity/360812e1/olive-and-vine/petty-cash/reports/new/cash-count?transaction_date=2026-10-14",
      );
    }
    // Close is this app's own since Wave 2e - every step is now
    expect(stepHref(ID, "Olive & Vine", "ending", "2026-10-14")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash/reports/new/ending?transaction_date=2026-10-14",
    );
  });

  it("send a submitted report to its outcome page, at Flask's address shape", () => {
    expect(outcomeHref(ID, "Olive & Vine", "5d6e7f80-0000-4000-8000-000000000001")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash/reports/5d6e7f80-0000-4000-8000-000000000001/submitted",
    );
    expect(outcomeHref(ID, "Olive & Vine", "a/b")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash/reports/a%2Fb/submitted",
    );
  });

  it("open a report's Daily Report at Flask's id address for its summary", () => {
    expect(reportHref(ID, "Olive & Vine", "5d6e7f80-0000-4000-8000-000000000001")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash/reports/5d6e7f80-0000-4000-8000-000000000001/summary",
    );
    expect(reportHref(ID, "Olive & Vine", "a/b")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash/reports/a%2Fb/summary",
    );
  });

  it("know the report's sections - and that a key that is no section is not", () => {
    expect(
      ["opening", "sales", "expenses", "deposit", "cash_count", "ending"].filter(isWizardStep),
    ).toEqual(["opening", "sales", "expenses", "deposit", "cash_count", "ending"]);
    expect(isWizardStep("constructor")).toBe(false);
    expect(isWizardStep("review")).toBe(false);
  });

  it("continue a draft at its section's stage in this app, Addition to Drawer when it names none - never a Flask page", () => {
    expect(resumeHref(ID, "Olive & Vine", "expenses", "2026-10-14")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash/reports/new/expense?transaction_date=2026-10-14",
    );
    expect(resumeHref(ID, "Olive & Vine", "deposit", "2026-10-14")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash/reports/new/cash-count?transaction_date=2026-10-14",
    );
    expect(resumeHref(ID, "Olive & Vine", "ending", "2026-10-14")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash/reports/new/ending?transaction_date=2026-10-14",
    );
    for (const none of [null, "", "review"]) {
      expect(resumeHref(ID, "Olive & Vine", none, "2026-10-14")).toBe(
        "/entity/360812e1/olive-and-vine/petty-cash/reports/new/opening?transaction_date=2026-10-14",
      );
    }
  });
});
