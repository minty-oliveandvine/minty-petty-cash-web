import type { Metadata } from "next";

import { SharedReportView } from "@/components/report/SharedReport";

/**
 * The secret is in the address: no search engine may index it, and no request from the page may
 * carry it onward as a Referer (the API read sets the same policy on itself).
 */
export const metadata: Metadata = {
  title: "Report Summary",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * A shared Daily Report, read-only and public: `/share/<initials>/<date>/<secret>` - Flask's
 * `/Minty_Report/<initials>/<date>/<secret>/`, served here now that Flask is a backend only.
 * proxy.ts lets exactly `/share/...` through without a token.
 */
export default async function Page({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return <SharedReportView segments={path} />;
}
