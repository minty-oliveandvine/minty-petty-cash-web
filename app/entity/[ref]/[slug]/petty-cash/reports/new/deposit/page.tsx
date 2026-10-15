import { redirect } from "next/navigation";

/**
 * Flask's Bank Deposit address, `/entity/<shortid>/<name>/petty-cash/reports/new/deposit`: the
 * deposit is the first section of the Cash Count stage since Wave 2d (D15-05), so a link or a
 * typed address with Flask's path lands there, with the same day.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ref, slug } = await params;
  const day = (await searchParams).transaction_date;
  const query = typeof day === "string" ? `?${new URLSearchParams({ transaction_date: day })}` : "";
  redirect(`/entity/${segment(ref)}/${segment(slug)}/petty-cash/reports/new/cash-count${query}`);
}

/** A path segment as it arrived (Next hands params over still percent-encoded), encoded exactly once. */
function segment(value: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}
