// Cash Count as Flask's Daily Closing Phase 1 (Minty 4e004d2): three tasks one at a time, the
// count in its own sheet, the Check only once counted, and Save & Next held for the count and
// then for a difference's reason.

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Amounts read "HKD 760.00" - owner 2026-10-21: one money rule (@minty/shared/money); they were "HKD760.00".

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }), usePathname: () => "/" }));

const fetchMock = vi.fn();
vi.mock("@/lib/apiClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/apiClient")>()),
  pettyCashFetch: (...args: unknown[]) => fetchMock(...args),
}));

import { CashCountForm } from "@/components/closing/CashCount";
import type { CashCountPage } from "@/lib/cashCount";

const page = (over: Partial<CashCountPage> = {}): CashCountPage => ({
  transaction_date: "2026-10-13",
  currency_code: "HKD",
  draft: { id: "d", status: "draft", current_section: "deposit", completed_sections: ["opening", "sales", "expenses"], xero_integrated: false, publishing_status: null },
  opening_balance: 500,
  cash_addition: 100,
  cash_sales: 520,
  expenses: 120,
  bank_deposit: 0,
  cash_on_hand: 1000,
  expected_cash: 1000,
  denominations: [
    { id: "n500", value: 500, kind: "note", count: 0 },
    { id: "n100", value: 100, kind: "note", count: 0 },
    { id: "c5", value: 5, kind: "coin", count: 0 },
  ],
  safe_box_balance: 0,
  discrepancy: { amount: 0, kind: "none", reason: "" },
  ...over,
});

function renderStage(p: CashCountPage = page()) {
  return render(<CashCountForm page={p} entityId="e1" entityName="Olive" home="/entity/e1/olive/petty-cash" notice={null} />);
}

const saveNext = () => screen.getByRole("button", { name: /Save & Next/ });
const task = (name: string) => screen.getByRole("region", { name });

beforeEach(() => {
  push.mockReset();
  fetchMock.mockReset();
});

