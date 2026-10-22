"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { saveBlob } from "@minty/shared/download";
import {
  Button,
  buttonClass,
  EmptyState,
  Field,
  FilterChip,
  Icon,
  InlineAlert,
  inputClass,
  Skeleton,
  StatusPill,
} from "@minty/shared/ui";

import {
  PublishDialog,
  PublishProgress,
  PublishReasons,
  usePublish,
} from "@/components/closing/Publish";
import {
  DeleteReportDialog,
  EditReportDialog,
  type DialogReport,
} from "@/components/closing/ReportDialogs";
import { AppBar } from "@/components/layout/AppBar";
import { MoreMenu, type MoreItem } from "@/components/ui/MoreMenu";
import { ToastRegion, type ToastMessage } from "@/components/ui/Toast";
import { ApiError, pettyCashDownload, pettyCashFetch } from "@/lib/apiClient";
import { pettyCashHome } from "@/lib/companyPages";
import { formatWeekdayDay } from "@/lib/dates";
import { integrationUrl } from "@/lib/hub";
import {
  apiQuery,
  changeFilters,
  csvFallbackName,
  csvGate,
  csvRequest,
  csvSavedMessage,
  dateRangeProblem,
  filtersOf,
  historyQuery,
  isFiltered,
  missingDate,
  pagerItems,
  PER_PAGE,
  rangeText,
  rowActions,
  rowHref,
  rowMeta,
  STATUS_CHIPS,
  watchedOnArrival,
  type Filters,
  type HistoryPage,
  type HistoryRow,
} from "@/lib/history";
import { money } from "@/lib/money";
import { isWorking, publishedMessage } from "@/lib/publish";
import { deletedMessage, reportPill } from "@/lib/report";
import { useAuth } from "@/lib/useAuth";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then try again.";
const NOT_EXPORTED =
  "We couldn't reach Petty Cash, so nothing was exported. Check your connection, then try again.";

/** One answer of `GET /reports`, for the address (`query`) and the attempt it was asked with. */
type Load =
  | { query: string; attempt: number; kind: "ready"; page: HistoryPage }
  | { query: string; attempt: number; kind: "refused"; message: string }
  | { query: string; attempt: number; kind: "failed"; message: string };

/**
 * Report history - Part 15.4b, the historical retrieval list (Flask's
 * `report_history/report_history.html`, drawn with this app's components): the Standard header,
 * the date range (with Export CSV, the API's file), the status chips, the reports as Record rows
 * newest day first, and the pager ("Showing 1–10 of 41", rows per page 10/25/50/100). No counts and
 * no trends (15.4b, 15.7).
 *
 * Every filter is in the address (`?status=&start_date=&end_date=&page=&per_page=`), so Back and a
 * reload keep it; a filter change goes back to page 1. Reads `GET /reports` with the address as it
 * stands (Minty `petty_cash_api/routes/history.py`) - a filter the API refuses (422) shows its
 * sentence. A row's More menu offers Publish to Xero (asked first, then watched in the row - Wave
 * 2j), Edit report and Delete report only where the API allows. The rules are lib/history.ts.
 */
