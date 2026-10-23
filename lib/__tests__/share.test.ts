// A shared Daily Report (../share.ts): the link the Share modal builds from the API's `path`, the
// public page's reading of its address, the refusals' sentences, and what the public read answers.

import { describe, expect, it } from "vitest";

import {
  SHARE_REFUSED,
  decodeSegments,
  isSharePage,
  parseSharedReport,
  sharePathParts,
  sharedBadge,
  shareRefusal,
  shareUrl,
  sharedReportApiPath,
} from "@/lib/share";

const SECRET = "Ab3_-xYz0123456789abcdefghijklmn"; // 32 url-safe characters, as Flask's token_urlsafe(24)
const PATH = `OV/13_Oct_2026/${SECRET}`;

describe("sharePathParts", () => {
  it("reads <initials>/<date>/<secret>", () => {
    expect(sharePathParts(PATH)).toEqual(["OV", "13_Oct_2026", SECRET]);
    expect(sharePathParts(["OV", "13_Oct_2026", SECRET])).toEqual(["OV", "13_Oct_2026", SECRET]);
  });

  it("forgives the slashes around it (Flask's links ended in one)", () => {
    expect(sharePathParts(`/${PATH}/`)).toEqual(["OV", "13_Oct_2026", SECRET]);
  });

  it.each([
    ["no secret (the old, guessable two-part form)", "OV/13_Oct_2026"],
    ["a short secret", "OV/13_Oct_2026/abc"],
    [
      "a secret with a character outside the url-safe set",
      `OV/13_Oct_2026/${SECRET.slice(0, 31)}.`,
    ],
    ["four parts", `OV/13_Oct_2026/${SECRET}/x`],
    ["an empty part", `OV//${SECRET}`],
    ["a dot segment", `../13_Oct_2026/${SECRET}`],
    ["nothing", ""],
  ])("refuses %s", (_why, path) => {
    expect(sharePathParts(path)).toBeNull();
  });

  it("refuses anything but a string or a list of strings", () => {
    expect(sharePathParts(undefined)).toBeNull();
    expect(sharePathParts(null)).toBeNull();
    expect(sharePathParts(42)).toBeNull();
  });
});

describe("decodeSegments - the page's catch-all, as Next hands it over (still escaped)", () => {
  it("unescapes each part once", () => {
    expect(decodeSegments(["%C3%89%26V", "13_Oct_2026", SECRET])).toEqual([
      "É&V",
      "13_Oct_2026",
      SECRET,
    ]);
  });

  it("gives nothing for a part that is not valid escaping - the page refuses it", () => {
    expect(decodeSegments(["%E0%A4%A", "13_Oct_2026", SECRET])).toBeNull();
  });
});

describe("shareUrl - what the Share modal shows", () => {
  it("is this app's own /share page on the page's origin, from the API's path", () => {
    expect(shareUrl("http://localhost:3010", PATH)).toBe(`http://localhost:3010/share/${PATH}`);
    expect(shareUrl("https://pr-x-pettycash.dailyminty.com", PATH)).toBe(
      `https://pr-x-pettycash.dailyminty.com/share/${PATH}`,
    );
  });

  it("escapes a part that would not survive in an address", () => {
    expect(shareUrl("http://localhost:3010", `É&V/13_Oct_2026/${SECRET}`)).toBe(
      `http://localhost:3010/share/%C3%89%26V/13_Oct_2026/${SECRET}`,
    );
  });

  it("builds nothing from a malformed path - never a link that cannot work", () => {
    expect(shareUrl("http://localhost:3010", "OV/13_Oct_2026")).toBeNull();
    expect(shareUrl("http://localhost:3010", undefined)).toBeNull();
  });
});

describe("sharedReportApiPath", () => {
  it("is the API's public route, each part escaped", () => {
    expect(sharedReportApiPath(["OV", "13_Oct_2026", SECRET])).toBe(
      `/api/petty-cash/v1/public/share/OV/13_Oct_2026/${SECRET}`,
    );
    expect(sharedReportApiPath(["É&V", "13_Oct_2026", SECRET])).toBe(
      `/api/petty-cash/v1/public/share/%C3%89%26V/13_Oct_2026/${SECRET}`,
    );
  });
});

describe("shareRefusal - Flask's sentences, never the API's text or the address", () => {
  it("404 (and a malformed 400): the link doesn't work anymore", () => {
    expect(shareRefusal(404)).toBe(
      "This link doesn't work anymore. Could you ask for a fresh one?",
    );
    expect(shareRefusal(400)).toBe(SHARE_REFUSED.gone);
  });

  it("410: the link has expired", () => {
    expect(shareRefusal(410)).toBe("This link has expired. Could you ask for a fresh one?");
  });

  it("anything else: the house sentence; no answer at all: the connection", () => {
    expect(shareRefusal(500)).toBe("Something went wrong on our side. Please try again.");
    expect(shareRefusal(null)).toBe(
      "We couldn't reach Petty Cash. Check your connection, then reload the page.",
    );
  });
});

