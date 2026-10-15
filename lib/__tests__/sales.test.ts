import { describe, expect, it } from "vitest";

import { changed, flaskLabel, salesTotals, sections, type SalesMethod } from "@/lib/sales";

const method = (value_name: string, type: SalesMethod["type"], name = value_name): SalesMethod => ({
  sale_id: value_name,
  name,
  value_name,
  type,
  amount: null,
});

describe("method labels (Flask's str.title())", () => {
  it.each([
    ["Visa", "Visa"],
    ["WeChat Pay", "Wechat Pay"],
    ["UnionPay", "Unionpay"],
    ["OpenRice", "Openrice"],
    ["Food Panda", "Food Panda"],
    ["payme", "Payme"],
    ["7-eleven", "7-Eleven"],
    ["octopus_sales", "Octopus"],
  ])("%j shows as %j", (name, label) => {
    expect(flaskLabel(name)).toBe(label);
  });
});

describe("the sections and their totals", () => {
  const methods = [
    method("visa_sales", "electronic"),
    method("foodpanda_sales", "delivery"),
    method("deliveroo_sales", "delivery"),
    method("alipay_sales", "electronic"),
  ];

  it("leave Deliveroo out even when it is set up as an electronic method", () => {
    const { electronic } = sections([method("deliveroo_sales", "electronic"), method("visa_sales", "electronic")]);
    expect(electronic.map((m) => m.value_name)).toEqual(["visa_sales"]);
  });

  it("keep Settings order and leave Deliveroo out of delivery", () => {
    const { electronic, delivery } = sections(methods);
    expect(electronic.map((m) => m.value_name)).toEqual(["visa_sales", "alipay_sales"]);
    expect(delivery.map((m) => m.value_name)).toEqual(["foodpanda_sales"]);
  });

  it("add up what the fields show, commas and empties included", () => {
    expect(
      salesTotals(methods, { visa_sales: "1,200.50", alipay_sales: "", foodpanda_sales: "33.25", deliveroo_sales: "9" }, "1,000.00"),
    ).toEqual({ electronic: 1200.5, delivery: 33.25, cash: 1000 });
  });
});

describe("unsaved changes (Flask's hasUnsavedChanges)", () => {
  it.each([
    ["5", "", true],
    ["30", "30.00", true],
    ["1,200.00", "1200.00", false],
    ["", "30.00", false], // emptying a field is not a change
    ["-", "", false],
  ])("%j against %j is %s", (now, initial, expected) => {
    expect(changed(now, initial)).toBe(expected);
  });
});
