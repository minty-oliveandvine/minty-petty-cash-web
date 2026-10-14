import { describe, expect, it } from "vitest";

import { groupMoney, parseMoney, sanitizeMoney } from "@/lib/currencyInput";
import { stepHref } from "@/lib/wizardPages";

describe("money inputs (Flask's currency.js)", () => {
  it.each([
    ["12a3", "123"],
    ["1.2.3", "1.23"],
    ["1.234", "1.23"],
    ["-50", "50"],
    ["123456789012345", "12345678901"],
    ["", ""],
  ])("typing %j keeps %j", (raw, kept) => {
    expect(sanitizeMoney(raw)).toBe(kept);
  });

  it.each([
    ["12000", "12,000.00"],
    ["1234.5", "1,234.50"],
    [".5", "0.50"],
    ["", ""],
  ])("blur turns %j into %j", (raw, shown) => {
    expect(groupMoney(raw)).toBe(shown);
  });

  it("reads a shown value back", () => {
    expect(parseMoney("1,234.50")).toBe(1234.5);
    expect(parseMoney("-")).toBe(0);
    expect(parseMoney("")).toBe(0);
  });
});

describe("step addresses", () => {
  const ID = "360812e1-9f94-46a3-aa31-347e21afde8e";
  it("send a ported step to this app and the rest to Flask", () => {
    expect(stepHref(ID, "Olive & Vine", "opening", "2026-10-14")).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash/reports/new/opening?transaction_date=2026-10-14",
    );
    expect(stepHref(ID, "Olive & Vine", "sales", "2026-10-14")).toBe(
      `http://localhost:8000/entity/${ID}/petty-cash/reports/new/sale?transaction_date=2026-10-14`,
    );
  });
});
