/**
 * A shared Daily Report: the public page at `/share/<initials>/<date>/<secret>` (app/share) and the
 * link the Share modal builds for it (components/report/ReportActions.tsx).
 *
 * - `POST /reports/<id>/share-link` (bearer) answers `{url, path, expires_at}`. `path` is
 *   `<initials>/<date>/<secret>`, the same as Flask's `ShareLink.path_segment`
 *   (Minty `blueprints/report/services/share.py`). The link is this app's own page on the
 *   page's origin; `url` (Flask's old `/Minty_Report/...` page) is not used.
 * - `GET /api/petty-cash/v1/public/share/<initials>/<date>/<secret>` (no auth) answers the report
 *   as Flask's ORIGINAL shared page (`report/ending.html`, `is_shared_link`) showed it, or `{error}`
 *   with 404 / 410.
 *
 * The secret is in the address, so nothing here puts the path in a message: a refusal is one of
 * Flask's fixed sentences, chosen by the status alone.
 */

import { HOUSE_FALLBACK } from "@/lib/apiClient";
import type { DifferenceKind } from "@/lib/cash";
import type { ClosePage, SummarySales } from "@/lib/ending";
import type { OpeningPage } from "@/lib/opening";

/**
 * The public page's address prefix. Exactly `/share/...` is open without a token (proxy.ts) and
 * drawn without the app's chrome - no sidebar (components/ui/SidebarShell.tsx).
 */
export const SHARE_PREFIX = "/share/";

/** True for the public share page's addresses, and nothing else. */
export function isSharePage(pathname: string | null | undefined): boolean {
  return (pathname ?? "").startsWith(SHARE_PREFIX);
}

/** Flask's secret: 24 random bytes as 32 url-safe characters (`SHARE_SECRET_RE`). */
const SECRET = /^[A-Za-z0-9_-]{32}$/;

export type SharePath = [initials: string, date: string, secret: string];

/**
 * The three parts of a share path - a string (`"OV/13_Oct_2026/<secret>"`, slashes around it
 * forgiven) or the page's catch-all segments - or null for anything else: the old two-part form
 * (no secret, so guessable), a malformed secret, an empty or dot part, more parts.
 */
export function sharePathParts(path: unknown): SharePath | null {
  let parts: unknown[];
  if (typeof path === "string") parts = path.replace(/^\/+|\/+$/g, "").split("/");
  else if (Array.isArray(path)) parts = path;
  else return null;
  if (
    parts.length !== 3 ||
    !parts.every(
      (p): p is string =>
        typeof p === "string" && p !== "" && p !== "." && p !== ".." && !p.includes("/"),
    )
  )
    return null;
  if (!SECRET.test(parts[2] as string)) return null;
  return parts as SharePath;
}

/** The page's catch-all segments unescaped (Next hands them over as they were in the address), or null for bad escaping. */
export function decodeSegments(segments: string[]): string[] | null {
  try {
    return segments.map((s) => decodeURIComponent(s));
  } catch {
    return null;
  }
}

const joined = (parts: SharePath) => parts.map(encodeURIComponent).join("/");

/** The Share modal's link: `<origin>/share/<path>`, or null when the API's path is not one. */
export function shareUrl(origin: string, path: unknown): string | null {
  const parts = sharePathParts(path);
  return parts ? `${origin}/share/${joined(parts)}` : null;
}

/** The public read's path on the Petty Cash API. */
export function sharedReportApiPath(parts: SharePath): string {
  return `/api/petty-cash/v1/public/share/${joined(parts)}`;
}

/** Flask's sentences for a link that cannot be followed (`report/routes/legacy.py`), word for word. */
export const SHARE_REFUSED = {
  gone: "This link doesn't work anymore. Could you ask for a fresh one?",
  expired: "This link has expired. Could you ask for a fresh one?",
} as const;

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";

/** What the page says for a refused read - by status only (null: no answer at all). */
export function shareRefusal(status: number | null): string {
  if (status === null) return UNREACHABLE;
  if (status === 404 || status === 400) return SHARE_REFUSED.gone;
  if (status === 410) return SHARE_REFUSED.expired;
  return HOUSE_FALLBACK;
}

