"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from "react";

import { PhoneCard } from "@/components/flask/PhoneCard";
import { useToast } from "@/components/flask/Toasts";
import { RangeCalendar } from "@/components/history/RangeCalendar";
import { DeleteReportModal, useEditReport } from "@/components/report/ReportActions";
import { usePublish, type PublishAsk } from "@/components/report/Publish";
import { LoadingOverlay } from "@/components/report/ReportChrome";
import { entityAcronym } from "@/lib/acronym";
import { ApiError, pettyCashDownload, pettyCashFetch } from "@/lib/apiClient";
import { pettyCashHome, reportHref } from "@/lib/companyPages";
import {
  CSV_EXPORTED,
  CSV_EXPORT_PATH,
  HISTORY_DELETED,
  csvFileName,
  csvQuery,
  dayParts,
  draftStep,
  fieldDate,
  historyAmount,
  historyBadge,
  historyHref,
  historyQuery,
  historyStamp,
  pagerItems,
  pickDay,
  pickedRange,
  shownRange,
  type HistoryFilters,
  type HistoryPage,
  type HistoryRow,
} from "@/lib/history";
import { useAuth } from "@/lib/useAuth";
import { stepHref } from "@/lib/wizardPages";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";

/** Hand a file to the browser's downloads: an object URL on a temporary `<a download>`. */
function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // after the click has started the download
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

type Load =
  | { kind: "loading" }
  | { kind: "ready"; page: HistoryPage }
  | { kind: "refused"; message: string }
  | { kind: "failed"; message: string };

/** Flask's `amount()` macro sizes, by how long the figure is. */
const AMOUNT_SIZE = [
  "text-[10px] min-[414px]:text-xs min-[640px]:text-sm min-[1024px]:text-lg",
  "text-[9px] min-[414px]:text-[11px] min-[640px]:text-xs min-[1024px]:text-base",
  "text-[8px] min-[414px]:text-[9px] min-[640px]:text-[10px] min-[1024px]:text-xs",
];
// Flask's columns are a fixed 62 / 74 / 90 / 116px; here those are minimums, so a long figure widens
// its column instead of running into the next one (see the amounts' row below)
const AMOUNT_COL = "flex flex-col min-[640px]:min-w-[90px] min-[1024px]:min-w-[116px]";
const AMOUNT_LABEL =
  "text-[10px] min-[414px]:text-xs min-[640px]:text-sm min-[1024px]:text-xl font-semibold text-flask-gray-600";

const BADGE_LOOK: Record<ReturnType<typeof historyBadge>, { bg: string; ink: string }> = {
  Published: { bg: "bg-flask-badge-published-bg", ink: "text-flask-badge-published-ink" },
  "Publish failed": { bg: "bg-flask-badge-published-bg", ink: "text-flask-badge-published-ink" },
  Draft: { bg: "bg-flask-submitted", ink: "text-flask-badge-draft-ink" },
  Submitted: { bg: "bg-flask-red-soft", ink: "text-flask-red" },
};

const PAGER =
  "px-3 py-2 text-sm sm:px-4 sm:py-2 sm:text-base border border-flask-gray-300 rounded-flask-xl text-center";
const PAGER_LINK = `${PAGER} text-flask-gray-700 hover:bg-flask-gray-50 transition-colors`;
// 44px high for a finger without moving Flask's layout (the pager's 36px buttons, the 32px ⋮ and chevron)
const TALLER = "relative before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']";
const MENU_ITEM =
  "w-full px-4 py-3 hover:bg-flask-gray-50 transition-colors cursor-pointer flex items-center text-flask-gray-600 text-left";