/** The public read in full (the contract), one line with a receipt. */
function full(): Record<string, unknown> {
  return {
    company_name: "Olive & Vine",
    transaction_date: "2026-10-13",
    currency_code: "HKD",
    status_label: "Submitted",
    status_tone: "info",
    kpis: { total_sales: 1234.5, total_expenses: 128.5, cash_position: 1160.5 },
    sales: {
      methods: [
        { name: "Visa", value_name: "visa_sales", type: "electronic", amount: 400 },
        { name: "Cash", value_name: "cash_sales", type: "other", amount: 600 },
        { name: "Keeta", value_name: "keeta_sales", type: "delivery", amount: 234.5 },
      ],
      cash: 600,
      total: 1234.5,
      yesterday_total: 1000,
      history: [{ date: "2026-10-13", total: 1234.5 }],
    },
    expenses: {
      lines: [
        {
          item: "Food & Drink",
          supplier: "Acme",
          remarks: "",
          amount: 78.5,
          receipts: [{ name: "r.pdf" }],
        },
      ],
      total: 78.5,
    },
    cash: {
      opening_balance: 1000,
      cash_addition: 0,
      cash_addition_type: null,
      cash_sales: 600,
      expenses: 128.5,
      bank_deposit: 300,
      expected: 1171.5,
      counted: 1000.5,
      safe_box: 160,
      difference: { amount: -11, kind: "short", reason: "Paid a courier" },
    },
    closing_balance: 1160.5,
    submitted_at: "2026-10-13T12:00:00+00:00",
    submitted_by: "Tess",
    expires_at: "2026-11-12T12:00:00+00:00",
  };
}

describe("parseSharedReport", () => {
  it("keeps the full answer, the Total Sales methods without the cash row (it would count twice)", () => {
    const r = parseSharedReport(full());
    expect(r).not.toBeNull();
    expect(r?.companyName).toBe("Olive & Vine");
    expect(r?.day).toBe("2026-10-13");
    expect(r?.code).toBe("HKD");
    expect(r?.sales.methods.map((m) => m.value_name)).toEqual(["visa_sales", "keeta_sales"]);
    expect(r?.sales.cash).toBe(600);
    expect(r?.sales.total).toBe(1234.5);
    expect(r?.yesterday).toBe(1000);
    expect(r?.history).toEqual([{ date: "2026-10-13", total: 1234.5 }]);
    expect(r?.lines).toEqual([{ item: "Food & Drink", amount: 78.5 }]);
    expect(r?.cash).toEqual({
      counted: 1000.5,
      safe_box: 160,
      difference: { amount: -11, kind: "short", reason: "Paid a courier" },
    });
  });

  it("treats the optional parts as optional: no yesterday, no history, no reason, no lines", () => {
    const body = full();
    body.sales = { methods: [], cash: 0, total: 0 };
    body.expenses = { total: 0 };
    body.cash = { counted: 5, safe_box: 0, difference: { amount: 0, kind: "none" } };
    delete body.currency_code;
    delete body.company_name;
    const r = parseSharedReport(body);
    expect(r?.yesterday).toBeNull();
    expect(r?.history).toBeNull();
    expect(r?.lines).toEqual([]);
    expect(r?.code).toBeNull();
    expect(r?.companyName).toBe("");
    expect(r?.cash.difference).toEqual({ amount: 0, kind: "none", reason: "" });
  });

  it("a cash count with no difference block reads as balanced", () => {
    const body = full();
    body.cash = { counted: 5, safe_box: 1 };
    expect(parseSharedReport(body)?.cash).toEqual({
      counted: 5,
      safe_box: 1,
      difference: { amount: 0, kind: "none", reason: "" },
    });
  });

  it.each([
    ["not an object", "nope"],
    ["null", null],
    ["no day", { ...full(), transaction_date: undefined }],
    ["a day that is not one", { ...full(), transaction_date: "13 Oct" }],
    ["no sales", { ...full(), sales: undefined }],
    ["no cash", { ...full(), cash: undefined }],
    ["a total that is not a number", { ...full(), sales: { methods: [], cash: 0, total: "12" } }],
  ])("refuses an answer with %s", (_why, body) => {
    expect(parseSharedReport(body)).toBeNull();
  });
});

describe("sharedBadge - Flask's header badge from the status", () => {
  it.each([
    [
      "success",
      "Published to Xero",
      { xero_integrated: true, publishing_status: "completed", status: "submitted" },
    ],
    [
      "danger",
      "Publish failed",
      { xero_integrated: false, publishing_status: "failed", status: "submitted" },
    ],
    ["info", "Submitted", { xero_integrated: false, publishing_status: null, status: "submitted" }],
    [
      "info",
      "Publishing to Xero",
      { xero_integrated: false, publishing_status: null, status: "submitted" },
    ],
    ["neutral", "Draft", { xero_integrated: false, publishing_status: null, status: "draft" }],
  ])("%s / %s", (tone, label, expected) => {
    expect(sharedBadge(tone, label)).toMatchObject(expected);
  });
});

describe("isSharePage - the one public address", () => {
  it.each([
    [`/share/${PATH}`, true],
    ["/share/x", true],
    ["/share", false],
    ["/sharex/a", false],
    ["/entity/360812e1/o/petty-cash/share/x", false],
    ["/landing", false],
    [null, false],
  ])("%s -> %s", (path, open) => {
    expect(isSharePage(path)).toBe(open);
  });
});
