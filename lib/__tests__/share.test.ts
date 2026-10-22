// The public share link (lib/share.ts): the link the Share dialog shows, the address it reads,
// and what a shared Daily Report's answer - trimmed or refused - becomes on the page.

import { afterEach, describe, expect, it, vi } from "vitest";

import { env } from "@/lib/env";
import {
  isSharePage,
  readSharedReport,
  sharedAudit,
  sharedCash,
  sharedExpenses,
  sharedKpis,
  sharedReportUrl,
  sharedSales,
  shareLinkUrl,
  sharePathFromSegments,
  type SharedReport,
} from "@/lib/share";

// Amounts read "HKD 760.00" - owner 2026-10-21: one money rule (@minty/shared/money); they were "HKD760.00".

const SECRET = "AbCdEfGhIjKlMnOpQrStUvWxYz012-_9";
const PATH = `OV/13_Oct_2026/${SECRET}`;
// On the device's clock, as the Daily Report's audit facts are (lib/__tests__/report.test.ts).
const SUBMITTED = new Date(2026, 9, 13, 18, 12).toISOString();
const EXPIRES = new Date(2026, 10, 12, 18, 12).toISOString();

function full(over: Partial<SharedReport> = {}): SharedReport {
  return {
    company_name: "Olive & Vine",
    transaction_date: "2026-10-13",
    currency_code: "HKD",
    status_label: "Submitted",
    status_tone: "info",
    kpis: { total_sales: 1070.5, total_expenses: 240.5, cash_position: 760 },
    sales: {
      methods: [
        { sale_id: "s1", name: "Octopus", value_name: "octopus_sales", type: "electronic", amount: 200 },
        { sale_id: "s2", name: "Deliveroo", value_name: "deliveroo_sales", type: "delivery", amount: 0 },
      ],
      cash: 820.5,
      total: 1070.5,
    },
    expenses: {
      lines: [
        { item: "General Expenses", supplier: "ParknShop", remarks: "Bags", amount: 120.5, receipts: [{ name: "parknshop.png" }] },
        { item: "", supplier: null, remarks: "", amount: 120, receipts: [] },
      ],
      total: 240.5,
    },
    cash: {
      opening_balance: 500,
      cash_addition: 100,
      cash_addition_type: "company",
      cash_sales: 820.5,
      expenses: 240.5,
      bank_deposit: 300,
      expected: 780,
      counted: 760,
      safe_box: 0,
      difference: { amount: -20, kind: "short", reason: "Change given twice" },
    },
    closing_balance: 760,
    submitted_at: SUBMITTED,
    submitted_by: "Olive Tan",
    expires_at: EXPIRES,
    ...over,
  };
}

describe("the Share dialog's link", () => {
  it("is this app's /share page for the API's path, on this origin", () => {
    expect(shareLinkUrl("https://pettycash.dailyminty.com", PATH)).toBe(`https://pettycash.dailyminty.com/share/${PATH}`);
    expect(shareLinkUrl("http://localhost:3010", `/${PATH}/`)).toBe(`http://localhost:3010/share/${PATH}`);
  });

  it("refuses a path that is not three parts, rather than show a broken link", () => {
    expect(shareLinkUrl("http://localhost:3010", "")).toBeNull();
    expect(shareLinkUrl("http://localhost:3010", "OV/13_Oct_2026")).toBeNull();
    expect(shareLinkUrl("http://localhost:3010", `OV/13_Oct_2026/${SECRET}/x`)).toBeNull();
    expect(shareLinkUrl("http://localhost:3010", `OV/../${SECRET}`)).toBeNull();
    expect(shareLinkUrl("http://localhost:3010", undefined)).toBeNull();
  });
});

describe("the page's address", () => {
  it("is exactly initials / day / secret, each url-safe", () => {
    expect(sharePathFromSegments(["OV", "13_Oct_2026", SECRET])).toBe(PATH);
    expect(sharePathFromSegments(["Report", "13_Oct_2026", SECRET])).toBe(`Report/13_Oct_2026/${SECRET}`);
  });

  it("finds no link in anything else, so nothing odd is sent", () => {
    expect(sharePathFromSegments(undefined)).toBeNull();
    expect(sharePathFromSegments(["OV", "13_Oct_2026"])).toBeNull();
    expect(sharePathFromSegments(["OV", "13_Oct_2026", SECRET, "x"])).toBeNull();
    expect(sharePathFromSegments(["OV", "", SECRET])).toBeNull();
    expect(sharePathFromSegments(["OV", "13 Oct", SECRET])).toBeNull();
    expect(sharePathFromSegments(["OV", "..", SECRET])).toBeNull();
    expect(sharePathFromSegments(["OV", "13_Oct_2026", "a%2Fb"])).toBeNull();
  });

  it("reads the Petty Cash API's public route", () => {
    expect(sharedReportUrl(PATH)).toBe(`${env.PETTY_CASH_API_URL}/api/petty-cash/v1/public/share/${PATH}`);
  });
});

