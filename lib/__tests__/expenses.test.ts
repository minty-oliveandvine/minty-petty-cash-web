import { describe, expect, it } from "vitest";

import {
  accountLabel,
  accountProblem,
  amountProblem,
  canEditLines,
  exactSupplier,
  expenseCount,
  fileSize,
  missingReceipt,
  newSupplierProblem,
  offersNewSupplier,
  receiptKind,
  receiptProblem,
  remarksHelper,
  remarksProblem,
  supplierMatches,
  supplierProblem,
  withoutLine,
  withSupplier,
  type ExpenseLine,
} from "@/lib/expenses";

// Amounts read "HKD 760.00" - owner 2026-10-21: one money rule (@minty/shared/money); they were "HKD760.00".

const SUPPLIERS = [
  { id: "s2", name: "Wellcome" },
  { id: "s1", name: "ParknShop" },
  { id: "s3", name: "Park Lane Florist" },
];

describe("the amount", () => {
  const at = (text: string, touched = false, submitted = false) => amountProblem(text, { touched, submitted, code: "HKD" });

  it("is quiet while empty until a submit is refused", () => {
    expect(at("")).toBeNull();
    expect(at("", true)).toBeNull();
    expect(at("", false, true)).toBe("The amount is still empty. Add the amount to continue.");
  });

  it("waits for the field to be left before calling a zero a problem - it may be on its way to 0.50", () => {
    expect(at("0")).toBeNull();
    expect(at("0.00", true)).toBe("The amount is 0. Enter an amount above 0.");
    expect(at("0", false, true)).toBe("The amount is 0. Enter an amount above 0.");
  });

  it("takes any amount above 0 up to the limit, and names the limit above it", () => {
    expect(at("0.01", true)).toBeNull();
    expect(at("99,999,999,999.99", true)).toBeNull();
    expect(at("100000000000", false)).toBe("The amount is above HKD\u00a099,999,999,999.99. Enter HKD\u00a099,999,999,999.99 or less.");
  });
});

describe("the description", () => {
  it("never warns within 300 characters and names the limit above it", () => {
    expect(remarksProblem("x".repeat(300))).toBeNull();
    expect(remarksProblem(` ${"x".repeat(300)} `)).toBeNull();
    expect(remarksProblem("x".repeat(301))).toBe("The description is 301 characters. Shorten it to 300 characters or fewer.");
  });

  it("counts as it is typed", () => {
    expect(remarksHelper("")).toBe("Optional. 0 of 300 characters.");
    expect(remarksHelper("paper")).toBe("Optional. 5 of 300 characters.");
  });
});

describe("the supplier", () => {
  const opts = (touched: boolean, submitted: boolean, canCreate = true) => ({ touched, submitted, canCreate });

  it("is fine once one is chosen", () => {
    expect(supplierProblem("ParknShop", SUPPLIERS[1], opts(true, true))).toBeNull();
  });

  it("is quiet while empty until a submit is refused", () => {
    expect(supplierProblem("", null, opts(true, false))).toBeNull();
    expect(supplierProblem("  ", null, opts(false, true))).toBe("The supplier is still empty. Choose a supplier from the list to continue.");
  });

  it("lets a name be typed, and says it is not a supplier only once the field is left", () => {
    expect(supplierProblem("Park", null, opts(false, false))).toBeNull();
    expect(supplierProblem("Park ", null, opts(true, false))).toBe('"Park" is not a supplier yet. Choose one from the list, or add it as a new supplier.');
    expect(supplierProblem("Park", null, opts(true, false, false))).toBe('"Park" is not a supplier yet. Choose one from the list.');
  });

  it("searches by name, any case, A to Z, and finds the exact one however it is spaced", () => {
    expect(supplierMatches(SUPPLIERS, "").map((s) => s.name)).toEqual(["Park Lane Florist", "ParknShop", "Wellcome"]);
    expect(supplierMatches(SUPPLIERS, "PARK").map((s) => s.name)).toEqual(["Park Lane Florist", "ParknShop"]);
    expect(supplierMatches(SUPPLIERS, "lane  florist").map((s) => s.id)).toEqual(["s3"]);
    expect(exactSupplier(SUPPLIERS, "  park   lane florist ")?.id).toBe("s3");
    expect(exactSupplier(SUPPLIERS, "Park")).toBeNull();
    expect(exactSupplier(SUPPLIERS, "")).toBeNull();
  });

  it("offers a new supplier only when allowed, typed, and not already there", () => {
    expect(offersNewSupplier(SUPPLIERS, "Kwok Transport", true)).toBe(true);
    expect(offersNewSupplier(SUPPLIERS, "Kwok Transport", false)).toBe(false);
    expect(offersNewSupplier(SUPPLIERS, " ", true)).toBe(false);
    expect(offersNewSupplier(SUPPLIERS, "wellcome", true)).toBe(false);
  });

  it("checks a new supplier's name as it is typed and refuses a duplicate", () => {
    expect(newSupplierProblem("", SUPPLIERS, false)).toBeNull();
    expect(newSupplierProblem("", SUPPLIERS, true)).toBe("The supplier's name is still empty. Add the name to continue.");
    expect(newSupplierProblem("x".repeat(151), SUPPLIERS, false)).toBe("The name is 151 characters. Keep it to 150 characters or fewer.");
    expect(newSupplierProblem(" WELLCOME ", SUPPLIERS, false)).toBe("Wellcome is already a supplier. Choose it from the list.");
    expect(newSupplierProblem("Kwok Transport", SUPPLIERS, true)).toBeNull();
  });

  it("puts a new supplier into the list A to Z", () => {
    expect(withSupplier(SUPPLIERS, { id: "s9", name: "Kwok" }).map((s) => s.name)).toEqual(["Kwok", "Park Lane Florist", "ParknShop", "Wellcome"]);
  });
});

