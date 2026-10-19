/**
 * A copy of `@minty/shared/previewSibling`, kept from when this branch pinned v0.1 (which had
 * none). The pin is v0.4 since 2026-10-19 and its code is identical; moving the imports to the
 * package is a separate change. Until then: change it in the package first, then here.
 *
 * Preview sets: one branch, one host per app - `pr-<slug>-<app>.dailyminty.com` (2026-10-13).
 * Petty Cash's label is `pettycash` (2026-10-19, Step 5: its production host is
 * `pettycash.dailyminty.com`), not `petty-cash` - this copy is ahead of the package there until the
 * package and Flask's `PREVIEW_ORIGIN_REGEX` follow.
 *
 * The shared `vercel-preview-set.yml` workflow (the `.github` repo) aliases every frontend onto
 * the branch's set - the branch's own build where the repo has that branch, the fallback build
 * where it does not - so each member always exists. A page served on a set host therefore links
 * to the SAME set's other apps; the sibling URLs baked in at build time (`PAYMENT_REQUEST_WEB_URL`
 * and friends) would leave the set for the fallback's hosts.
 *
 * Decided at runtime from the host the page is served on, never at build: the fallback build
 * is a production build, yet it too must stay inside the set it is served in. Every other host
 * (production, dev-*, localhost, *.vercel.app) gets the configured URL back untouched.
 *
 * The shape matches Flask's and the Django APIs' `PREVIEW_ORIGIN_REGEX` (minty-infra
 * `services.tf`): slug = 1-40 of [a-z0-9-], no leading or trailing hyphen. The app is read from
 * the END of the label, so a slug may itself contain an app's name.
 */
export type PreviewApp = "my" | "payment-request" | "onboarding" | "pettycash" | "www";

const SET_HOST =
  /^pr-([a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?)-(?:my|payment-request|onboarding|pettycash|www)\.dailyminty\.com$/;

/** The slug of the preview set `host` belongs to, or null when it is not a set host. */
export function previewSetSlug(host: string | null | undefined): string | null {
  return host ? (SET_HOST.exec(host)?.[1] ?? null) : null;
}

/** `configuredUrl` moved onto `app`'s host in the same set, when `currentHost` is a set host. */
export function siblingUrl(
  configuredUrl: string,
  app: PreviewApp,
  currentHost: string | null | undefined,
): string {
  const slug = previewSetSlug(currentHost);
  if (slug === null) return configuredUrl;
  const url = new URL(configuredUrl);
  url.protocol = "https:";
  url.host = `pr-${slug}-${app}.dailyminty.com`;
  // URL writes a bare origin as "https://host/"; give one back in the form it came in.
  const bare = url.pathname === "/" && !url.search && !url.hash && !configuredUrl.endsWith("/");
  return bare ? url.origin : url.toString();
}

/**
 * `url` - an address on Minty (Flask) - naming the page's origin as `return_origin`, so Flask
 * can hand back into a preview set (Minty `blueprints/shared/preview_origin.py`). Flask ignores
 * it unless its `PREVIEW_ORIGIN_REGEX` allows it, and a normal host's origin leaves any set it
 * remembered. `origin` defaults to `window.location.origin`; pass the request's on the server
 * (middleware). With neither, `url` comes back unchanged.
 */
export function withReturnOrigin(url: string, origin?: string): string {
  const own = origin ?? (typeof window === "undefined" ? undefined : window.location.origin);
  if (!own) return url;
  const target = new URL(url);
  target.searchParams.set("return_origin", own);
  return target.toString();
}
