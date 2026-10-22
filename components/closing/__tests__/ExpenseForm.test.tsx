// The expense form's two newer jobs (components/closing/ExpenseForm.tsx): editing a saved line of
// the day's draft (`PATCH /expense-lines/<id>`), and reading a picked receipt into suggestions
// (`POST /reports/expenses/extract`). The API client is stubbed; the rules themselves are
// lib/__tests__/expenseAi.test.ts and expenseEdit.test.ts.

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import ExpenseForm, { type ExpenseFormProps } from "@/components/closing/ExpenseForm";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { resetReaderLatch, type ExtractAnswer, type Suggestions } from "@/lib/expenseAi";
import type { ExpenseLine } from "@/lib/expenses";

// Amounts read "HKD 760.00" - owner 2026-10-21: one money rule (@minty/shared/money); they were "HKD760.00".

vi.mock("@/lib/apiClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/apiClient")>()),
  pettyCashFetch: vi.fn(),
  pettyCashBlob: vi.fn(),
}));

const fetchMock = vi.mocked(pettyCashFetch);

const SUPPLIERS = [
  { id: "c1", name: "ParknShop" },
  { id: "c3", name: "Wellcome" },
];
const ACCOUNTS = [
  { id: "a1", code: "429", name: "General Expenses" },
  { id: "a2", code: "461", name: "Printing & Stationery" },
];
const LINE: ExpenseLine = {
  id: "l1",
  item: "General Expenses",
  amount: 120.5,
  remarks: "Printer paper",
  supplier: { id: "c1", name: "ParknShop" },
  account: { id: "a1", code: "429", name: "General Expenses" },
  receipts: [{ id: "r1", name: "receipt-l1.png", mime_type: "image/png" }],
};

function setup(over: Partial<ExpenseFormProps> = {}) {
  const props: ExpenseFormProps = {
    code: "HKD",
    day: "2026-10-13",
    suppliers: SUPPLIERS,
    onSuppliers: vi.fn(),
    accounts: ACCOUNTS,
    canCreateSupplier: true,
    onSaved: vi.fn(),
    onClose: vi.fn(),
    onView: vi.fn(),
    route: { push: vi.fn(), entityId: "e", entityName: "Shop", home: "/home" },
    ...over,
  };
  render(<ExpenseForm {...props} />);
  return { props, user: userEvent.setup(), dialog: screen.getByRole("dialog") };
}

/** The calls made to one path, with their init. */
const callsTo = (path: string) => fetchMock.mock.calls.filter(([p]) => p === path);
const formOf = (path: string, n = 0) => (callsTo(path)[n][1] as { form: FormData }).form;

const pdf = (name = "scan.pdf") => new File(["%PDF-1.4"], name, { type: "application/pdf" });
const chooseFile = () =>
  document.querySelector<HTMLInputElement>("input[type=file]:not([capture])") as HTMLInputElement;

/** Answers the extract route with what the test holds back until `answer` is called; other paths with `others`. */
function holdExtract(others: (path: string) => unknown = () => ({})) {
  let release: (a: ExtractAnswer) => void = () => undefined;
  fetchMock.mockImplementation(async (path: string) => {
    if (path === "/reports/expenses/extract")
      return new Promise((resolve) => (release = resolve as typeof release));
    return others(path);
  });
  return { answer: (a: ExtractAnswer) => act(async () => release(a)) };
}

const read = (value: string, band: "high" | "medium" | "low") => ({
  value,
  confidence: 0.9,
  band,
  applied: band !== "low",
});
const SUGGESTED: Suggestions = {
  amount: read("448.80", "high"),
  description: read("Courier delivery", "medium"),
  supplier: { ...read("Wellcome", "high"), contact_id: "c3" },
  account: {
    ...read("461 Printing & Stationery", "high"),
    account_id: "a2",
    code: "461",
    name: "Printing & Stationery",
  },
};

// jsdom has no layout: the sheet scrolls its refusal into view.
beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});
beforeEach(() => resetReaderLatch());
afterEach(() => fetchMock.mockReset());

