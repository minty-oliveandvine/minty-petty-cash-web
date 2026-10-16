"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button, buttonClass, Icon, InlineAlert, inputClass, Modal, PageBanner, Skeleton, StatusPill } from "@minty/shared/ui";

import type { ViewerFile } from "@/components/closing/ReceiptViewer";
import { DeleteReportDialog, EditReportDialog } from "@/components/closing/ReportDialogs";
import { AppBar } from "@/components/layout/AppBar";
import { MoreMenu, type MoreItem } from "@/components/ui/MoreMenu";
import { ToastRegion, type ToastMessage } from "@/components/ui/Toast";
import { signedMoney } from "@/lib/addition";
import { ApiError, pettyCashBlob, pettyCashFetch } from "@/lib/apiClient";
import { salesRows } from "@/lib/close";
import { pettyCashHome } from "@/lib/companyPages";
import { formatWeekdayDay } from "@/lib/dates";
import { receiptKind } from "@/lib/expenses";
import { setFlash } from "@/lib/flash";
import { publishUrl } from "@/lib/flaskPages";
import { formatMoney } from "@/lib/money";
import {
  auditFacts,
  cashRows,
  deletedMessage,
  differenceAlert,
  expenseMeta,
  expenseTitle,
  isDraft,
  publishLabel,
  reportKpis,
  reportPill,
  reportReceipts,
  type DailyReport as Report,
} from "@/lib/report";
import { useAuth } from "@/lib/useAuth";
import { historyHref, stepHref } from "@/lib/wizardPages";

// The full-screen receipt view loads when first opened (the app's one viewer).
const ReceiptViewer = dynamic(() => import("@/components/closing/ReceiptViewer"), { ssr: false });

const TITLE = "Daily Report";
const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";
const NO_LINK = "We couldn't make the link. Check your connection, then try again.";
const NOT_COPIED = "We couldn't copy the link. Select it above, then copy it yourself.";

type Load = { kind: "loading" } | { kind: "ready"; report: Report } | { kind: "failed"; message: string };
type Share = { kind: "making" } | { kind: "ready"; url: string } | { kind: "failed"; message: string };

/**
 * The Daily Report of a submitted day - Part 15.7 Report page (15.15f; Flask's report summary,
 * `report/ending.html`): the Report header (name, day, one Status pill, Share, Publish to Xero,
 * More: Edit report / Delete report), the three KPIs, the difference as a fact, then Sales by
 * method, Expenses (n), Receipts (n) and Cash as disclosures, the closing balance and the audit
 * facts. In a centred 720 column (15.D: reports are read, not compared).
 *
 * Reads `GET /reports/<report id>`; Edit report is `POST /reports/<id>/reopen` (then the first
 * stage, Addition to Drawer), Delete is `DELETE /reports/<id>` (then the launch page) and Share
 * is `POST /reports/<id>/share-link` (Minty `petty_cash_api/routes/report.py`). Each action shows
 * only while the API's `permissions` allow it. Publish to Xero is not ported: it is Flask's page.
 * The rules are lib/report.ts.
 */
