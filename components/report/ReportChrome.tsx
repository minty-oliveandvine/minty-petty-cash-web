"use client";

import type { OpeningPage } from "@/lib/opening";

const BADGE = "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium";

/**
 * Flask's report header badge (`components/report_draft_header_badge.html`): Published (sent to
 * Xero), Publish failed, Draft (a draft, or a report not started yet), else Submitted.
 */
export function ReportBadge({ draft }: { draft: OpeningPage["draft"] }) {
  if (draft?.xero_integrated) return <span className={`${BADGE} bg-flask-badge-published-bg text-flask-badge-published-ink`}>Published</span>;
  if (draft?.publishing_status === "failed") {
    return <span className={`${BADGE} bg-flask-badge-published-bg text-flask-badge-published-ink`}>Publish failed</span>;
  }
  if (!draft || draft.status === "draft") return <span className={`${BADGE} bg-flask-submitted text-flask-badge-draft-ink`}>Draft</span>;
  return <span className={`${BADGE} bg-flask-red-soft text-flask-red`}>Submitted</span>;
}

/** Flask's `components/loading_overlay.html`: over the phone card while a step saves. */
export function LoadingOverlay({ text = "Saving..." }: { text?: string }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-flask-black/30" role="status">
      <div className="flex items-center gap-3 rounded-flask-lg bg-flask-white p-4 shadow-flask-lg">
        <svg className="h-5 w-5 animate-spin text-flask-teal" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="font-medium text-flask-gray-700">{text}</span>
      </div>
    </div>
  );
}
