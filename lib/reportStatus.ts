/**
 * A report's status pill on a wizard page - Flask's header badge
 * (`components/report_draft_header_badge.html`) in Part 13's tones: Published (sent to Xero) is
 * Success, Publish failed is Danger, Draft (a draft, or a report not started yet) is Neutral, and
 * anything else is Submitted, which is Info in every module (CLAUDE.md, Status tones).
 */

import type { StatusTone } from "@minty/shared/ui";

import type { OpeningPage } from "@/lib/opening";

export function reportStatus(draft: OpeningPage["draft"]): { label: string; tone: StatusTone } {
  if (draft?.xero_integrated) return { label: "Published", tone: "success" };
  if (draft?.publishing_status === "failed") return { label: "Publish failed", tone: "danger" };
  if (!draft || draft.status === "draft") return { label: "Draft", tone: "neutral" };
  return { label: "Submitted", tone: "info" };
}
