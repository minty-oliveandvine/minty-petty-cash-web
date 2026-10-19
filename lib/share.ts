/**
 * The public share link of a Daily Report (Part 15.7 "shared/public variant without actions or
 * navigation"): the link the Share dialog shows, the read behind `/share/<initials>/<day>/<secret>`
 * (app/share/[...path], components/closing/SharedReport.tsx), and what its answer becomes on the
 * page. Flask's `/Minty_Report/<initials>/<day>/<secret>/` page is no longer linked (the user's
 * rule: Flask is a backend only).
 *
 * - `POST /reports/<id>/share-link` (bearer) answers `{url, path, expires_at}`; the dialog builds
 *   the link from `path` on THIS app's origin, never from `url`.
 * - `GET /api/petty-cash/v1/public/share/<initials>/<day>/<secret>` takes no token. It answers the
 *   report's figures, which may be trimmed - every builder here returns only what arrived - or
 *   `{error}` with 404 (no such link) or 410 (expired).
 *
 * The secret is the last segment of the address: nothing here logs a URL, a path or a body.
 */

import type { StatusTone } from "@minty/shared/ui";

import type { ClosePage } from "@/lib/close";
import { salesRows } from "@/lib/close";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { cashRowsOf, differenceAlertOf, isoMoment, kpiCards, reportPill, type CashRow, type DailyReport, type Kpi } from "@/lib/report";

type Maybe<T> = T | null | undefined;

export type SharedLine = {
  item?: Maybe<string>;
  /** The supplier's name; an object with a name reads the same. */
  supplier?: Maybe<string | { name?: Maybe<string> }>;
  remarks?: Maybe<string>;
  amount?: Maybe<number>;
  /** Names only: a shared report never opens a receipt. */
  receipts?: Maybe<{ name?: Maybe<string> }[]>;
};

/** What the public read answers - every field may be left out ("render only what arrives"). */
export type SharedReport = {
  company_name?: Maybe<string>;
  transaction_date?: Maybe<string>;
  currency_code?: Maybe<string>;
  status_label?: Maybe<string>;
  status_tone?: Maybe<string>;
  kpis?: Maybe<Partial<DailyReport["kpis"]>>;
  sales?: Maybe<{ methods?: Maybe<ClosePage["sales"]["methods"]>; cash?: Maybe<number>; total?: Maybe<number> }>;
  expenses?: Maybe<{ lines?: Maybe<SharedLine[]>; total?: Maybe<number> }>;
  cash?: Maybe<Partial<DailyReport["cash"]>>;
  closing_balance?: Maybe<number>;
  submitted_at?: Maybe<string>;
  submitted_by?: Maybe<string>;
  expires_at?: Maybe<string>;
};

export type SharedRead = { kind: "ready"; report: SharedReport } | { kind: "missing" } | { kind: "expired" } | { kind: "failed" };

/** This app's public share page (`/share/<initials>/<day>/<secret>`) - proxy.ts lets exactly this prefix through. */
export function isSharePage(pathname: string): boolean {
  return pathname.startsWith("/share/");
}

/** One segment of a share path: what Flask's links are made of (initials, `13_Oct_2026`, a url-safe secret). */
const SEGMENT = /^[A-Za-z0-9_-]+$/;

/** `<initials>/<day>/<secret>` from the page's segments - or null for anything else, which is never sent. */
export function sharePathFromSegments(segments: readonly string[] | undefined): string | null {
  if (!segments || segments.length !== 3 || !segments.every((s) => SEGMENT.test(s))) return null;
  return segments.join("/");
}

/** The link the Share dialog shows: this app's `/share/<path>` on `origin` - null for a path that isn't one. */
export function shareLinkUrl(origin: string, path: Maybe<string>): string | null {
  const clean = sharePathFromSegments((path ?? "").replace(/^\/+|\/+$/g, "").split("/"));
  return clean ? `${origin.replace(/\/+$/, "")}/share/${clean}` : null;
}

/** The public read's address - no company in it: the secret finds the report. */
export function sharedReportUrl(path: string): string {
  return `${env.PETTY_CASH_API_URL}/api/petty-cash/v1/public/share/${path}`;
}

/**
 * Read a shared report with nothing of the reader's: no Authorization (even with this app's token
 * in a cookie), no cookies, no referrer, no cache. 404 and 410 are the two refusals the page
 * words; anything else is logged by its status alone - never the address, which holds the secret.
 */