export function DailyReport({ reportId }: { reportId: string }) {
  const auth = useAuth();
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    pettyCashFetch<Report>(`/reports/${encodeURIComponent(reportId)}`)
      .then((report) => live && setLoad({ kind: "ready", report }))
      .catch((err: unknown) => {
        // A 401 has already gone back through the hand-off.
        if (!live || (err instanceof ApiError && err.status === 401)) return;
        setLoad({ kind: "failed", message: err instanceof ApiError ? err.message : UNREACHABLE });
      });
    return () => {
      live = false;
    };
  }, [reportId]);

  const entityId = auth?.entityId ?? "";
  const entityName = auth?.entityName ?? "";
  const home = auth ? pettyCashHome(entityId, entityName) : "";
  // The Report header's way back: the report history, the Daily Report's parent list (Flask's too).
  const reports = auth ? historyHref(entityId, entityName) : "";

  return (
    <>
      <AppBar companyName={entityName} />
      {/* Part 15.D: page padding 16 / 24 / 32; a report is a centred 720 column. */}
      <main className="px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto flex w-full min-w-0 max-w-[720px] flex-col gap-6">
          {load.kind === "ready" && auth ? (
            <ReportBody report={load.report} entityId={entityId} entityName={entityName} home={home} reports={reports} />
          ) : load.kind === "failed" ? (
            <>
              <ReportHeader reports={reports} />
              <InlineAlert tone="danger">{load.message}</InlineAlert>
              {home ? (
                <Link href={home} className={`${buttonClass("link")} w-fit`}>
                  Back to home
                </Link>
              ) : null}
            </>
          ) : (
            <>
              <ReportHeader reports={reports} />
              <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Loading">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}

/**
 * Part 15.1 Report header: the way back to the report history ("‹ Reports", its parent list - as
 * Flask's page; it was the launch page until history was this app's), "Daily Report" (the h1) with its
 * Status pill, the day, then the actions - [Share] [Publish to Xero] [More] at the right from 768;
 * on a phone the Primary is first and full width, the rest share the row under it (15.2).
 * While loading, the title shows at once and the day is skeleton.
 */
function ReportHeader({
  reports,
  day,
  status,
  actions,
  primary,
  more,
}: {
  reports: string;
  day?: string;
  status?: ReactNode;
  actions?: ReactNode;
  primary?: ReactNode;
  more?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      {reports ? (
        <Link
          href={reports}
          className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg pr-2 text-body-m font-medium text-text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
        >
          <Icon name="chevron_left" size="md" />
          Reports
        </Link>
      ) : (
        <span className="min-h-11" aria-hidden />
      )}
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="min-w-0 break-words text-display-m text-text-primary">{TITLE}</h1>
            {status}
          </div>
          {day ? <p className="text-body-m text-text-secondary">{formatWeekdayDay(day)}</p> : <Skeleton className="h-5 w-40" />}
        </div>
        {actions || primary || more ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2 md:shrink-0 md:flex-nowrap md:justify-end md:gap-3">
            {primary ? <div className="flex w-full md:order-2 md:w-auto [&>*]:w-full md:[&>*]:w-auto">{primary}</div> : null}
            {actions ? <div className="flex min-w-0 grow flex-wrap gap-2 md:order-1 md:grow-0 md:flex-nowrap [&>*]:grow md:[&>*]:grow-0">{actions}</div> : null}
            {more ? <div className="flex shrink-0 md:order-3">{more}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ReportBody({
  report,
  entityId,
  entityName,
  home,
  reports,
}: {
  report: Report;
  entityId: string;
  entityName: string;
  home: string;
  reports: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const [share, setShare] = useState<Share | null>(null);
  const [viewing, setViewing] = useState<ViewerFile | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  // Which Share press an answer belongs to: one that comes back after its dialog closed is dropped.
  const shareCall = useRef(0);

  const code = report.currency_code;
  const day = report.transaction_date;
  const draft = isDraft(report);
  const can = report.permissions;
  const money = (amount: number) => formatMoney(amount, code);
  const difference = differenceAlert(report);
  const lines = report.expenses.lines;
  const receipts = reportReceipts(report);
  const dialogReport = { id: report.report_id, day, was_published: report.was_published };

  async function makeLink() {
    const call = ++shareCall.current;
    setShare({ kind: "making" });
    try {
      const answer = await pettyCashFetch<{ url: string }>(`/reports/${encodeURIComponent(report.report_id)}/share-link`, { method: "POST" });
      if (call === shareCall.current) setShare({ kind: "ready", url: answer.url });
    } catch (err) {
      // A 401 has already gone back through the hand-off.
      if (call !== shareCall.current || (err instanceof ApiError && err.status === 401)) return;
      setShare({ kind: "failed", message: err instanceof ApiError ? err.message : NO_LINK });
    }
  }

  function closeShare() {
    shareCall.current += 1;
    setShare(null);
  }

  // Part 15.2 / D15-14: the rare and destructive actions in More, Delete last as Danger. A draft
  // (a reopened report) offers none of them: its way on is Close.
  const more: MoreItem[] = draft
    ? []
    : [
        ...(can.publish && report.xero_integrated
          ? [{ key: "publish", label: publishLabel(report), icon: "cloud_upload", href: publishUrl(entityId, report.report_id) }]
          : []),
        ...(can.edit ? [{ key: "edit", label: "Edit report", icon: "edit", onSelect: () => setDialog("edit") }] : []),
        ...(can.delete ? [{ key: "delete", label: "Delete report", icon: "delete", danger: true, onSelect: () => setDialog("delete") }] : []),
      ];
  // Not yet in Xero: publishing is the one way on, so it is the Primary - Flask's page (not ported).
  const publish =
    !draft && can.publish && !report.xero_integrated ? (
      <a href={publishUrl(entityId, report.report_id)} className={buttonClass("primary")}>
        {publishLabel(report)}
      </a>
    ) : null;
  const shareButton =
    !draft && can.share ? (
      <Button kind="secondary" icon={<Icon name="share" />} onClick={() => void makeLink()}>
        Share
      </Button>
    ) : null;
  const pill = reportPill(report);

  return (
    <>
      <ReportHeader
        reports={reports}
        day={day}
        status={<StatusPill label={pill.label} tone={pill.tone} />}
        actions={shareButton}
        primary={publish}
        more={more.length ? <MoreMenu label="More report actions" items={more} /> : null}
      />

      {draft ? (
        // Reopened for editing: the figures below are the draft's; the way on is Close.
        <PageBanner
          tone="info"
          title="This report isn't submitted yet"
          action={
            <Link href={stepHref(entityId, entityName, "ending", day)} className={buttonClass("link")}>
              Go to Close
            </Link>
          }
        >
          Check the day in Close, then submit it.
        </PageBanner>
      ) : null}

      {/* 15.7: exactly three KPIs - stacked on a phone, in a row from 640. Each value is read with its label. */}
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {reportKpis(report).map((kpi) => (
          <div key={kpi.label} className="flex min-w-0 flex-col gap-1 rounded-xl border border-border-subtle bg-surface-card p-4">
            <dt className="text-body-s text-text-secondary">{kpi.label}</dt>
            <dd className="min-w-0 break-all text-title-l text-text-primary" translate="no">
              {kpi.value}
            </dd>
            {kpi.meta ? <dd className="text-body-s text-text-muted">{kpi.meta}</dd> : null}
          </div>
        ))}
      </dl>

      {difference ? (
        // 15.7: the difference as a fact, not blame - Warning tone, in words, never a red number.
        <InlineAlert tone="warning" title={difference.title}>
          {difference.body}
        </InlineAlert>
      ) : null}

      <div className="flex flex-col gap-3">
        <Disclosure title="Sales by method">
          <Rows>
            {salesRows(report).map((row) => (
              <Row key={row.key} label={row.label} value={money(row.amount)} />
            ))}
            <Row label="Cash" value={money(report.sales.cash)} />
            <Row label="Total sales" value={money(report.sales.total)} total />
          </Rows>
        </Disclosure>

        <Disclosure title={`Expenses (${lines.length})`}>
          {lines.length ? (
            <ul className="flex flex-col">
              {lines.map((line) => (
                <li key={line.id} className="flex min-w-0 flex-col gap-1 border-t border-border-subtle py-3 first:border-t-0 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                    <p className="min-w-0 flex-1 basis-40 break-words text-body-m font-semibold text-text-primary">{expenseTitle(line)}</p>
                    <p className="min-w-0 break-all text-right text-body-m font-semibold text-text-primary" translate="no">
                      {money(line.amount)}
                    </p>
                  </div>
                  <p className="min-w-0 break-words text-body-s text-text-secondary">{expenseMeta(line)}</p>
                  {line.remarks ? <p className="min-w-0 break-words text-body-s text-text-muted">{line.remarks}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-m text-text-secondary">No expenses this day.</p>
          )}
          <Rows>
            <Row label="Total expenses" value={money(report.expenses.total)} total />
          </Rows>
        </Disclosure>

        <Disclosure title={`Receipts (${receipts.length})`}>
          {receipts.length ? (
            <ul className="flex flex-col gap-2">
              {receipts.map(({ line, receipt }) => (
                <li key={receipt.id}>
                  {/* A Part 14 File card: it opens the receipt full screen, never in a new tab. */}
                  <button
                    type="button"
                    onClick={() =>
                      setViewing({
                        name: receipt.name,
                        mime: receipt.mime_type,
                        source: () => pettyCashBlob(`/expense-lines/${encodeURIComponent(line.id)}/receipts/${encodeURIComponent(receipt.id)}`),
                      })
                    }
                    aria-label={`View receipt ${receipt.name}`}
                    className="flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-border-default bg-surface-card px-3 py-2 text-left hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                  >
                    <Icon name={receiptKind(receipt.mime_type) === "pdf" ? "picture_as_pdf" : "image"} className="text-text-secondary" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body-m text-text-primary">{receipt.name}</span>
                      <span className="break-words text-body-s text-text-secondary">
                        {expenseTitle(line)} · <span translate="no">{money(line.amount)}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-body-s font-medium text-text-link">View</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-m text-text-secondary">No receipts this day.</p>
          )}
        </Disclosure>

        <Disclosure title="Cash">
          <Rows>
            {cashRows(report).map((row) => (
              <Row key={row.label} {...row} />
            ))}
          </Rows>
        </Disclosure>
      </div>

      {/* The day's closing balance, plain text, never coloured - the server's figure. */}
      <dl className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-xl bg-surface-sunk p-4 sm:px-6">
        <dt className="min-w-0 text-title-m text-text-primary">Closing balance</dt>
        <dd className="min-w-0 break-all text-right text-title-m text-text-primary" translate="no">
          {signedMoney(report.closing_balance, code)}
        </dd>
        <dd className="basis-full text-body-s text-text-secondary">What the drawer and the safe box held at the end of the day.</dd>
      </dl>

      {/* Part 14 Audit meta, at the bottom (15.1: administrative facts never in the header). */}
      <div className="flex flex-col gap-1 text-body-s text-text-muted">
        {auditFacts(report).map((fact) => (
          <p key={fact} className="flex min-w-0 items-start gap-1.5 break-words">
            <Icon name="history" size="sm" className="mt-0.5" />
            {fact}
          </p>
        ))}
      </div>

      {dialog === "edit" ? (
        <EditReportDialog report={dialogReport} entityId={entityId} entityName={entityName} onCancel={() => setDialog(null)} />
      ) : null}
      {dialog === "delete" ? (
        <DeleteReportDialog
          report={dialogReport}
          onCancel={() => setDialog(null)}
          onDeleted={(answer) => {
            // The launch page says so (a Page banner, read once) - in place of this page, which shows a report that is gone.
            setFlash(deletedMessage(answer.transaction_date), "success");
            router.replace(home);
          }}
        />
      ) : null}
      {share ? (
        <ShareReport
          share={share}
          day={day}
          onClose={closeShare}
          onCopied={() => {
            closeShare();
            setToast({ id: Date.now(), message: `The link to the Daily Report for ${formatWeekdayDay(day)} is copied.` });
          }}
        />
      ) : null}
      {viewing ? <ReceiptViewer file={viewing} onClose={() => setViewing(null)} /> : null}
      <ToastRegion toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

/** A collapsed breakdown (15.7: "collapsible sections as disclosures") - a native disclosure. */
function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group min-w-0 rounded-xl border border-border-subtle bg-surface-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-title-m text-text-primary hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 break-words">{title}</span>
        <Icon name="expand_more" size="lg" className="text-text-secondary transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="flex min-w-0 flex-col gap-3 px-4 pb-4 sm:px-6 sm:pb-6">{children}</div>
    </details>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col gap-2">{children}</dl>;
}

/**
 * A Description row: the term, then its value at the right - an amount wraps under the term
 * before it is ever clipped. A total is bold over a rule; `words` is a value in words ("None").
 */
function Row({ label, value, total = false, words = false }: { label: string; value: string; total?: boolean; words?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 ${total ? "border-t border-border-subtle pt-2" : ""}`}>
      <dt className={`min-w-0 break-words text-body-m ${total ? "font-semibold text-text-primary" : "text-text-secondary"}`}>{label}</dt>
      <dd
        className={`min-w-0 text-right text-body-m text-text-primary ${words ? "break-words" : "break-all"} ${total ? "font-semibold" : ""}`}
        translate="no"
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Share - Flask's page's "Share this report": the read-only link (made by `POST share-link`) and
 * Copy link, which copies it and confirms with a toast. A link that can't be made shows the API's
 * sentence; a copy the browser refuses says so, and the link stays there to copy by hand.
 */
function ShareReport({ share, day, onClose, onCopied }: { share: Share; day: string; onClose: () => void; onCopied: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  const [copyProblem, setCopyProblem] = useState(false);

  async function copy() {
    if (share.kind !== "ready") return;
    try {
      await navigator.clipboard.writeText(share.url);
      onCopied();
    } catch {
      setCopyProblem(true);
      field.current?.select();
    }
  }

  return (
    <Modal
      open
      onRequestClose={onClose}
      title="Share this report"
      description={`Anyone with the link can read the Daily Report for ${formatWeekdayDay(day)}, without signing in, until it expires.`}
      footer={
        <>
          <Button kind="secondary" onClick={onClose}>
            Close
          </Button>
          <Button kind="primary" icon={<Icon name="content_copy" />} disabled={share.kind !== "ready"} onClick={() => void copy()}>
            Copy link
          </Button>
        </>
      }
    >
      {share.kind === "failed" ? (
        <InlineAlert tone="danger">{share.message}</InlineAlert>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="share-link" className="text-label text-text-secondary">
              Link
            </label>
            {share.kind === "ready" ? (
              <input
                ref={field}
                id="share-link"
                type="text"
                readOnly
                value={share.url}
                onFocus={(e) => e.currentTarget.select()}
                className={inputClass(false)}
                translate="no"
              />
            ) : (
              <div role="status" aria-label="Making the link">
                <Skeleton className="h-11 w-full" />
              </div>
            )}
          </div>
          {copyProblem ? <InlineAlert tone="warning">{NOT_COPIED}</InlineAlert> : null}
        </div>
      )}
    </Modal>
  );
}