describe("the account", () => {
  it("is a problem only when none is chosen after a refused submit", () => {
    expect(accountProblem("", false)).toBeNull();
    expect(accountProblem("", true)).toBe("The account is still empty. Choose where to record this expense to continue.");
    expect(accountProblem("a1", true)).toBeNull();
  });

  it("reads with the business label first and the code kept visible", () => {
    expect(accountLabel({ id: "a", code: "429", name: "General Expenses" })).toBe("General Expenses · 429");
    expect(accountLabel({ id: "a", code: "", name: "Postage" })).toBe("Postage");
  });
});

describe("the receipt", () => {
  const file = (name: string, size: number, type: string) => ({ name, size, type });

  it("takes a PDF, JPEG or PNG of up to 10 MB", () => {
    expect(receiptProblem(file("r.pdf", 1000, "application/pdf"))).toBeNull();
    expect(receiptProblem(file("r.jpg", 10 * 1024 * 1024, "image/jpeg"))).toBeNull();
    expect(receiptProblem(file("r.png", 5, "image/png"))).toBeNull();
    // a browser that gives no type: judged by the name (the API judges the bytes)
    expect(receiptProblem(file("r.JPEG", 5, ""))).toBeNull();
  });

  it("names the file and the limit when it can't be the receipt", () => {
    expect(receiptProblem(file("r.gif", 5, "image/gif"))).toBe("r.gif isn't a PDF, JPEG or PNG. Attach the receipt as one of those.");
    expect(receiptProblem(file("r.heic", 5, "image/heic"))).toBe("r.heic isn't a PDF, JPEG or PNG. Attach the receipt as one of those.");
    expect(receiptProblem(file("big.jpg", 12.3 * 1024 * 1024, "image/jpeg"))).toBe("big.jpg is 12.3 MB. Attach a file of 10 MB or less.");
    expect(receiptProblem(file("e.pdf", 0, "application/pdf"))).toBe("e.pdf is empty. Attach the receipt again.");
  });

  it("is missing only after a refused submit", () => {
    expect(missingReceipt(null, false)).toBeNull();
    expect(missingReceipt(null, true)).toBe("The receipt is still missing. Take a photo of it or choose its file to continue.");
  });

  it("shows its size and kind", () => {
    expect(fileSize(500)).toBe("500 B");
    expect(fileSize(860 * 1024)).toBe("860 KB");
    expect(fileSize(2.44 * 1024 * 1024)).toBe("2.4 MB");
    expect(receiptKind("application/pdf")).toBe("pdf");
    expect(receiptKind("IMAGE/PNG")).toBe("image");
    expect(receiptKind(null)).toBe("file");
  });
});

describe("the list", () => {
  const line = (id: string): ExpenseLine => ({ id, item: "x", amount: 1, remarks: "", supplier: null, account: null, receipts: [] });

  it("counts and drops entries", () => {
    expect(expenseCount(1)).toBe("1 expense");
    expect(expenseCount(3)).toBe("3 expenses");
    expect(withoutLine([line("a"), line("b")], "a").map((l) => l.id)).toEqual(["b"]);
  });

  it("can be changed only while the report is a draft", () => {
    expect(canEditLines(null)).toBe(true);
    const draft = { id: "d", status: "draft", current_section: "expenses", completed_sections: [], xero_integrated: false, publishing_status: null };
    expect(canEditLines(draft)).toBe(true);
    expect(canEditLines({ ...draft, status: "submitted" })).toBe(false);
  });
});