describe("Cash Count, one task at a time", () => {
  it("opens on the cash taken to the bank, with the count and the safe box waiting", () => {
    renderStage();
    expect(task("Cash taken to the bank")).toHaveAttribute("data-state", "current");
    expect(task("Cash taken to the bank")).toHaveAttribute("aria-current", "step");
    expect(task("Count the drawer")).toHaveAttribute("data-state", "next");
    expect(within(task("Count the drawer")).getByText("Next, after the bank deposit.")).toBeInTheDocument();
    expect(within(task("Safe box")).getByText("Next, after the count.")).toBeInTheDocument();
    expect(screen.getByText("In the drawer before any deposit")).toBeInTheDocument();
    expect(screen.getByLabelText(/Deposit amount/)).toHaveAttribute("inputmode", "decimal");
    // no count yet: no Check, and Save & Next waits for it
    expect(screen.queryByRole("region", { name: "Check" })).toBeNull();
    expect(saveNext()).toBeDisabled();
    expect(screen.getByText("Count the drawer to continue")).toBeInTheDocument();
    expect(screen.getByText("Three quick checks. We'll go one at a time.")).toBeInTheDocument();
  });

  it("moves on with Continue, shows the deposit's result, and Change reopens it", async () => {
    const user = userEvent.setup();
    renderStage();
    await user.type(screen.getByLabelText(/Deposit amount/), "300");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(task("Cash taken to the bank")).toHaveAttribute("data-state", "done");
    expect(within(task("Cash taken to the bank")).getByText("HKD 300.00").closest("p")).toHaveTextContent("HKD 300.00 to the bank");
    expect(task("Count the drawer")).toHaveAttribute("data-state", "current");
    expect(screen.getByRole("button", { name: "Count notes and coins" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Change the cash taken to the bank" }));
    expect(task("Cash taken to the bank")).toHaveAttribute("data-state", "current");
    expect(screen.getByLabelText(/Deposit amount/)).toHaveFocus();
  });

  it("finishes the deposit as none today when it is left empty", async () => {
    const user = userEvent.setup();
    renderStage();
    screen.getByLabelText(/Deposit amount/).focus();
    await user.tab(); // to Continue - still inside the card
    expect(task("Cash taken to the bank")).toHaveAttribute("data-state", "current");
    act(() => (document.activeElement as HTMLElement).blur());
    expect(within(task("Cash taken to the bank")).getByText("None today")).toBeInTheDocument();
  });

  it("will not finish a deposit above the cash in the drawer", async () => {
    const user = userEvent.setup();
    renderStage();
    await user.type(screen.getByLabelText(/Deposit amount/), "2000");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(task("Cash taken to the bank")).toHaveAttribute("data-state", "current");
    expect(screen.getByText(/The deposit can't be more than the cash on hand/)).toBeInTheDocument();
  });
});

describe("the Count the drawer sheet", () => {
  async function openSheet(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Count notes and coins" }));
    return screen.getByRole("dialog", { name: /Count the drawer/ });
  }

  it("names each row by the catalogue's cash_name without its symbol, or by its value when it has none", async () => {
    const user = userEvent.setup();
    renderStage(page({ denominations: [
      { id: "n500", value: 500, kind: "note", name: "$500", count: 0 },
      { id: "n1000", value: 1000, kind: "note", name: "HK$1,000", count: 0 },
      { id: "c050", value: 0.5, kind: "coin", name: "50c", count: 0 },
      { id: "c010", value: 0.1, kind: "coin", name: null, count: 0 },
    ] }));
    const sheet = await openSheet(user);
    expect(within(sheet).getByLabelText(/Number of HKD 500 notes/)).toBeInTheDocument();
    expect(within(sheet).getByLabelText(/Number of HKD 1,000 notes/)).toBeInTheDocument();
    expect(within(sheet).getByLabelText(/Number of HKD 50c coins/)).toBeInTheDocument();
    expect(within(sheet).getByLabelText(/Number of HKD 0\.10 coins/)).toBeInTheDocument();
    expect(within(sheet).queryByText(/\$/)).toBeNull();
  });

  it("counts notes then coins with line totals and a live total, and Save count closes it", async () => {
    const user = userEvent.setup();
    renderStage();
    const sheet = await openSheet(user);
    expect(within(sheet).getByText("Notes")).toBeInTheDocument();
    expect(within(sheet).getByText("Coins")).toBeInTheDocument();
    const five = within(sheet).getByLabelText(/Number of HKD 500 notes/);
    expect(five).toHaveFocus();
    expect(five).toHaveAttribute("inputmode", "numeric");
    expect(within(sheet).getAllByText("—")).toHaveLength(3);
    await user.type(five, "1");
    await user.type(within(sheet).getByLabelText(/Number of HKD 100 notes/), "5");
    expect(within(sheet).getByText("Total in the drawer").nextSibling).toHaveTextContent("HKD 1,000.00");
    await user.click(within(sheet).getByRole("button", { name: "Save count" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(task("Count the drawer")).toHaveAttribute("data-state", "done");
    expect(within(task("Count the drawer")).getByText("HKD 1,000.00")).toBeInTheDocument();
    // the safe box is next and takes the focus; the Check says the numbers match
    expect(screen.getByLabelText(/Cash in the safe box/)).toHaveFocus();
    expect(screen.getByText("The numbers match")).toBeInTheDocument();
    expect(saveNext()).toBeEnabled();
  });

  it("saves the count with Enter in a row, never the page", async () => {
    const user = userEvent.setup();
    renderStage();
    const sheet = await openSheet(user);
    await user.type(within(sheet).getByLabelText(/Number of HKD 500 notes/), "2{Enter}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(task("Count the drawer")).toHaveAttribute("data-state", "done");
  });

  it("keeps what was typed when closed without saving, but the count is not done", async () => {
    const user = userEvent.setup();
    renderStage();
    const sheet = await openSheet(user);
    await user.type(within(sheet).getByLabelText(/Number of HKD 500 notes/), "2");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(task("Count the drawer")).toHaveAttribute("data-state", "current");
    await user.click(screen.getByRole("button", { name: "Count notes and coins" }));
    expect(screen.getByLabelText(/Number of HKD 500 notes/)).toHaveValue("2");
  });

  it("stays open on a count above the limit", async () => {
    const user = userEvent.setup();
    renderStage();
    const sheet = await openSheet(user);
    const coins = within(sheet).getByLabelText(/Number of HKD 5 coins/);
    await user.type(coins, "2000000");
    expect(within(sheet).getByRole("alert")).toHaveTextContent("Enter 1,000,000 or fewer.");
    await user.click(within(sheet).getByRole("button", { name: "Save count" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(coins).toHaveFocus();
  });
});

describe("problems on a refused save", () => {
  it("two problems show the summary, and a count's problem opens the sheet on its row", async () => {
    const user = userEvent.setup();
    renderStage();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Count notes and coins" }));
    await user.type(screen.getByLabelText(/Number of HKD 5 coins/), "2000000");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Change the cash taken to the bank" }));
    await user.type(screen.getByLabelText(/Deposit amount/), "2000");
    await user.click(screen.getByRole("button", { name: /Save & Exit/ }));
    const summary = screen.getAllByRole("alert").find((a) => a.textContent?.includes("details need a look")) as HTMLElement;
    expect(summary).toHaveTextContent("2 details need a look");
    expect(within(summary).getAllByRole("link")).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
    // the count's problem opens the sheet on its row
    expect(screen.getByRole("dialog", { name: /Count the drawer/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Number of HKD 5 coins/)).toHaveFocus();
  });
});

describe("the Check and the reason", () => {
  it("opens with every task done once the stage was saved, and holds Save & Next for a difference's reason", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ next: "ending", transaction_date: "2026-10-13" });
    renderStage(page({ denominations: [{ id: "n500", value: 500, kind: "note", count: 1 }, { id: "n100", value: 100, kind: "note", count: 4 }, { id: "c5", value: 5, kind: "coin", count: 0 }] }));
    expect(screen.getByText("All three checks are done.")).toBeInTheDocument();
    for (const name of ["Cash taken to the bank", "Count the drawer", "Safe box"]) expect(task(name)).toHaveAttribute("data-state", "done");
    // 900 counted against 1,000 expected
    expect(screen.queryByText("The numbers match")).toBeNull();
    expect(screen.getByText("The count is HKD 100.00 short.")).toBeInTheDocument();
    expect(saveNext()).toBeDisabled();
    expect(screen.getByText("Add a reason for the difference to continue.")).toBeInTheDocument();
    const reason = screen.getByLabelText(/Reason for the difference/);
    expect(reason).toHaveAttribute("aria-required", "true");
    await user.type(reason, "Float swap");
    expect(saveNext()).toBeEnabled();
    await user.click(saveNext());
    expect(fetchMock).toHaveBeenCalledWith("/reports/cash-count", expect.objectContaining({ method: "PUT" }));
    const body = fetchMock.mock.calls[0][1].body;
    expect(body).toMatchObject({ bank_deposit: 0, counts: { n500: 1, n100: 4, c5: 0 }, discrepancy_reason: "Float swap", action: "next" });
  });

  it("counts any cent as a difference", () => {
    renderStage(page({ cash_on_hand: 900.01, denominations: [{ id: "n500", value: 500, kind: "note", count: 1 }, { id: "n100", value: 100, kind: "note", count: 4 }] }));
    expect(screen.getByText("The count is HKD 0.01 short.")).toBeInTheDocument();
  });

  it("lets Save & Exit save before the count is done", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ next: "dashboard", transaction_date: "2026-10-13" });
    renderStage();
    fireEvent.click(screen.getByRole("button", { name: /Save & Exit/ }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/entity/e1/olive/petty-cash"));
    expect(fetchMock.mock.calls[0][1].body).toMatchObject({ action: "exit" });
    void user;
  });
});