describe("Edit expense", () => {
  it("opens the add form prefilled with the line, its saved receipt and Save", () => {
    const { dialog } = setup({ line: LINE });
    expect(screen.getByRole("dialog", { name: "Edit expense" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("General Expenses · HKD 120.50");
    expect(within(dialog).getByRole("textbox", { name: /Amount/ })).toHaveValue("120.50");
    expect(within(dialog).getByRole("combobox", { name: /Supplier/ })).toHaveValue("ParknShop");
    expect(within(dialog).getByRole("combobox", { name: /Account/ })).toHaveValue("a1");
    expect(within(dialog).getByRole("textbox", { name: "Description" })).toHaveValue(
      "Printer paper",
    );
    expect(
      within(dialog).getByRole("button", { name: "View receipt receipt-l1.png" }),
    ).toBeInTheDocument();
    // the last saved receipt can't be removed: no Remove is offered for it
    expect(within(dialog).queryByRole("button", { name: /Remove saved receipt/ })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("sends only what changed and hands the answer back", async () => {
    const saved = { line: { ...LINE, amount: 130, remarks: "" }, total: 168 };
    fetchMock.mockResolvedValue(saved);
    const { dialog, user, props } = setup({ line: LINE });
    const amount = within(dialog).getByRole("textbox", { name: /Amount/ });
    await user.clear(amount);
    await user.type(amount, "130");
    await user.clear(within(dialog).getByRole("textbox", { name: "Description" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(saved));
    expect(callsTo("/expense-lines/l1")).toHaveLength(1);
    expect(callsTo("/expense-lines/l1")[0][1]).toMatchObject({ method: "PATCH" });
    const body = formOf("/expense-lines/l1");
    expect([...body.keys()].sort()).toEqual(["amount", "remarks"]);
    expect(body.get("amount")).toBe("130");
    expect(body.get("remarks")).toBe("");
  });

  it("closes with nothing sent when nothing changed", async () => {
    const { dialog, user, props } = setup({ line: LINE });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(props.onClose).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("removes a saved receipt while another stays", async () => {
    fetchMock.mockResolvedValue({ line: LINE, total: 120.5 });
    const two = {
      ...LINE,
      receipts: [...LINE.receipts, { id: "r2", name: "back.png", mime_type: "image/png" }],
    };
    const { dialog, user } = setup({ line: two });
    await user.click(within(dialog).getByRole("button", { name: "Remove saved receipt back.png" }));
    expect(within(dialog).queryByRole("button", { name: "View receipt back.png" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Remove saved receipt/ })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(callsTo("/expense-lines/l1")).toHaveLength(1));
    expect(formOf("/expense-lines/l1").getAll("remove_receipt_ids")).toEqual(["r2"]);
  });

  it.each([
    [409, "This report isn't a draft anymore, so I can't change its expenses."],
    [404, "Hmm, I couldn't find that expense."],
    [403, "You do not have permission to edit reports for this entity."],
    [422, "Every expense needs its receipt. Attach a new receipt before removing the last one."],
  ])("a %i keeps the sheet open with the API's sentence", async (status, why) => {
    fetchMock.mockRejectedValue(new ApiError(status, why, { error: why }));
    const { dialog, user, props } = setup({ line: LINE });
    await user.type(within(dialog).getByRole("textbox", { name: "Description" }), " and toner");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(why);
    expect(props.onSaved).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("textbox", { name: "Description" })).toHaveValue(
      "Printer paper and toner",
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("a lost connection says so in Part 11's words", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { dialog, user } = setup({ line: LINE });
    await user.type(within(dialog).getByRole("textbox", { name: "Description" }), "!");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "We couldn't save this expense. Check your connection, then try again.",
    );
  });

  it("checks as it is typed, as the add does - an emptied amount waits for Save", async () => {
    const { dialog, user } = setup({ line: LINE });
    const amount = within(dialog).getByRole("textbox", { name: /Amount/ });
    await user.clear(amount);
    expect(amount).not.toHaveAttribute("aria-invalid");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(amount).toHaveAccessibleDescription(
      "The amount is still empty. Add the amount to continue.",
    );
    expect(amount).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("closing with a change asks first", async () => {
    const { dialog, user, props } = setup({ line: LINE });
    await user.type(within(dialog).getByRole("textbox", { name: "Description" }), "!");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(dialog).toHaveTextContent("These changes aren't saved yet");
    expect(props.onClose).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Discard them" }));
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe("the receipt reader", () => {
  it("reads a picked receipt calmly, then fills the empty fields as marked suggestions - nothing is saved until Add", async () => {
    const reader = holdExtract(() => ({ line: LINE, total: 1 }));
    const { dialog, user, props } = setup();
    await user.upload(chooseFile(), pdf());
    expect(within(dialog).getByRole("status")).toHaveTextContent("Minty is reading the receipt…");
    expect(within(dialog).queryByRole("img", { name: /Minty/ })).toBeNull();
    expect(callsTo("/reports/expenses/extract")).toHaveLength(1);
    expect((formOf("/reports/expenses/extract").get("receipt") as File).name).toBe("scan.pdf");
    // the form stays usable while it reads
    expect(within(dialog).getByRole("textbox", { name: /Amount/ })).toBeEnabled();

    await reader.answer({ suggestions: SUGGESTED, reason: null });
    expect(within(dialog).queryByText("Minty is reading the receipt…")).toBeNull();
    const amount = within(dialog).getByRole("textbox", { name: /Amount/ });
    expect(amount).toHaveValue("448.80");
    expect(amount).toHaveAccessibleDescription("Suggested from the receipt.");
    expect(within(dialog).getByRole("combobox", { name: /Supplier/ })).toHaveValue("Wellcome");
    expect(within(dialog).getByRole("combobox", { name: /Account/ })).toHaveValue("a2");
    const description = within(dialog).getByRole("textbox", { name: "Description" });
    expect(description).toHaveValue("Courier delivery");
    expect(description).toHaveAccessibleDescription(
      "Suggested from the receipt. Check it before you go on.",
    );
    expect(dialog).toHaveTextContent("Suggestions from the receipt filled 4 fields");
    expect(props.onSaved).not.toHaveBeenCalled();
    expect(callsTo("/reports/expenses/lines")).toHaveLength(0);

    // a field the person changes is theirs; Clear empties another
    await user.clear(amount);
    await user.type(amount, "448.81");
    expect(amount).not.toHaveAccessibleDescription(/Suggested/);
    await user.click(
      within(dialog).getByRole("button", { name: "Clear the suggested description" }),
    );
    expect(description).toHaveValue("");
    expect(description).toHaveFocus();

    await user.click(within(dialog).getByRole("button", { name: "Add expense" }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
    const body = formOf("/reports/expenses/lines");
    expect(Object.fromEntries([...body.entries()].filter(([k]) => k !== "receipt"))).toEqual({
      transaction_date: "2026-10-13",
      amount: "448.81",
      remarks: "",
      supplier_id: "c3",
      account_id: "a2",
    });
  });

  it("never overwrites what was typed first: it offers the receipt's reading instead", async () => {
    const reader = holdExtract();
    const { dialog, user } = setup();
    const amount = within(dialog).getByRole("textbox", { name: /Amount/ });
    await user.upload(chooseFile(), pdf());
    await user.type(amount, "44.80");
    await reader.answer({ suggestions: { amount: read("448.80", "high") }, reason: null });
    expect(amount).toHaveValue("44.80");
    expect(dialog).toHaveTextContent("The receipt reads HKD 448.80, not HKD 44.80.");
    await user.click(
      within(dialog).getByRole("button", { name: "Use the amount from the receipt" }),
    );
    expect(amount).toHaveValue("448.80");
    expect(amount).toHaveAccessibleDescription("Suggested from the receipt.");
  });

  it("leaves a low-band reading out of the field, as a hint", async () => {
    const reader = holdExtract();
    const { dialog } = setup();
    await userEvent.upload(chooseFile(), pdf());
    await reader.answer({ suggestions: { amount: read("12.00", "low") }, reason: null });
    expect(within(dialog).getByRole("textbox", { name: /Amount/ })).toHaveValue("");
    expect(dialog).toHaveTextContent("The receipt might read HKD 12.00.");
  });

  it("offers a supplier name that is not on the list for New supplier - never creating it", async () => {
    const reader = holdExtract();
    const { dialog, user } = setup();
    await user.upload(chooseFile(), pdf());
    await reader.answer({
      suggestions: {
        supplier: {
          value: "",
          confidence: 0,
          band: "low",
          applied: false,
          contact_id: "",
          detected_name: "Kwok Transport",
        },
      },
      reason: null,
    });
    expect(dialog).toHaveTextContent(
      'The receipt says "Kwok Transport", which is not in your supplier list.',
    );
    await user.click(
      within(dialog).getByRole("button", { name: 'Add "Kwok Transport" as a new supplier' }),
    );
    const panel = within(dialog).getByRole("group", { name: "New supplier" });
    expect(within(panel).getByRole("textbox", { name: /Supplier's name/ })).toHaveValue(
      "Kwok Transport",
    );
    expect(callsTo("/suppliers")).toHaveLength(0);
  });

  it("gets quietly out of the way when it is switched off - and is not asked again this session", async () => {
    fetchMock.mockResolvedValue({ suggestions: null, reason: "disabled" });
    const { dialog, user } = setup();
    await user.upload(chooseFile(), pdf());
    await waitFor(() =>
      expect(within(dialog).queryByText("Minty is reading the receipt…")).toBeNull(),
    );
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(within(dialog).getByRole("textbox", { name: /Amount/ })).toHaveValue("");
    await user.click(within(dialog).getByRole("button", { name: /^Remove scan.pdf/ }));
    await user.upload(chooseFile(), pdf("other.pdf"));
    expect(within(dialog).queryByText("Minty is reading the receipt…")).toBeNull();
    expect(callsTo("/reports/expenses/extract")).toHaveLength(1);
  });

  it.each([
    [
      "a refusal",
      () =>
        Promise.reject(
          new ApiError(403, "You do not have permission to edit reports for this entity."),
        ),
    ],
    ["a lost connection", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["a failed reading", () => Promise.resolve({ suggestions: null, reason: "timeout" })],
  ])("says nothing about %s, and asks again next time", async (_, outcome) => {
    fetchMock.mockImplementation(outcome as () => Promise<never>);
    const { dialog, user } = setup();
    await user.upload(chooseFile(), pdf());
    await waitFor(() =>
      expect(within(dialog).queryByText("Minty is reading the receipt…")).toBeNull(),
    );
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(within(dialog).queryAllByRole("status")).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: /^Remove scan.pdf/ }));
    await user.upload(chooseFile(), pdf("other.pdf"));
    await waitFor(() => expect(callsTo("/reports/expenses/extract")).toHaveLength(2));
  });

  it("drops an answer for a receipt that was removed meanwhile", async () => {
    const reader = holdExtract();
    const { dialog, user } = setup();
    await user.upload(chooseFile(), pdf());
    await user.click(within(dialog).getByRole("button", { name: /^Remove scan.pdf/ }));
    expect(within(dialog).queryByText("Minty is reading the receipt…")).toBeNull();
    await reader.answer({ suggestions: SUGGESTED, reason: null });
    expect(within(dialog).getByRole("textbox", { name: /Amount/ })).toHaveValue("");
  });

  it("reads a replacement receipt in Edit too, where every field is filled - so it only offers", async () => {
    const reader = holdExtract();
    const { dialog, user } = setup({ line: LINE });
    await user.upload(chooseFile(), pdf());
    await reader.answer({ suggestions: { amount: read("448.80", "high") }, reason: null });
    expect(within(dialog).getByRole("textbox", { name: /Amount/ })).toHaveValue("120.50");
    expect(dialog).toHaveTextContent("The receipt reads HKD 448.80, not HKD 120.50.");
  });
});