/**
 * Report history - a pixel-faithful port of Flask's ORIGINAL `report_history/report_history.html`
 * (Minty `1c25b35^1`), at Flask's `/entity/<id>/petty-cash/reports`. Reads `GET /reports` (Minty
 * `petty_cash_api/routes/history.py`) with the address's dates and page, ten a page.
 *
 * - The header (back to the dashboard), the Start / End Date fields over Flask's range calendar
 *   (Clear, Search Report) and the CSV export - `GET /reports/export.csv` for both dates, saved
 *   under the name the API gives; Flask's "Exporting..." and toast, a refusal's sentence as a toast.
 * - "Report Results": a row per day, newest first - the date and its weekday circle, Sales and
 *   Expenses, the badge (a failed publish's reasons on hover or a tap), when and by whom, the ⋮
 *   menu (Edit, Delete, View, Publish / Republish) and the chevron (View). Then the pager.
 * - Edit: `POST /reports/<id>/reopen` as on a report's view. Delete: the view's modal, then the
 *   list again in place with Flask's "That report is deleted.". Publish / Republish: Flask's own
 *   (Publish.tsx) - the republish confirm, the overlay while it polls, the outcome as Flask's toast,
 *   then the list again in place.
 *
 * A bad filter in the address is the API's 422 sentence; any other failure says so with a retry.
 */
export function ReportHistory({ filters }: { filters: HistoryFilters }) {
  const auth = useAuth();
  const toast = useToast();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const filtered = !!(filters.start && filters.end);

  const { start, end, page } = filters;
  const read = useCallback(
    () =>
      pettyCashFetch<HistoryPage>("/reports", { query: historyQuery({ start, end, page }) }).then(
        (answer): Load => ({ kind: "ready", page: answer }),
        (err: unknown): Load | null => {
          // A 401 has already gone back through the hand-off.
          if (err instanceof ApiError && err.status === 401) return null;
          if (err instanceof ApiError && err.status === 422)
            return { kind: "refused", message: err.message };
          return { kind: "failed", message: err instanceof ApiError ? err.message : UNREACHABLE };
        },
      ),
    [start, end, page],
  );

  useEffect(() => {
    let live = true;
    void read().then((next) => {
      if (live && next) setLoad(next);
    });
    return () => {
      live = false;
    };
  }, [read, attempt]);

  // Flask's "Filter applied", once, on a page that carries the dates
  const said = useRef(false);
  useEffect(() => {
    if (!filtered || said.current) return;
    said.current = true;
    toast("Filter applied", "info");
  }, [filtered, toast]);

  const acronym = entityAcronym(auth?.entityName);
  if (!auth) return <PhoneCard acronym={acronym}>{null}</PhoneCard>;
  return (
    <HistoryBody
      load={load}
      filters={filters}
      entityId={auth.entityId}
      entityName={auth.entityName}
      acronym={acronym}
      retry={() => {
        setLoad({ kind: "loading" });
        setAttempt((n) => n + 1);
      }}
      reload={async () => {
        const next = await read();
        if (next) setLoad(next);
      }}
    />
  );
}

