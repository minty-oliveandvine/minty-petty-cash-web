import { describe, expect, it } from "vitest";

import { parseMoney } from "@/lib/currencyInput";
import { stepHref } from "@/lib/wizardPages";

describe("money inputs", () => {
  it("reads a shown value back", () => {
    expect(parseMoney("1,234.50")).toBe(1234.5);
    expect(parseMoney("-")).toBe(0);
    expect(parseMoney("")).toBe(0);
  });
});

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
    expect(stepHref(ID, "Olive & Vine", "deposit", "2026-10-14")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash/reports/new/deposit?transaction_date=2026-10-14",
    );
    expect(stepHref(ID, "Olive & Vine", "cash_count", "2026-10-14")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash/reports/new/cash-count?transaction_date=2026-10-14",
    );
    expect(stepHref(ID, "Olive & Vine", "ending", "2026-10-14")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash/reports/new/ending?transaction_date=2026-10-14",
    );
  });
});