describe("reading a shared report", () => {
  afterEach(() => vi.unstubAllGlobals());

  const answer = (status: number, body: unknown) =>
    vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

  it("sends no Authorization, no cookies and no referrer", async () => {
    document.cookie = "petty_cash_token=a.b.c; path=/";
    const fetcher = answer(200, full());
    await readSharedReport(PATH, fetcher);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(sharedReportUrl(PATH));
    const headers = new Headers(init?.headers);
    expect(headers.has("Authorization")).toBe(false);
    expect(init?.credentials).toBe("omit");
    expect(init?.referrerPolicy).toBe("no-referrer");
    expect(init?.cache).toBe("no-store");
  });

  it("hands the answer over as it stands", async () => {
    expect(await readSharedReport(PATH, answer(200, full()))).toEqual({ kind: "ready", report: full() });
  });

  it("knows a link that doesn't work (404) from one that expired (410)", async () => {
    expect(await readSharedReport(PATH, answer(404, { error: "Not found" }))).toEqual({ kind: "missing" });
    expect(await readSharedReport(PATH, answer(410, { error: "Expired" }))).toEqual({ kind: "expired" });
  });

  it("says loudly when anything else comes back - but never the link's secret", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await readSharedReport(PATH, answer(500, { error: "boom" }))).toEqual({ kind: "failed" });
    expect(await readSharedReport(PATH, vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch")))).toEqual({ kind: "failed" });
    expect(await readSharedReport(PATH, vi.fn<typeof fetch>().mockResolvedValue(new Response("<html>", { status: 200 })))).toEqual({ kind: "failed" });
    expect(logged).toHaveBeenCalledTimes(3);
    for (const call of logged.mock.calls) expect(call.map(String).join(" ")).not.toContain(SECRET);
  });
});

describe("a shared report on the page", () => {
  it("shows the three KPIs with the expense count", () => {
    expect(sharedKpis(full())).toEqual([
      { label: "Total sales", value: "HKD\u00a01,070.50", meta: null },
      { label: "Total expenses", value: "HKD\u00a0240.50", meta: "2 expenses" },
      { label: "Cash position", value: "HKD\u00a0760.00", meta: "Counted, with the safe box" },
    ]);
  });

  it("shows only the KPIs that arrived, and no count without the lines", () => {
    expect(sharedKpis(full({ kpis: { total_expenses: 10 }, expenses: undefined }))).toEqual([{ label: "Total expenses", value: "HKD\u00a010.00", meta: null }]);
    expect(sharedKpis(full({ kpis: undefined }))).toEqual([]);
  });

  it("lists the sales by method as the Daily Report does, Deliveroo left out", () => {
    expect(sharedSales(full())).toEqual([
      { key: "octopus_sales", label: "Octopus", value: "HKD\u00a0200.00" },
      { key: "cash", label: "Cash", value: "HKD\u00a0820.50" },
      { key: "total", label: "Total sales", value: "HKD\u00a01,070.50", total: true },
    ]);
    expect(sharedSales(full({ sales: { total: 5 } }))).toEqual([{ key: "total", label: "Total sales", value: "HKD\u00a05.00", total: true }]);
    expect(sharedSales(full({ sales: undefined }))).toBeNull();
  });

  it("names each expense by its description and supplier, receipts by name only", () => {
    const expenses = sharedExpenses(full());
    expect(expenses?.lines).toEqual([
      { title: "General Expenses", meta: "ParknShop", remarks: "Bags", value: "HKD\u00a0120.50" },
      { title: "Expense", meta: "No supplier", remarks: null, value: "HKD\u00a0120.00" },
    ]);
    expect(expenses?.total).toBe("HKD\u00a0240.50");
    expect(expenses?.receipts).toEqual([{ name: "parknshop.png", title: "General Expenses", value: "HKD\u00a0120.50" }]);
    // a supplier sent as an object reads the same
    expect(sharedExpenses(full({ expenses: { lines: [{ item: "Ice", supplier: { name: "7-Eleven" }, amount: 5 }] } }))?.lines[0].meta).toBe("7-Eleven");
  });

  it("leaves out Receipts when no line carried them, and Expenses when none arrived", () => {
    const trimmed = sharedExpenses(full({ expenses: { lines: [{ item: "Ice", amount: 5 }], total: 5 } }));
    expect(trimmed?.receipts).toBeNull();
    expect(sharedExpenses(full({ expenses: undefined }))).toBeNull();
  });

  it("runs the cash as the Daily Report does, only the figures that arrived", () => {
    expect(sharedCash(full())?.map((r) => r.label)).toEqual([
      "Starting cash balance",
      "Added to the drawer",
      "Where the cash came from",
      "Cash sales",
      "Expenses",
      "Cash taken for bank deposit",
      "Expected in drawer",
      "Counted in the drawer",
      "In the safe box",
      "Difference",
    ]);
    expect(sharedCash(full({ cash: { counted: 7 } }))).toEqual([{ label: "Counted in the drawer", value: "HKD\u00a07.00" }]);
    expect(sharedCash(full({ cash: undefined }))).toBeNull();
  });

  it("says who submitted it and when, and until when the link works", () => {
    expect(sharedAudit(full())).toEqual(["Submitted by Olive Tan · Tue 13 Oct 2026, 6:12 pm", "This link works until Thu 12 Nov 2026, 6:12 pm"]);
    expect(sharedAudit(full({ submitted_at: undefined, submitted_by: undefined, expires_at: undefined }))).toEqual([]);
    expect(sharedAudit(full({ submitted_at: undefined, expires_at: "nonsense" }))).toEqual(["Submitted by Olive Tan"]);
  });
});

describe("the share page's address", () => {
  it("is exactly the /share/ prefix", () => {
    expect(isSharePage(`/share/${PATH}`)).toBe(true);
    for (const path of ["/share", "/shared/x", "/sharex/a/b/c", "/entity/360812e1/x/petty-cash", "/landing"]) expect(isSharePage(path), path).toBe(false);
  });
});