function HistoryBody({
  load,
  filters,
  entityId,
  entityName,
  acronym,
  retry,
  reload,
}: {
  load: Load;
  filters: HistoryFilters;
  entityId: string;
  entityName: string;
  acronym: string;
  retry: () => void;
  reload: () => Promise<void>;
}) {
  const toast = useToast();
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(
    filters.start && filters.end ? [filters.start, filters.end] : [],
  );
  const [calendar, setCalendar] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<HistoryRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // a ref, not state: a second click in the same frame must see the first one
  const acting = useRef(false);
  const edit = useEditReport(entityId, entityName, acting);
  const publish = usePublish({
    place: "history",
    entityId,
    entityName,
    onChanged: () => void reload(),
  });
  const closeCalendar = useCallback(() => setCalendar(false), []);
  const range = pickedRange(picked);
  const csv = csvQuery(range.start, range.end);

  useEffect(() => {
    if (menu === null) return;
    const onDown = (e: globalThis.MouseEvent) => {
      if (!(e.target as Element).closest?.("[data-row-menu]")) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  /** A link inside this app goes there without a reload. */
  function inApp(e: MouseEvent<HTMLAnchorElement>, href: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    router.push(href);
  }

  function search() {
    setCalendar(false);
    if (!range.start || !range.end) {
      toast("Please choose or enter a valid date range", "error");
      return;
    }
    if (range.start > range.end) {
      toast("Start date cannot be after end date", "error");
      return;
    }
    router.push(historyHref(entityId, entityName, { start: range.start, end: range.end, page: 1 }));
  }

  function clear() {
    setPicked([]);
    setCalendar(false);
    if (filters.start || filters.end) router.push(historyHref(entityId, entityName));
  }

  /** The API's CSV for both dates, saved under the name it gives; a refusal shows its sentence. */
  async function exportCsv() {
    if (!csv || exporting) return;
    setExporting(true);
    try {
      const file = await pettyCashDownload(CSV_EXPORT_PATH, { query: csv });
      saveFile(file.blob, file.filename ?? csvFileName(csv.start_date, csv.end_date));
      toast(CSV_EXPORTED, "success");
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401))
        toast(err instanceof ApiError ? err.message : UNREACHABLE, "error");
    } finally {
      setExporting(false);
    }
  }

  async function remove(row: HistoryRow) {
    if (acting.current) return;
    acting.current = true;
    setConfirmDelete(null);
    setBusy("Deleting report...");
    try {
      await pettyCashFetch(`/reports/${encodeURIComponent(row.id)}`, { method: "DELETE" });
      await reload();
      toast(HISTORY_DELETED, "success");
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401))
        toast(err instanceof ApiError ? err.message : UNREACHABLE, "error");
    } finally {
      acting.current = false;
      setBusy(null);
    }
  }

  // Flask's sticky filter (z-40 there); under this app's overlays here, which sit at z-30
  const toolbar = (
    <div className="relative z-20 flex-shrink-0 bg-flask-gray-50 px-6 py-2">
      <div className="mb-6">
        <div className="relative -mx-6 mb-4 px-6">
          <div className="flex items-end gap-2">
            {(
              [
                ["startDateDisplay", "Start Date", range.start],
                ["endDateDisplay", "End Date", picked.length ? range.end : ""],
              ] as const
            ).map(([id, label, value]) => (
              <div key={id} className="min-w-0 flex-1">
                <label htmlFor={id} className="mb-1 block text-xs font-semibold text-flask-teal">
                  {label}
                </label>
                <input
                  id={id}
                  type="text"
                  readOnly
                  data-range-field
                  placeholder="DD/MMM/YYYY"
                  value={fieldDate(value)}
                  onClick={() => setCalendar(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") search();
                    else if (e.key === " " || e.key === "ArrowDown") {
                      e.preventDefault();
                      setCalendar(true);
                    }
                  }}
                  aria-haspopup="dialog"
                  className="w-full cursor-pointer rounded-flask-xl border border-flask-gray-300 bg-flask-white px-3 py-3 text-sm text-flask-gray-700 placeholder:text-flask-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-flask-teal"
                />
              </div>
            ))}
          </div>
          {calendar ? (
            <RangeCalendar
              picked={picked}
              onPick={(day) => setPicked((p) => pickDay(p, day))}
              onClear={clear}
              onSearch={search}
              onClose={closeCalendar}
            />
          ) : null}
        </div>

        <div className="flex space-x-2">
          <button
            type="button"
            onClick={() => void exportCsv()}
            // without both dates there is nothing to export
            disabled={!csv || exporting}
            className={`flex flex-1 items-center justify-center rounded-flask-xl bg-flask-teal px-4 py-3 font-medium text-flask-white transition-colors ${csv && !exporting ? "hover:bg-flask-teal/80" : "cursor-not-allowed opacity-50"}`}
          >
            {exporting ? (
              <>
                <svg
                  className="mr-2 h-5 w-5 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Exporting...
              </>
            ) : (
              <>
                <svg
                  width="15"
                  height="16"
                  viewBox="0 0 11 12"
                  fill="none"
                  className="mr-2"
                  aria-hidden="true"
                >
                  <path
                    d="M0.501831 10.3763H10.9981V11.543H0.501831V10.3763ZM6.33308 6.9813L9.87848 3.43464L10.6949 4.26297L5.74996 9.20964L0.805056 4.26297L1.62143 3.43464L5.16683 6.9813V0.459636H6.33308V6.9813Z"
                    className="fill-flask-white"
                  />
                </svg>
                CSV
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  const overlays = (
    <>
      {busy ? <LoadingOverlay text={busy} /> : null}
      {confirmDelete ? (
        <DeleteReportModal
          wasPublished={confirmDelete.was_published}
          onCancel={() => setConfirmDelete(null)}
          onDelete={() => void remove(confirmDelete)}
        />
      ) : null}
      {publish.ui}
    </>
  );

  const page = load.kind === "ready" ? load.page : null;
  return (
    <PhoneCard
      acronym={acronym}
      backHref={pettyCashHome(entityId, entityName)}
      toolbar={toolbar}
      overlays={overlays}
      flush
    >
      <div className="space-y-4 bg-flask-gray-50 p-6 pt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-flask-gray-900">Report Results</h2>
        </div>
        {load.kind === "loading" ? (
          <p className="text-sm text-flask-gray-500" role="status">
            Loading…
          </p>
        ) : null}
        {load.kind === "refused" ? (
          <p className="text-sm text-flask-danger-ink" role="alert">
            {load.message}
          </p>
        ) : null}
        {load.kind === "failed" ? (
          <div className="rounded-flask-2xl bg-flask-white p-4" role="alert">
            <p className="text-sm text-flask-gray-700">{load.message}</p>
            <button
              type="button"
              onClick={retry}
              className="mt-4 rounded-flask-xl bg-flask-teal px-4 py-3 font-medium text-flask-white transition-colors hover:bg-flask-teal/80"
            >
              Try again
            </button>
          </div>
        ) : null}
        {page?.reports.map((row) => (
          <HistoryEntry
            key={row.id}
            row={row}
            currencyCode={page.currency_code}
            canPublish={page.can_publish}
            entityId={entityId}
            entityName={entityName}
            menuOpen={menu === row.id}
            onMenu={() => setMenu((open) => (open === row.id ? null : row.id))}
            onEdit={() => {
              setMenu(null);
              void edit(row.id, row.was_published);
            }}
            onDelete={() => {
              setMenu(null);
              setConfirmDelete(row);
            }}
            onPublish={(ask) => {
              setMenu(null);
              if (!acting.current) publish.ask(ask);
            }}
            inApp={inApp}
          />
        ))}
      </div>

      {page && page.total_pages > 1 ? (
        <Pager
          page={page}
          filters={filters}
          entityId={entityId}
          entityName={entityName}
          inApp={inApp}
        />
      ) : null}

      {page && page.reports.length === 0 ? (
        <div className="py-12 text-center">
          <svg
            className="mx-auto mb-4 h-12 w-12 text-flask-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mb-2 text-lg font-medium text-flask-gray-900">No reports found</h3>
          <p className="text-flask-gray-500">Try adjusting your date range or search criteria.</p>
        </div>
      ) : null}
    </PhoneCard>
  );
}

type InApp = (e: MouseEvent<HTMLAnchorElement>, href: string) => void;

/** One day's row, Flask's `.report-entry`. */
function HistoryEntry({
  row,
  currencyCode,
  canPublish,
  entityId,
  entityName,
  menuOpen,
  onMenu,
  onEdit,
  onDelete,
  onPublish,
  inApp,
}: {
  row: HistoryRow;
  currencyCode: string | null;
  canPublish: boolean;
  entityId: string;
  entityName: string;
  menuOpen: boolean;
  onMenu: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPublish: (ask: PublishAsk) => void;
  inApp: InApp;
}) {
  const tipId = useId();
  const menuId = useId();
  // a failed publish's reasons: on hover as in Flask, and on a tap (a phone has no hover)
  const [tip, setTip] = useState(false);
  const day = dayParts(row.transaction_date);
  const badge = historyBadge(row);
  const look = BADGE_LOOK[badge];
  const reasons = badge === "Publish failed" && row.publish_reasons.length > 0;
  const draft = row.status === "draft";
  // a draft resumes at its own step of the wizard, in this app
  const view = draft
    ? stepHref(entityId, entityName, draftStep(row), row.transaction_date)
    : reportHref(entityId, entityName, row.id, "summary");
  const open = (e: MouseEvent<HTMLAnchorElement>) => inApp(e, view);
  const sales = historyAmount(row.total_sales, currencyCode);
  const expenses = historyAmount(row.total_expenses, currencyCode);
  const republish = badge === "Published" || badge === "Publish failed";
  // Flask's rule: Republish always confirms, warning of duplicates only for a report fully in Xero
  // (a partly published one is re-sent selectively); Publish confirms only for one edited after a publish
  const ask: PublishAsk = {
    reportId: row.id,
    confirm: republish
      ? { duplicate: badge === "Published" }
      : row.was_published
        ? { duplicate: true }
        : null,
  };

  return (
    <div className="rounded-flask-2xl bg-flask-white p-4" data-report-id={row.id}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center justify-between gap-0.5 min-[414px]:gap-1 min-[640px]:gap-2">
            <div className="flex flex-col items-center gap-1 min-[414px]:gap-1.5 min-[640px]:gap-2">
              <span className="text-[8px] text-flask-gray-600 min-[414px]:text-[9px] min-[640px]:text-[10px] min-[1024px]:text-sm">
                {day.date}
              </span>
              <div
                className={`${day.weekend ? "bg-flask-weekend" : "bg-flask-teal"} flex h-[40px] w-[40px] items-center justify-center rounded-full text-flask-white min-[414px]:h-[45px] min-[414px]:w-[45px] min-[640px]:h-[50px] min-[640px]:w-[50px]`}
              >
                <span className="text-[10px] font-semibold min-[414px]:text-xs min-[640px]:text-sm">
                  {day.weekday}
                </span>
              </div>
            </div>
            {/* Below 640px Sales sits over Expenses: side by side, Flask's row ran past the card at a
                phone's width (a "Publish failed" badge, a six-figure amount). From 640px, Flask's row. */}
            <div className="flex min-w-0 flex-col items-start gap-1 min-[640px]:flex-1 min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-center min-[640px]:gap-12 min-[1024px]:gap-16 min-[1280px]:gap-40">
              <div className={AMOUNT_COL}>
                <span className={AMOUNT_LABEL}>Sales</span>
                <span className={`${AMOUNT_SIZE[sales.tier]} font-semibold text-flask-green`}>
                  {sales.text}
                </span>
              </div>
              <div className={AMOUNT_COL}>
                <span className={AMOUNT_LABEL}>Expenses</span>
                <span className={`${AMOUNT_SIZE[expenses.tier]} font-semibold text-flask-red-500`}>
                  {expenses.text}
                </span>
              </div>
            </div>
            <div className="flex flex-col min-[414px]:mr-4 min-[640px]:mr-6 min-[1024px]:mr-20">
              <div
                className={`relative ${reasons ? "group cursor-help has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-flask-badge-published-ink" : ""} inline-flex w-fit flex-col rounded-flask-lg px-1.5 py-1 min-[414px]:px-2 min-[414px]:py-1.5 min-[640px]:px-3 min-[640px]:py-2 ${look.bg}`}
              >
                {reasons ? (
                  <button
                    type="button"
                    onClick={() => setTip((open) => !open)}
                    onBlur={() => setTip(false)}
                    aria-expanded={tip}
                    aria-describedby={tipId}
                    className={`inline-flex cursor-help items-center whitespace-nowrap text-[9px] font-medium focus:outline-none min-[414px]:text-[10px] min-[640px]:text-xs ${look.ink}`}
                  >
                    {badge}
                    <svg
                      className="ml-1 h-3 w-3 shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                ) : (
                  <span
                    className={`inline-flex items-center whitespace-nowrap text-[9px] font-medium min-[414px]:text-[10px] min-[640px]:text-xs ${look.ink}`}
                  >
                    {badge}
                  </span>
                )}
                {reasons ? (
                  <div
                    id={tipId}
                    role="tooltip"
                    className={`absolute right-0 top-full z-[60] mt-2 ${tip ? "block" : "hidden"} w-max max-w-[16rem] rounded-flask-lg bg-flask-gray-900 px-3 py-2 text-left text-[11px] font-normal normal-case leading-snug text-flask-white shadow-flask-xl group-hover:block group-has-[:focus-visible]:block min-[640px]:max-w-[18rem]`}
                  >
                    <span className="absolute -top-1 right-3 h-2 w-2 rotate-45 bg-flask-gray-900" />
                    <p className="mb-1 font-semibold">Publish issues:</p>
                    <ul className="space-y-1 whitespace-normal break-words">
                      {row.publish_reasons.map((reason, i) => (
                        <li
                          key={i}
                          className={`flex items-start gap-1.5 ${reason.resolved ? "rounded bg-flask-green-500/20 px-1 py-0.5" : ""}`}
                        >
                          {reason.resolved ? (
                            <>
                              <svg
                                className="mt-px h-3 w-3 shrink-0 text-flask-green-400"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                                role="img"
                                aria-label="Resolved"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.3 3.3 6.8-6.8a1 1 0 011.4 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              <span className="text-flask-green-300 line-through">
                                {reason.text}
                              </span>
                            </>
                          ) : (
                            <>
                              <svg
                                className="mt-px h-3 w-3 shrink-0 text-flask-red-400"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                                aria-hidden="true"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M10 8.586 5.707 4.293 4.293 5.707 8.586 10l-4.293 4.293 1.414 1.414L10 11.414l4.293 4.293 1.414-1.414L11.414 10l4.293-4.293-1.414-1.414L10 8.586z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              <span>{reason.text}</span>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
              <div className="mt-0.5 flex flex-col text-[8px] text-flask-gray-600 min-[414px]:mt-1 min-[414px]:text-[9px] min-[640px]:text-[10px] min-[1024px]:text-sm">
                <span>{historyStamp(row)}</span>
                <span>by {row.submitted_by ?? ""}</span>
              </div>
            </div>
            <div className="flex flex-col items-center space-y-2" data-row-menu>
              <div className="relative">
                <button
                  type="button"
                  onClick={onMenu}
                  title="Actions"
                  aria-label="Actions"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-controls={menuOpen ? menuId : undefined}
                  className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-flask-gray-50 text-flask-gray-400 transition-colors before:absolute before:-inset-x-1.5 before:-bottom-1 before:-top-2 before:content-[''] hover:bg-flask-gray-50"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <circle cx="10" cy="5" r="1.5" fill="currentColor" />
                    <circle cx="10" cy="10" r="1.5" fill="currentColor" />
                    <circle cx="10" cy="15" r="1.5" fill="currentColor" />
                  </svg>
                </button>
                {menuOpen ? (
                  <div
                    id={menuId}
                    role="menu"
                    aria-label="Actions"
                    className="absolute right-0 top-full z-40 mt-2 min-w-[152px] rounded-flask-xl border border-flask-gray-200 bg-flask-white py-2 shadow-flask-xl"
                  >
                    <div className="flex flex-col">
                      {row.permissions.edit ? (
                        <button
                          type="button"
                          role="menuitem"
                          title="Edit Report"
                          onClick={onEdit}
                          className={MENU_ITEM}
                        >
                          <span className="text-sm font-medium">Edit</span>
                        </button>
                      ) : null}
                      {row.permissions.delete ? (
                        <button
                          type="button"
                          role="menuitem"
                          title="Delete Report"
                          onClick={onDelete}
                          className={MENU_ITEM}
                        >
                          <span className="text-sm font-medium">Delete</span>
                        </button>
                      ) : null}
                      <a
                        href={view}
                        role="menuitem"
                        title="View Report"
                        onClick={open}
                        className={MENU_ITEM}
                      >
                        <span className="text-sm font-medium">View</span>
                      </a>
                      {canPublish ? (
                        draft ? (
                          <span
                            role="menuitem"
                            aria-disabled="true"
                            title="Please finish the report before publishing"
                            className={`${MENU_ITEM} cursor-not-allowed opacity-50 hover:bg-transparent`}
                          >
                            <span className="text-sm font-medium">Publish</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            role="menuitem"
                            title={republish ? "Republish to Xero" : "Publish to Xero"}
                            onClick={() => onPublish(ask)}
                            className={MENU_ITEM}
                          >
                            <span className="text-sm font-medium">
                              {republish ? "Republish" : "Publish"}
                            </span>
                          </button>
                        )
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
              <a
                href={view}
                onClick={open}
                title="View Report"
                aria-label={`View the ${day.date} report`}
                className="group relative flex h-8 w-8 cursor-pointer items-center justify-center text-flask-gray-400 transition-colors before:absolute before:-inset-x-1.5 before:-bottom-2 before:-top-1 before:content-['']"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Flask's pager: "Showing 1 to 10 of 23 reports" ("1-10/23" on a phone), Previous, the pages, Next. */
function Pager({
  page,
  filters,
  entityId,
  entityName,
  inApp,
}: {
  page: HistoryPage;
  filters: HistoryFilters;
  entityId: string;
  entityName: string;
  inApp: InApp;
}) {
  const { from, to } = shownRange(page.page, page.total_count);
  const href = (p: number) =>
    historyHref(entityId, entityName, { start: filters.start, end: filters.end, page: p });
  const step = (p: number, label: string, on: boolean) =>
    on ? (
      <a
        href={href(p)}
        onClick={(e) => inApp(e, href(p))}
        className={`${PAGER_LINK} ${TALLER} min-w-[70px] font-medium`}
      >
        {label}
      </a>
    ) : (
      <span
        aria-disabled="true"
        className={`${PAGER} min-w-[70px] cursor-not-allowed font-medium text-flask-gray-400 opacity-50`}
      >
        {label}
      </span>
    );
  return (
    <nav aria-label="Pages" className="border-t border-flask-gray-200 px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="whitespace-nowrap text-center text-xs text-flask-gray-600 sm:text-left sm:text-sm">
          <span className="hidden sm:inline">Showing </span>
          <span className="font-medium">{from}</span>
          <span className="hidden sm:inline"> to </span>
          <span className="sm:hidden">-</span>
          <span className="font-medium">{to}</span>
          <span className="hidden sm:inline"> of </span>
          <span className="sm:hidden">/</span>
          <span className="font-medium">{page.total_count}</span>
          <span className="hidden sm:inline"> reports</span>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-center gap-1.5 sm:gap-2">
          {step(page.page - 1, "Previous", page.page > 1)}
          {/* the numbers wrap too: on the 640px card Flask's ran off its edge */}
          <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
            {pagerItems(page.page, page.total_pages).map((p, i) =>
              p === "gap" ? (
                <span
                  key={`gap-${i}`}
                  className="px-1 text-sm text-flask-gray-400 sm:px-2 sm:text-base"
                >
                  ...
                </span>
              ) : p === page.page ? (
                <span
                  key={p}
                  aria-current="page"
                  className="min-w-[36px] rounded-flask-xl bg-flask-teal px-3 py-2 text-center text-sm font-medium text-flask-white sm:min-w-[44px] sm:px-4 sm:py-2 sm:text-base"
                >
                  {p}
                </span>
              ) : (
                <a
                  key={p}
                  href={href(p)}
                  onClick={(e) => inApp(e, href(p))}
                  className={`${PAGER_LINK} ${TALLER} min-w-[36px] sm:min-w-[44px]`}
                >
                  {p}
                </a>
              ),
            )}
          </div>
          {step(page.page + 1, "Next", page.page < page.total_pages)}
        </div>
      </div>
    </nav>
  );
}
