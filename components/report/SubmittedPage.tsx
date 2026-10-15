"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { useToast } from "@/components/flask/Toasts";
import { ShareButton, ShareModal, useShareLink } from "@/components/report/ReportActions";
import { LoadingOverlay } from "@/components/report/ReportChrome";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { getAuth } from "@/lib/auth";
import { pettyCashHome } from "@/lib/companyPages";
import { setNextDay } from "@/lib/flash";
import { submittedUrl } from "@/lib/flaskPages";
import { publishLabel, submittedHeading, type ReportOutcome } from "@/lib/report";
import { useAuth } from "@/lib/useAuth";
import { stepHref } from "@/lib/wizardPages";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";

/**
 * Flask's Submitted page frame (`report/submitted.html`): the phone card with no header, its content
 * centred. The content sits in an auto-margined box so that, when it is taller than the screen
 * (a short phone, text at 200%), it scrolls from its top instead of being cut off above it.
 */
function Frame({ children, overlays }: { children: ReactNode; overlays?: ReactNode }) {
  return (
    <div className="flask-main-container">
      <div className="relative flex h-screen w-full flex-col overflow-hidden bg-flask-gray-50 shadow-flask-xl">
        <div className="flex flex-1 flex-col overflow-y-auto px-4 text-center">
          <div className="my-auto flex flex-col items-center py-4">{children}</div>
        </div>
        {overlays}
      </div>
    </div>
  );
}

/**
 * The page after a day is submitted - a pixel-faithful port of Flask's ORIGINAL
 * `report/submitted.html`, at Flask's `/entity/<id>/petty-cash/reports/<report id>/submitted`: the
 * teal tick, "Report Submitted / Successfully!" ("Report Published to Xero" once it is in Xero),
 * Export Options (Share), then Publish to Xero, Back to Dashboard and Continue to next day report.
 * Reads `GET /reports/<id>/outcome` (Minty `petty_cash_api/routes/close.py`).
 *
 * Publishing to Xero is not ported: its button is a full-page link to Flask's own Submitted page,
 * where the person publishes. "Continue to next day report" asks the dashboard to start the next
 * day (Flask's `autoStartNextDay`, lib/flash.ts).
 */
export function SubmittedPage({ reportId }: { reportId: string }) {
  const toast = useToast();
  const auth = useAuth();
  const router = useRouter();
  const [outcome, setOutcome] = useState<ReportOutcome | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    pettyCashFetch<ReportOutcome>(`/reports/${encodeURIComponent(reportId)}/outcome`)
      .then((answer) => {
        if (!live) return;
        const company = getAuth();
        // reopened since: nothing is submitted, so its own place is the wizard's Ending step
        if (!answer.submitted && company) router.replace(stepHref(company.entityId, company.entityName, "ending", answer.transaction_date));
        else setOutcome(answer);
      })
      .catch((err: unknown) => {
        if (!live || (err instanceof ApiError && err.status === 401)) return;
        setFailed(true);
        toast(err instanceof ApiError ? err.message : UNREACHABLE, "error");
      });
    return () => {
      live = false;
    };
  }, [reportId, toast, router]);

  if (!outcome || !auth) {
    return (
      <Frame>
        {!failed ? (
          <p className="text-sm text-flask-gray-500" role="status">
            Loading…
          </p>
        ) : null}
      </Frame>
    );
  }
  return <Submitted outcome={outcome} entityId={auth.entityId} entityName={auth.entityName} />;
}

