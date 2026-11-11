import { redirect } from "next/navigation";

import { hubPettyCashSettingsUrl } from "@/lib/handoff";

/**
 * Petty Cash Settings' old address, `/entity/<shortid>/<name>/settings/petty-cash`. The page is
 * the hub's (minty-web's Petty Cash Settings tab) since 2026-11-10 (owner), so this only sends the
 * person on - to the same path on accounts-api, whose gated hand-off mints the hub's token for the
 * company. Old links, bookmarks and Flask's old addresses (lib/oldLinks.ts) all land here.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ ref: string; slug: string }>;
}): Promise<never> {
  const { ref, slug } = await params;
  redirect(hubPettyCashSettingsUrl(ref, slug));
}