/** What the shared page draws: Flask's shared view - the header, then the summary's cards. */
export type SharedReport = {
  /** "" when the answer left it out. */
  companyName: string;
  day: string;
  code: string | null;
  statusLabel: string;
  statusTone: string;
  /** Total Sales' methods: electronic and delivery (the cash row is `cash`). */
  sales: SummarySales;
  yesterday: number | null;
  /** Sales History's 30 days; null when the answer has none (the card is left out). */
  history: ClosePage["sales"]["history"] | null;
  /** Total Expenses' lines: an account's name and its amount, nothing else. */
  lines: { item: string; amount: number }[];
  cash: {
    counted: number;
    safe_box: number;
    difference: { amount: number; kind: DifferenceKind; reason: string };
  };
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const KINDS: DifferenceKind[] = ["short", "over", "none"];

/**
 * The public read, checked and trimmed to what the page draws, or null when it is not a report
 * (no day, no sales total, no cash count). The optional parts - yesterday, history, the lines, the
 * difference and its reason, the currency, the company - fall back to Flask's "none" for each.
 */
export function parseSharedReport(body: unknown): SharedReport | null {
  if (!isObj(body) || !isObj(body.sales) || !isObj(body.cash)) return null;
  const day = str(body.transaction_date);
  const total = num(body.sales.total);
  const counted = num(body.cash.counted);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || total === null || counted === null) return null;

  const methods: SummarySales["methods"] = (
    Array.isArray(body.sales.methods) ? body.sales.methods : []
  ).flatMap((m) => {
    if (!isObj(m) || (m.type !== "electronic" && m.type !== "delivery")) return [];
    const name = str(m.name) ?? "";
    const valueName = str(m.value_name) ?? name;
    return [
      {
        sale_id: str(m.sale_id) ?? valueName,
        name,
        value_name: valueName,
        type: m.type,
        amount: num(m.amount) ?? 0,
      },
    ];
  });

  const history = Array.isArray(body.sales.history)
    ? body.sales.history.flatMap((h) =>
        isObj(h) && str(h.date) && num(h.total) !== null
          ? [{ date: h.date as string, total: h.total as number }]
          : [],
      )
    : null;

  const rawLines =
    isObj(body.expenses) && Array.isArray(body.expenses.lines) ? body.expenses.lines : [];
  const lines = rawLines.flatMap((l) =>
    isObj(l) && num(l.amount) !== null
      ? [{ item: str(l.item) ?? "", amount: l.amount as number }]
      : [],
  );

  const diff = isObj(body.cash.difference) ? body.cash.difference : {};
  const kind = KINDS.find((k) => k === diff.kind) ?? "none";

  return {
    companyName: str(body.company_name) ?? "",
    day,
    code: str(body.currency_code),
    statusLabel: str(body.status_label) ?? "Submitted",
    statusTone: str(body.status_tone) ?? "info",
    sales: { methods, cash: num(body.sales.cash) ?? 0, total },
    yesterday: num(body.sales.yesterday_total),
    history,
    lines,
    cash: {
      counted,
      safe_box: num(body.cash.safe_box) ?? 0,
      difference: { amount: num(diff.amount) ?? 0, kind, reason: str(diff.reason) ?? "" },
    },
  };
}

/**
 * Flask's header badge (`ReportBadge`) from the read's status pill (Minty `daily_closing.report_status`):
 * Published for "Published to Xero" (success), Publish failed (danger), Draft (neutral), else
 * Submitted - a publish under way included, as Flask's badge had it.
 */
export function sharedBadge(tone: string, label: string): NonNullable<OpeningPage["draft"]> {
  const published = tone === "success" || label === "Published to Xero";
  const failed = !published && (tone === "danger" || label === "Publish failed");
  return {
    id: "",
    status: tone === "neutral" || label === "Draft" ? "draft" : "submitted",
    current_section: null,
    completed_sections: [],
    xero_integrated: published,
    publishing_status: published ? "completed" : failed ? "failed" : null,
  };
}
