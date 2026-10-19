import type { Metadata } from "next";

import { SharedReport } from "@/components/closing/SharedReport";
import { sharePathFromSegments } from "@/lib/share";

/**
 * A shared Daily Report, read without signing in: `/share/<initials>/<day>/<secret>` (Part 15.7's
 * public variant; Flask's `/Minty_Report/...` page before it). proxy.ts lets exactly `/share/...`
 * through with no token. The secret is in the address, so the page asks for no indexing and sends
 * no referrer anywhere (proxy.ts sets the same as headers). The report is read in the browser,
 * with no Authorization (lib/share.ts).
 */
export const metadata: Metadata = {
  title: "Daily Report",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function Page({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return <SharedReport path={sharePathFromSegments(path)} />;
}
