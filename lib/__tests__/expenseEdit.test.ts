import { describe, expect, it } from "vitest";

import {
  accountsFor,
  canRemoveReceipt,
  draftLineChanges,
  draftLineForm,
  keptReceipts,
  withLine,
} from "@/lib/expenseEdit";
import type { ExpenseLine } from "@/lib/expenses";

const LINE: ExpenseLine = {
  id: "l1",
  item: "General Expenses",
  amount: 120.5,
  remarks: "Printer paper",
  supplier: { id: "c1", name: "ParknShop" },
  account: { id: "a1", code: "429", name: "General Expenses" },
  receipts: [
    { id: "r1", name: "front.png", mime_type: "image/png" },
    { id: "r2", name: "back.png", mime_type: "image/png" },
  ],
};

const same = {
  amount: "120.50",
  remarks: "Printer paper",
  supplier: LINE.supplier,
  accountId: "a1",
  receipt: null,
  removeReceiptIds: [] as string[],
};

describe("what an edit sends", () => {
  it("nothing when nothing changed - grouping and spaces are no change", () => {
    expect(draftLineChanges(LINE, same)).toEqual({});
    expect(
      draftLineChanges(LINE, { ...same, amount: "120.5", remarks: " Printer paper " }),
    ).toEqual({});
  });

  it("each changed field alone", () => {
    expect(draftLineChanges(LINE, { ...same, amount: "1,200.00" })).toEqual({ amount: "1200" });
    expect(draftLineChanges(LINE, { ...same, remarks: "" })).toEqual({ remarks: "" });
    expect(draftLineChanges(LINE, { ...same, supplier: { id: "c3", name: "Wellcome" } })).toEqual({
      supplier_id: "c3",
    });
    expect(draftLineChanges(LINE, { ...same, accountId: "a2" })).toEqual({ account_id: "a2" });
  });

  it("a removal travels without a new receipt; a new receipt replaces them all, so then it alone", () => {
    expect(draftLineChanges(LINE, { ...same, removeReceiptIds: ["r2"] })).toEqual({
      remove_receipt_ids: ["r2"],
    });
    const file = new File(["x"], "new.png", { type: "image/png" });
    expect(draftLineChanges(LINE, { ...same, receipt: file, removeReceiptIds: ["r2"] })).toEqual({
      receipt: file,
    });
    // an id not on the line is never sent
    expect(draftLineChanges(LINE, { ...same, removeReceiptIds: ["zz"] })).toEqual({});
  });

  it("as multipart: the changes alone, the removals repeated", () => {
    const body = draftLineForm({ amount: "130", remarks: "", remove_receipt_ids: ["r1", "r2"] });
    expect(body.get("amount")).toBe("130");
    expect(body.get("remarks")).toBe("");
    expect(body.getAll("remove_receipt_ids")).toEqual(["r1", "r2"]);
    expect(body.has("supplier_id")).toBe(false);
    expect(body.has("receipt")).toBe(false);
    const file = new File(["x"], "new.png", { type: "image/png" });
    expect((draftLineForm({ receipt: file }).get("receipt") as File).name).toBe("new.png");
  });
});

describe("the saved receipts", () => {
  it("Remove only while another stays and no new receipt replaces them all", () => {
    expect(canRemoveReceipt(keptReceipts(LINE, []), false)).toBe(true);
    expect(canRemoveReceipt(keptReceipts(LINE, ["r2"]), false)).toBe(false);
    expect(canRemoveReceipt(keptReceipts(LINE, []), true)).toBe(false);
    expect(keptReceipts(LINE, ["r1"]).map((r) => r.id)).toEqual(["r2"]);
  });
});

describe("the list", () => {
  it("keeps the line's own account choosable when it is no longer switched on", () => {
    const on = [{ id: "a2", code: "461", name: "Printing & Stationery" }];
    expect(accountsFor(LINE, on).map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(accountsFor(null, on)).toBe(on);
    expect(accountsFor({ ...LINE, account: on[0] }, on)).toBe(on);
  });

  it("replaces a saved line in place", () => {
    const other = { ...LINE, id: "l2" };
    const saved = { ...LINE, amount: 130 };
    expect(withLine([LINE, other], saved)).toEqual([saved, other]);
  });
});