function Submitted({ outcome, entityId, entityName }: { outcome: ReportOutcome; entityId: string; entityName: string }) {
  const router = useRouter();
  const share = useShareLink(outcome.report_id);
  const [busy, setBusy] = useState<string | null>(null);
  const [first, second] = submittedHeading(outcome.xero);
  const home = pettyCashHome(entityId, entityName);

  function toDashboard() {
    setBusy("Redirecting to Dashboard...");
    router.push(home);
  }

  function nextDay() {
    setBusy("Starting next day report...");
    setNextDay(outcome.next_day);
    router.push(home);
  }

  const overlays = (
    <>
      {busy ? <LoadingOverlay text={busy} /> : null}
      {share.link ? <ShareModal url={share.link.url} onClose={share.close} /> : null}
    </>
  );

  return (
    <Frame overlays={overlays}>
      <div className="flex size-20 items-center justify-center rounded-full bg-flask-teal text-flask-white shadow-flask-lg">
        <svg xmlns="http://www.w3.org/2000/svg" className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <h1 className="mt-8 text-2xl font-semibold leading-tight text-flask-slate-800">
        {first}
        <br />
        {second}
      </h1>
      <p className="mt-6 text-xs text-flask-slate-500">Your daily petty cash report has been processed</p>

      <p className="mb-4 mt-20 text-sm tracking-wide text-flask-slate-700">Export Options</p>
      <div className="mt-4 flex items-start justify-center gap-8 sm:gap-12">
        <ShareButton onClick={() => void share.open()} />
      </div>

      <div className="w-full max-w-md space-y-3 pt-8">
        {outcome.can_publish ? (
          <a
            href={submittedUrl(entityId, outcome.report_id)}
            className="flex w-full items-center justify-center gap-3 rounded-flask-xl bg-flask-white px-4 py-3 text-flask-slate-700 shadow-flask-md ring-1 ring-flask-slate-200 transition hover:shadow-flask-lg"
          >
            <Image src="/img/xero-logo.webp" alt="Xero Logo" width={24} height={24} unoptimized className="h-5 w-5 sm:h-6 sm:w-6" />
            <span className="text-sm font-medium">{publishLabel(outcome.xero)}</span>
          </a>
        ) : null}

        <button
          type="button"
          onClick={toDashboard}
          disabled={busy !== null}
          className="group flex w-full items-center justify-center gap-4 rounded-flask-xl bg-flask-teal px-4 py-3 font-medium text-flask-white shadow-flask-md transition-colors hover:bg-flask-teal/80"
        >
          <span>Back to Dashboard</span>
          <svg className="transition-transform duration-300 group-hover:translate-x-1" width="14" height="13" viewBox="0 0 14 13" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M10.534 5.66477L6.16282 1.18659L7.31648 -9.53674e-07L13.6377 6.50026L7.31648 13L6.16282 11.8139L10.534 7.33576H0.637695V5.66477H10.534Z" className="fill-flask-white" />
          </svg>
        </button>
        <button
          type="button"
          onClick={nextDay}
          disabled={busy !== null}
          className="group flex w-full items-center justify-center gap-4 rounded-flask-xl border-2 border-flask-teal bg-flask-white px-4 py-3 font-medium shadow-flask-md transition-colors hover:bg-flask-teal/10"
        >
          <span className="text-flask-teal">Continue to next day report</span>
          <svg className="size-6 text-flask-teal transition-transform duration-300 group-hover:scale-[1.2]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 2.994v2.25m10.5-2.25v2.25m-14.252 13.5V7.491a2.25 2.25 0 0 1 2.25-2.25h13.5a2.25 2.25 0 0 1 2.25 2.25v11.251m-18 0a2.25 2.25 0 0 0 2.25 2.25h13.5a2.25 2.25 0 0 0 2.25-2.25m-18 0v-7.5a2.25 2.25 0 0 1 2.25-2.25h13.5a2.25 2.25 0 0 1 2.25 2.25v7.5m-6.75-6h2.25m-9 2.25h4.5m.002-2.25h.005v.006H12v-.006Zm-.001 4.5h.006v.006h-.006v-.005Zm-2.25.001h.005v.006H9.75v-.006Zm-2.25 0h.005v.005h-.006v-.005Zm6.75-2.247h.005v.005h-.005v-.005Zm0 2.247h.006v.006h-.006v-.006Zm2.25-2.248h.006V15H16.5v-.005Z"
            />
          </svg>
        </button>
      </div>
    </Frame>
  );
}