export async function readSharedReport(path: string, fetcher: typeof fetch = fetch): Promise<SharedRead> {
  let res: Response;
  try {
    res = await fetcher(sharedReportUrl(path), {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
  } catch {
    console.error("Shared Daily Report: the Petty Cash API did not answer");
    return { kind: "failed" };
  }
  if (res.status === 404) return { kind: "missing" };
  if (res.status === 410) return { kind: "expired" };
  if (!res.ok) {
    console.error(`Shared Daily Report: the Petty Cash API answered ${res.status}`);
    return { kind: "failed" };
  }
  try {
    const body = (await res.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
    return { kind: "ready", report: body as SharedReport };
  } catch {
    console.error("Shared Daily Report: the Petty Cash API's answer was not a report");
    return { kind: "failed" };
  }
}

const num = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const code = (report: SharedReport) => report.currency_code ?? null;

/** The Status pill, when the API sent its label (its tone as the Daily Report takes it). */
export function sharedPill(report: SharedReport): { label: string; tone: StatusTone } | null {
  return report.status_label ? reportPill({ status_label: report.status_label, status_tone: report.status_tone ?? "" }) : null;
}

/** The KPIs that arrived; the expenses' count only when the lines did. */
export function sharedKpis(report: SharedReport): Kpi[] {
  const lines = report.expenses?.lines;
  return kpiCards(report.kpis ?? {}, Array.isArray(lines) ? lines.length : null, code(report));
}

export type ShareRow = { key: string; label: string; value: string; total?: boolean };

/** Sales by method (Deliveroo left out, as on the Daily Report), Cash and Total sales - null when no sales arrived. */
export function sharedSales(report: SharedReport): ShareRow[] | null {
  const sales = report.sales;
  if (!sales) return null;
  const money = (n: number) => formatMoney(n, code(report));
  const rows: ShareRow[] = Array.isArray(sales.methods) ? salesRows({ sales: { methods: sales.methods } }).map((r) => ({ key: r.key, label: r.label, value: money(r.amount) })) : [];
  if (num(sales.cash)) rows.push({ key: "cash", label: "Cash", value: money(sales.cash) });
  if (num(sales.total)) rows.push({ key: "total", label: "Total sales", value: money(sales.total), total: true });
  return rows.length ? rows : null;
}

export type SharedExpenses = {
  lines: { title: string; meta: string; remarks: string | null; value: string | null }[];
  total: string | null;
  /** null: no line carried `receipts`, so the section is left out. */
  receipts: { name: string; title: string; value: string | null }[] | null;
};

function supplierName(supplier: SharedLine["supplier"]): string {
  const name = typeof supplier === "string" ? supplier : supplier?.name;
  return (name ?? "").trim();
}

/** The expenses as Record rows (description, supplier), their total and the receipts' names - null when none arrived. */
export function sharedExpenses(report: SharedReport): SharedExpenses | null {
  const expenses = report.expenses;
  if (!expenses || (!Array.isArray(expenses.lines) && !num(expenses.total))) return null;
  const money = (n: Maybe<number>) => (num(n) ? formatMoney(n, code(report)) : null);
  const raw = Array.isArray(expenses.lines) ? expenses.lines : [];
  const lines = raw.map((line) => ({
    title: (line.item ?? "").trim() || "Expense",
    meta: supplierName(line.supplier) || "No supplier",
    remarks: (line.remarks ?? "").trim() || null,
    value: money(line.amount),
  }));
  const carried = raw.some((line) => Array.isArray(line.receipts));
  const receipts = carried
    ? raw.flatMap((line, i) =>
        (Array.isArray(line.receipts) ? line.receipts : []).map((r) => ({ name: (r.name ?? "").trim() || "Receipt", title: lines[i].title, value: lines[i].value })),
      )
    : null;
  return { lines, total: money(expenses.total), receipts };
}

/** The Cash section's rows that arrived - null for none. */
export function sharedCash(report: SharedReport): CashRow[] | null {
  const rows = report.cash ? cashRowsOf(report.cash, code(report)) : [];
  return rows.length ? rows : null;
}

/** The difference as a fact (Warning), when it arrived and is not none. */
export function sharedDifference(report: SharedReport): { title: string; body: string } | null {
  return differenceAlertOf(report.cash?.difference, code(report));
}

/** Who submitted it and when, and until when the link works - the facts that arrived. */
export function sharedAudit(report: SharedReport): string[] {
  const facts: string[] = [];
  const at = isoMoment(report.submitted_at);
  if (report.submitted_by || at) facts.push(`Submitted${report.submitted_by ? ` by ${report.submitted_by}` : ""}${at ? ` · ${at}` : ""}`);
  const until = isoMoment(report.expires_at);
  if (until) facts.push(`This link works until ${until}`);
  return facts;
}
