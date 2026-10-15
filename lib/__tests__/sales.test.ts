import { describe, expect, it } from "vitest";

import {
  initialValues,
  salesAmounts,
  salesDirty,
  salesTotals,
  sections,
  shownAmount,
  shownMethods,
  type SalesMethod,
  type SalesPage,
} from "@/lib/sales";

const method = (value_name: string, type: SalesMethod["type"], amount: number | null = null, name = value_name): SalesMethod => ({
  sale_id: value_name,
  name,
  value_name,
  type,
  amount,
});

const methods = [
  method("visa_sales", "electronic", 1200.5, "Visa"),
  method("foodpanda_sales", "delivery", 0, "Food Panda"),
  method("deliveroo_sales", "delivery", 9, "Deliveroo"),
  method("wechat_sales", "electronic", null, "WeChat Pay"),
];

const page = (over: Partial<SalesPage> = {}): SalesPage => ({
  transaction_date: "2026-10-13",
  currency_code: "HKD",
  draft: null,
  methods,
  cash_sales: 300,
  ...over,
});

describe("the sections", () => {
  it("keep Settings order and leave Deliveroo out of delivery, as Flask does", () => {
    const { electronic, delivery } = sections(methods);
    expect(electronic.map((m) => m.value_name)).toEqual(["visa_sales", "wechat_sales"]);
    expect(delivery.map((m) => m.value_name)).toEqual(["foodpanda_sales"]);
    expect(shownMethods(methods).map((m) => m.value_name)).toEqual(["visa_sales", "wechat_sales", "foodpanda_sales"]);
  });

  it("show the catalogue's names as they stand", () => {
    expect(sections(methods).electronic.map((m) => m.name)).toEqual(["Visa", "WeChat Pay"]);
  });
});

describe("the running totals", () => {
  it("add up what the fields show - commas, empties and Deliveroo's hidden value aside", () => {
    expect(
      salesTotals(methods, { visa_sales: "1,200.50", wechat_sales: "", foodpanda_sales: "33.25", deliveroo_sales: "9" }, "1,000.00"),
    ).toEqual({ electronic: 1200.5, delivery: 33.25, cash: 1000, total: 2233.75 });
  });

  it("never show floating-point dust", () => {
    expect(salesTotals(methods, { visa_sales: "0.1", wechat_sales: "0.2" }, "").electronic).toBe(0.3);
    expect(salesTotals(methods, { visa_sales: "0.1", wechat_sales: "0.2" }, "0.4").total).toBe(0.7);
  });
});

describe("the fields as the page opens", () => {
  it("are grouped, with a zero or no amount as an empty field", () => {
    expect(shownAmount(1200.5)).toBe("1,200.50");
    expect(shownAmount(0)).toBe("");
    expect(shownAmount(null)).toBe("");
    expect(initialValues(page())).toEqual({ values: { visa_sales: "1,200.50", wechat_sales: "", foodpanda_sales: "" }, cash: "300.00" });
  });
});

describe("unsaved changes", () => {
  const start = initialValues(page());

  it("are none as the page opens, or with a value put back in another form", () => {
    expect(salesDirty(page(), start.values, start.cash)).toBe(false);
    expect(salesDirty(page(), { ...start.values, visa_sales: "1200.5" }, "300")).toBe(false);
  });

  it("are a new amount, an emptied one, or the cash", () => {
    expect(salesDirty(page(), { ...start.values, wechat_sales: "5" }, start.cash)).toBe(true);
    expect(salesDirty(page(), { ...start.values, visa_sales: "" }, start.cash)).toBe(true);
    expect(salesDirty(page(), start.values, "")).toBe(true);
  });

  it("ignore the hidden Deliveroo amount", () => {
    expect(salesDirty(page(), { ...start.values, deliveroo_sales: "" }, start.cash)).toBe(false);
  });
});

describe("the save's amounts", () => {
  it("name every method the stage shows, an empty field as zero", () => {
    expect(salesAmounts(methods, { visa_sales: "1,200.55", wechat_sales: "", deliveroo_sales: "9" })).toEqual({
      visa_sales: 1200.55,
      wechat_sales: 0,
      foodpanda_sales: 0,
    });
  });
});
