// The Expenses step's rules (../expenses.ts), as Flask's report/expense.html has them.

import { describe, expect, it } from "vitest";

import {
  detailRows,
  missingFields,
  newContactProblem,
  receiptKind,
  receiptProblem,
  searchAccounts,
  searchSuppliers,
  uploadName,
  type AddForm,
  type ExpenseLine,
} from "@/lib/expenses";

const S = (name: string) => ({ id: name.toLowerCase(), name });
const SUPPLIERS = [S("Wellcome"), S("ParknShop"), S("apple Daily"), S("Park Lane Florist")];

describe("searchSuppliers", () => {
  it("lists every supplier A to Z when nothing is typed, offering nothing new", () => {
    expect(searchSuppliers(SUPPLIERS, "  ")).toEqual({
      matches: [S("apple Daily"), S("Park Lane Florist"), S("ParknShop"), S("Wellcome")],
      offerNew: null,
    });
  });

  it("matches any part of the name in any case, and offers the text when nothing is exactly it", () => {
    expect(searchSuppliers(SUPPLIERS, " PARK")).toEqual({
      matches: [S("Park Lane Florist"), S("ParknShop")],
      offerNew: "PARK",
    });
  });

  it("offers nothing new on an exact name, whatever its case", () => {
    expect(searchSuppliers(SUPPLIERS, "parknshop")).toEqual({
      matches: [S("ParknShop")],
      offerNew: null,
    });
  });

  it("offers the text when nothing matches (Flask's 'No Xero contact found')", () => {
    expect(searchSuppliers(SUPPLIERS, "Kee Wah")).toEqual({ matches: [], offerNew: "Kee Wah" });
  });

  it("leaves the list it was given alone", () => {
    const list = [S("b"), S("a")];
    searchSuppliers(list, "");
    expect(list.map((s) => s.name)).toEqual(["b", "a"]);
  });
});

describe("searchAccounts", () => {
  const ACCOUNTS = [
    { id: "1", code: "429", name: "General Expenses" },
    { id: "2", code: "400", name: "Advertising" },
    { id: "3", code: "461", name: "Printing & Stationery" },
  ];
  it("keeps the API's order and matches by name only", () => {
    expect(searchAccounts(ACCOUNTS, "")).toEqual(ACCOUNTS);
    expect(searchAccounts(ACCOUNTS, "IN").map((a) => a.id)).toEqual(["2", "3"]);
    expect(searchAccounts(ACCOUNTS, "429")).toEqual([]);
  });
});

describe("receiptProblem", () => {
  const file = (name: string, type: string, size = 100) => ({ name, type, size });
  it("takes one PDF, JPEG or PNG of up to 10MB", () => {
    expect(receiptProblem([file("a.pdf", "application/pdf")], "picked")).toBeNull();
    expect(receiptProblem([file("a.jpg", "image/jpeg", 10 * 1024 * 1024)], "dropped")).toBeNull();
  });
  it("refuses in Flask's words, naming a dropped file", () => {
    expect(receiptProblem([file("a.gif", "image/gif")], "picked")).toBe(
      "I can take PDF, JPEG, or PNG files.",
    );
    expect(receiptProblem([file("a.gif", "image/gif")], "dropped")).toBe(
      "I can take PDF, JPEG, or PNG files: a.gif",
    );
    expect(receiptProblem([file("big.png", "image/png", 10 * 1024 * 1024 + 1)], "picked")).toBe(
      "Files need to be under 10MB.",
    );
    expect(receiptProblem([file("big.png", "image/png", 10 * 1024 * 1024 + 1)], "dropped")).toBe(
      "Files need to be under 10MB: big.png",
    );
    expect(
      receiptProblem([file("a.png", "image/png"), file("b.png", "image/png")], "dropped"),
    ).toBe("Only one file is allowed per expense.");
  });
});

describe("uploadName and receiptKind", () => {
  it("cuts a long name to 27 characters", () => {
    expect(uploadName("receipt.pdf")).toBe("receipt.pdf");
    expect(uploadName("a".repeat(30))).toBe("a".repeat(30));
    expect(uploadName(`${"a".repeat(28)}.pdf`)).toBe(`${"a".repeat(27)}...`);
  });
  it("draws by type, else by name", () => {
    expect(receiptKind("image/png")).toBe("image");
    expect(receiptKind("application/pdf")).toBe("pdf");
    expect(receiptKind(null, "scan.PDF")).toBe("pdf");
    expect(receiptKind("application/octet-stream", "photo.jpeg")).toBe("image");
    expect(receiptKind("text/plain", "notes.txt")).toBe("other");
  });
});

describe("missingFields", () => {
  const supplier = S("Wellcome");
  const account = { id: "1", code: "429", name: "General Expenses" };
  const full: AddForm = {
    amount: "12.50",
    supplierText: "Wellcome",
    supplier,
    accountText: "General Expenses",
    account,
    file: new File(["x"], "r.png", { type: "image/png" }),
  };
  it("passes a complete form", () => {
    expect(missingFields(full)).toEqual([]);
  });
  it("refuses a zero amount, a supplier or account not chosen from the list, and no receipt", () => {
    expect(
      missingFields({
        amount: "0.00",
        supplierText: "",
        supplier: null,
        accountText: "",
        account: null,
        file: null,
      }),
    ).toEqual(["amount", "supplier", "account", "file"]);
  });
  it("refuses a choice whose text was changed after it was made", () => {
    expect(missingFields({ ...full, supplierText: "Wellcom", accountText: "General" })).toEqual([
      "supplier",
      "account",
    ]);
    expect(missingFields({ ...full, supplierText: "  Wellcome " })).toEqual([]);
  });
  it("refuses an empty file", () => {
    expect(missingFields({ ...full, file: new File([], "r.png", { type: "image/png" }) })).toEqual([
      "file",
    ]);
  });
});

describe("detailRows", () => {
  const line: ExpenseLine = {
    id: "l",
    item: "General Expenses",
    amount: 5,
    remarks: "",
    supplier: null,
    account: null,
    receipts: [],
  };
  it("writes N/A and - for what a line lacks", () => {
    expect(detailRows(line)).toEqual({
      contact: "N/A",
      description: "-",
      account: "N/A General Expenses",
    });
  });
  it("writes the account as its code then the line's item", () => {
    expect(
      detailRows({
        ...line,
        remarks: "Milk",
        supplier: S("Wellcome"),
        account: { id: "1", code: "429", name: "General Expenses" },
      }),
    ).toEqual({ contact: "Wellcome", description: "Milk", account: "429 General Expenses" });
  });
});

describe("newContactProblem", () => {
  it("says nothing up to 150 characters, then the API's sentence", () => {
    expect(newContactProblem("")).toBeNull();
    expect(newContactProblem("x".repeat(150))).toBeNull();
    expect(newContactProblem(` ${"x".repeat(150)} `)).toBeNull();
    expect(newContactProblem("x".repeat(151))).toBe(
      "Keep the supplier's name to 150 characters or fewer.",
    );
  });
});