export function ReportHistory() {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  const filters = filtersOf(params);

  const [load, setLoad] = useState<Load | null>(null);
  // A new attempt reads the same address again: Try again, and the list after a delete.
  const [attempt, setAttempt] = useState(0);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // After a delete: the row and its More button are gone, so the focus goes to the page's title -
  // once the list is read again (the dialog hands the focus back to its opener when it closes).
  const refocus = useRef(false);
  const chipRow = useRef<HTMLDivElement>(null);

  // A phone scrolls the chips in their own row: the chosen one is brought into it (never the page).
  useEffect(() => {
    const row = chipRow.current;
    const chosen = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !chosen) return;
    const box = row.getBoundingClientRect();
    const chip = chosen.getBoundingClientRect();
    if (chip.right > box.right) row.scrollLeft += chip.right - box.right + 16;
    else if (chip.left < box.left) row.scrollLeft -= box.left - chip.left + 16;
  }, [filters.status]);

  useEffect(() => {
    let live = true;
    pettyCashFetch<HistoryPage>("/reports", { query: apiQuery(new URLSearchParams(query)) })
      .then((page) => live && setLoad({ query, attempt, kind: "ready", page }))
      .catch((err: unknown) => {
        // A 401 has already gone back through the hand-off.
        if (!live || (err instanceof ApiError && err.status === 401)) return;
        if (err instanceof ApiError && err.status === 422)
          setLoad({ query, attempt, kind: "refused", message: err.message });
        else
          setLoad({
            query,
            attempt,
            kind: "failed",
            message: err instanceof ApiError ? err.message : UNREACHABLE,
          });
      });
    return () => {
      live = false;
    };
  }, [query, attempt]);

  /** The list for `f`, in the address (Back keeps each step). */
  const hrefOf = (f: Filters) => {
    const q = historyQuery(f);
    return q ? `${pathname}?${q}` : pathname;
  };
  const go = (f: Filters) => router.push(hrefOf(f));

  // An answer for another address is not this list's: until this one's comes, the list is loading.
  // A new attempt at the same address keeps the rows on show (a reload in place).
  const shown = load && load.query === query ? load : null;

  // A page past the end (the last row of the last page deleted, or a typed address): the last page.
  useEffect(() => {
    if (shown?.kind !== "ready") return;
    const { reports, total_count, total_pages } = shown.page;
    if (reports.length === 0 && total_count > 0 && filters.page > total_pages) {
      router.replace(hrefOf({ ...filters, page: total_pages }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per answer
  }, [shown]);

  const entityId = auth?.entityId ?? "";
  const entityName = auth?.entityName ?? "";
  const home = auth ? pettyCashHome(entityId, entityName) : "";
  const filtered = isFiltered(filters);
  const gate = csvGate(filters);

  useEffect(() => {
    if (!refocus.current || !load) return;
    refocus.current = false;
    heading.current?.focus();
  }, [load]);

  function deleted(day: string) {
    setToast({ id: Date.now(), message: deletedMessage(day) });
    refocus.current = true;
    setAttempt((a) => a + 1);
  }

  return (
    <>
      <AppBar companyName={entityName} />
      {/* Part 15.D page padding 16 / 24 / 32; a list's rows stay at most 960 wide (15.4 Responsive). */}
      <main className="px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto flex w-full min-w-0 max-w-[960px] flex-col gap-5">
          {/* Part 15.1 Standard header: the way back, the title, one line of purpose. */}
          <div className="flex flex-col gap-1">
            {home ? (
              <Link
                href={home}
                className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg pr-2 text-body-m font-medium text-text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
              >
                <Icon name="chevron_left" size="md" />
                Petty Cash
              </Link>
            ) : (
              <span className="min-h-11" aria-hidden />
            )}
            <h1
              ref={heading}
              tabIndex={-1}
              className="text-display-m text-text-primary outline-none"
            >
              Reports
            </h1>
            <p className="text-body-m text-text-secondary">Every Daily Report, newest first.</p>
          </div>

          {/* The date range, keyed by the address's dates so Back puts them back in the fields. */}
          <DateRange
            key={`${filters.start}|${filters.end}`}
            filters={filters}
            csvGate={gate}
            onExported={(filename) =>
              setToast({ id: Date.now(), message: csvSavedMessage(filename) })
            }
            onShow={(start, end) => go(changeFilters(filters, { start, end }))}
          />

          {/* Part 14 Filter chips: toggles (aria-pressed), the pill's words; a phone scrolls them in their own row. */}
          <div
            ref={chipRow}
            className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-1.5 sm:-mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
          >
            <div
              role="group"
              aria-label="Filter by status"
              className="flex shrink-0 gap-2 sm:flex-wrap"
            >
              {STATUS_CHIPS.map((chip) => (
                <FilterChip
                  key={chip.key || "all"}
                  label={chip.label}
                  selected={filters.status === chip.key}
                  onClick={() => go(changeFilters(filters, { status: chip.key }))}
                />
              ))}
            </div>
            {filtered ? (
              <Link href={pathname} className={`${buttonClass("link")} shrink-0`}>
                Clear filters
              </Link>
            ) : null}
          </div>

          {!shown ? (
            <div
              className="flex flex-col gap-2"
              role="status"
              aria-busy="true"
              aria-label="Loading"
            >
              {/* 15.4 States: five Skeleton rows. */}
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-[88px] w-full rounded-lg md:h-[72px]" />
              ))}
            </div>
          ) : shown.kind === "refused" ? (
            <InlineAlert
              tone="danger"
              action={
                <Link href={pathname} className={buttonClass("link")}>
                  Clear filters
                </Link>
              }
            >
              {shown.message}
            </InlineAlert>
          ) : shown.kind === "failed" ? (
            <InlineAlert
              tone="danger"
              action={
                <Button
                  kind="link"
                  onClick={() => setAttempt((a) => a + 1)}
                  processing={attempt !== shown.attempt}
                  processingLabel="Trying again…"
                >
                  Try again
                </Button>
              }
            >
              {shown.message}
            </InlineAlert>
          ) : shown.page.reports.length ? (
            <>
              <ul className="flex flex-col gap-2" aria-label="Daily Reports">
                {shown.page.reports.map((row) => (
                  <ReportRow
                    key={row.id}
                    row={row}
                    code={shown.page.currency_code}
                    canPublish={shown.page.can_publish}
                    entityId={entityId}
                    entityName={entityName}
                    onDeleted={deleted}
                    onPublished={(day) =>
                      setToast({ id: Date.now(), message: publishedMessage(day) })
                    }
                  />
                ))}
              </ul>
              <Pager
                page={shown.page}
                filters={filters}
                hrefOf={hrefOf}
                onPerPage={(perPage) => go(changeFilters(filters, { perPage }))}
              />
            </>
          ) : filtered ? (
            // 15.11c: no character for a filtered list that matched nothing.
            <EmptyState
              title="No reports match these filters"
              action={
                <Link href={pathname} className={buttonClass("secondary")}>
                  Clear filters
                </Link>
              }
            >
              Try another date range or status.
            </EmptyState>
          ) : (
            // 15.11a: the first use, with Minty (Part 10's words).
            <EmptyState
              character
              title="No reports yet"
              action={
                home ? (
                  <Link href={home} className={buttonClass("secondary")}>
                    Go to Petty Cash
                  </Link>
                ) : null
              }
            >
              Completed Daily Reports will appear here.
            </EmptyState>
          )}
        </div>
      </main>
      <ToastRegion toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

/**
 * The date range (Part 14 has no Date range yet: two Date fields, native pickers): From, To, Show,
 * and Export CSV - the API's `GET /reports/export.csv` of the dates the list shows, read with the
 * bearer and saved under the server's file name; a gated button with its reason beside it until
 * both are shown, "Exporting…" while it is read, a refusal's sentence inline and a toast once saved. An end before the start is said at once; one date alone is "not
 * finished yet", said only when Show is pressed. Enter in a field is Show.
 */
function DateRange({
  filters,
  csvGate,
  onExported,
  onShow,
}: {
  filters: Filters;
  /** Why Export CSV waits, or null once the list shows a date range. */
  csvGate: string | null;
  onExported: (filename: string) => void;
  onShow: (start: string, end: string) => void;
}) {
  const [start, setStart] = useState(filters.start);
  const [end, setEnd] = useState(filters.end);
  const [tried, setTried] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProblem, setExportProblem] = useState<string | null>(null);
  const exportInFlight = useRef(false);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  const order = dateRangeProblem(start, end);
  const missing = tried ? missingDate(start, end) : null;
  const problems = {
    start: missing?.field === "start" ? missing.message : undefined,
    end: order ?? (missing?.field === "end" ? missing.message : undefined),
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    const gap = missingDate(start, end);
    if (order || gap) {
      (gap?.field === "start" ? startRef : endRef).current?.focus();
      return;
    }
    onShow(start, end);
  }

  /** The shown dates' CSV from the API, saved under the server's name (or the name it gives). */
  async function exportCsv() {
    if (exportInFlight.current || csvGate) return;
    exportInFlight.current = true;
    setExporting(true);
    setExportProblem(null);
    try {
      const { path, query } = csvRequest(filters);
      const file = await pettyCashDownload(path, { query });
      const filename = file.filename ?? csvFallbackName(filters);
      saveBlob(file.blob, filename);
      onExported(filename);
    } catch (err) {
      // A 401 has already gone back through the hand-off.
      if (!(err instanceof ApiError && err.status === 401))
        setExportProblem(err instanceof ApiError ? err.message : NOT_EXPORTED);
    } finally {
      exportInFlight.current = false;
      setExporting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Date range"
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start"
    >
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Field label="From" error={problems.start} className="sm:w-44">
          {(a11y) => (
            <input
              {...a11y}
              ref={startRef}
              type="date"
              name="start_date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={inputClass(Boolean(problems.start))}
            />
          )}
        </Field>
        <Field label="To" error={problems.end} className="sm:w-44">
          {(a11y) => (
            <input
              {...a11y}
              ref={endRef}
              type="date"
              name="end_date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={inputClass(Boolean(problems.end))}
            />
          )}
        </Field>
      </div>
      {/* Level with the fields' boxes from 640 (the label above them is ~22 px). */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:mt-[26px]">
        <Button kind="secondary" type="submit">
          Show
        </Button>
        {csvGate ? (
          <>
            <Button
              kind="ghost"
              icon={<Icon name="download" />}
              disabled
              aria-describedby="csv-reason"
            >
              Export CSV
            </Button>
            <p id="csv-reason" className="text-body-s text-text-secondary">
              {csvGate}
            </p>
          </>
        ) : (
          <Button
            kind="ghost"
            icon={<Icon name="download" />}
            processing={exporting}
            processingLabel="Exporting…"
            onClick={() => void exportCsv()}
          >
            Export CSV
          </Button>
        )}
      </div>
      {exportProblem ? (
        <InlineAlert tone="danger" className="sm:basis-full">
          {exportProblem}
        </InlineAlert>
      ) : null}
    </form>
  );
}

/**
 * One report as a Part 14 Record row: the day (the row's link - the whole card opens it), the meta
 * line (expenses, who submitted it), Total sales as plain text, the Status pill, and the row's More
 * menu where the API allows anything. A failed publish lists its reasons, each saying whether it is
 * resolved. A publish started here is watched in the row: its pill follows the API's, an Info line
 * while Xero works, a Danger alert with the reasons and Try again when it fails. Mobile = a stacked
 * card; from 768 the amount and the pill sit in their own columns.
 */
function ReportRow({
  row,
  code,
  canPublish,
  entityId,
  entityName,
  onDeleted,
  onPublished,
}: {
  row: HistoryRow;
  code: string | null;
  canPublish: boolean;
  entityId: string;
  entityName: string;
  onDeleted: (day: string) => void;
  onPublished: (day: string) => void;
}) {
  const [dialog, setDialog] = useState<"edit" | "delete" | "publish" | null>(null);
  // A publishing-status read for this row, while the list still shows this row as read.
  const [live, setLive] = useState<{ of: HistoryRow; patch: Partial<HistoryRow> } | null>(null);
  const shown = live && live.of === row ? { ...row, ...live.patch } : row;
  const day = row.transaction_date;
  const publishing = usePublish({
    reportId: row.id,
    // A row already publishing when the list loads is watched too.
    initial: watchedOnArrival(row),
    onStatus: (s) =>
      setLive({
        of: row,
        patch: {
          status_label: s.status_label,
          status_tone: s.status_tone,
          was_published: s.was_published,
          published_at: s.published_at,
          publish_reasons: s.reasons,
        },
      }),
    onPublished: () => onPublished(day),
  });
  const working = isWorking(publishing.state);
  const pill = reportPill(shown);
  const can = rowActions(shown, canPublish && !working);
  const again = shown.status_tone === "success";
  const dialogReport: DialogReport = { id: row.id, day, was_published: shown.was_published };
  // (a section this app does not know is Flask's resume, a full-page address: Link navigates to it in full)
  const href = rowHref(row, entityId, entityName);

  // D15-14: the rare and destructive actions in More, Delete last as Danger.
  const more: MoreItem[] = [
    ...(can.publish
      ? [
          {
            key: "publish",
            label: can.publish,
            icon: "cloud_upload",
            onSelect: () => setDialog("publish"),
          },
        ]
      : []),
    ...(can.edit
      ? [{ key: "edit", label: "Edit report", icon: "edit", onSelect: () => setDialog("edit") }]
      : []),
    ...(can.delete
      ? [
          {
            key: "delete",
            label: "Delete report",
            icon: "delete",
            danger: true,
            onSelect: () => setDialog("delete"),
          },
        ]
      : []),
  ];

  return (
    <li className="relative flex min-w-0 flex-col gap-3 rounded-lg border border-border-subtle bg-surface-card p-4 hover:bg-state-hover">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <div className="flex min-w-0 flex-col gap-0.5 md:flex-1">
            {/* The row's one link - a submitted report's Daily Report, a draft's stage (lib/history.ts's rowHref);
                its ::after spreads over the card, so the whole card opens it (Part 14 Record row). */}
            <Link
              href={href}
              className="w-fit text-body-m font-semibold text-text-primary outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-border-focus"
            >
              {formatWeekdayDay(day)}
            </Link>
            <p className="min-w-0 break-words text-body-s text-text-secondary">
              <span translate="no">{rowMeta(row, code)}</span>
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 md:contents">
            {/* Total sales: plain text, never coloured, right-aligned in its own 160 track from 768. */}
            <p className="flex min-w-0 items-baseline gap-1.5 md:w-40 md:flex-col md:items-end md:gap-0">
              <span className="text-body-s text-text-secondary md:order-2">Sales</span>
              <span
                className="min-w-0 break-all text-body-m text-text-primary md:text-right"
                translate="no"
              >
                {money(row.total_sales, code)}
              </span>
            </p>
            <span className="flex md:w-40 md:justify-end">
              <StatusPill label={pill.label} tone={pill.tone} />
            </span>
          </div>
        </div>
        {/* After the link in the page's order, so it sits above the link's ::after and keeps its own click. */}
        {more.length ? (
          <MoreMenu label={`More actions for ${formatWeekdayDay(day)}`} items={more} />
        ) : (
          <span className="hidden w-11 shrink-0 md:block" aria-hidden />
        )}
      </div>

      {/* A publish started here: above the card's link, so its actions keep their own click. A failure
          carries its reasons, so the read's own list steps aside meanwhile. */}
      <PublishProgress
        state={publishing.state}
        onCheckAgain={publishing.begin}
        onRetry={can.publish ? () => setDialog("publish") : undefined}
        className="relative"
      />
      {publishing.state.kind !== "failed" && shown.publish_reasons.length ? (
        <div className="flex min-w-0 flex-col gap-1 rounded-md bg-surface-sunk p-3">
          <p className="text-body-s font-semibold text-text-primary">
            Why it didn&apos;t reach Xero
          </p>
          <PublishReasons reasons={shown.publish_reasons} />
        </div>
      ) : null}

      {dialog === "publish" ? (
        <PublishDialog
          reportId={row.id}
          again={again}
          wasPublished={shown.was_published}
          reconnectHref={integrationUrl(entityId, entityName)}
          onCancel={() => setDialog(null)}
          onStarted={() => {
            setDialog(null);
            publishing.begin();
          }}
        />
      ) : null}
      {dialog === "edit" ? (
        <EditReportDialog
          report={dialogReport}
          entityId={entityId}
          entityName={entityName}
          onCancel={() => setDialog(null)}
        />
      ) : null}
      {dialog === "delete" ? (
        <DeleteReportDialog
          report={dialogReport}
          onCancel={() => setDialog(null)}
          onDeleted={(answer) => {
            setDialog(null);
            onDeleted(answer.transaction_date);
          }}
        />
      ) : null}
    </li>
  );
}

/**
 * Part 14 Pagination: "Showing 1–10 of 41", rows per page (10/25/50/100), and the pages - links in
 * the address, so they keep the filters. Targets are 36 for a pointer and 44 for touch (by the
 * input, not the width). A phone gets Previous / Next and "Page 2 of 5" only.
 */
function Pager({
  page,
  filters,
  hrefOf,
  onPerPage,
}: {
  page: HistoryPage;
  filters: Filters;
  hrefOf: (f: Filters) => string;
  onPerPage: (perPage: number) => void;
}) {
  const current = page.page;
  const last = page.total_pages;
  const target =
    "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border text-body-s font-medium tabular-nums pointer-coarse:size-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus";
  const idle = `${target} border-border-default text-text-secondary hover:bg-state-hover`;
  const disabled = `${target} cursor-not-allowed border-border-default text-text-disabled`;

  const step = (to: number, label: string, icon: string) =>
    to < 1 || to > last ? (
      <span className={disabled} aria-disabled="true" role="link" aria-label={label}>
        <Icon name={icon} size="md" />
      </span>
    ) : (
      <Link href={hrefOf({ ...filters, page: to })} className={idle} aria-label={label}>
        <Icon name={icon} size="md" />
      </Link>
    );

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-body-s tabular-nums text-text-secondary" aria-live="polite">
        {rangeText(current, page.per_page, page.total_count)}
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        <label htmlFor="rows-per-page" className="text-body-s text-text-secondary">
          Rows per page
        </label>
        <div className="relative w-24">
          <select
            id="rows-per-page"
            value={filters.perPage}
            onChange={(e) => onPerPage(Number(e.target.value))}
            className={`${inputClass(false)} cursor-pointer appearance-none pr-9`}
          >
            {PER_PAGE.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <Icon
            name="expand_more"
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary"
          />
        </div>
        {last > 1 ? (
          <nav aria-label="Pagination" className="flex min-w-0 flex-wrap items-center gap-1.5">
            {step(current - 1, "Previous page", "chevron_left")}
            <span className="px-1 text-body-s tabular-nums text-text-secondary sm:hidden">
              Page {current} of {last}
            </span>
            {pagerItems(current, last).map((item, i) =>
              item === "gap" ? (
                <span
                  key={`gap-${i}`}
                  className="hidden size-9 items-center justify-center text-body-s text-text-muted sm:inline-flex"
                  aria-hidden
                >
                  …
                </span>
              ) : (
                <Link
                  key={item}
                  href={hrefOf({ ...filters, page: item })}
                  aria-label={`Page ${item}`}
                  aria-current={item === current ? "page" : undefined}
                  className={`${target} max-sm:hidden ${
                    item === current
                      ? "border-border-selected bg-state-selected font-semibold text-text-link"
                      : "border-border-default text-text-secondary hover:bg-state-hover"
                  }`}
                >
                  {item}
                </Link>
              ),
            )}
            {step(current + 1, "Next page", "chevron_right")}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
