/**
 * Old links after the host switch (Step 5): `pettycash.dailyminty.com` was Flask and is this app
 * now, while Flask moves to `accounts-api.dailyminty.com`. The owner's decision (2026-10-19): old
 * links are MAPPED, never left to 404. proxy.ts answers each one before the gate, so a person who
 * is not signed in (someone opening a share link) gets the redirect too.
 *
 * - Flask's share link, `/Minty_Report/<initials>/<date>/<secret>/` -> this app's `/share/...`,
 *   the same three parts (Flask's `ShareLink.path_segment`, lib/share.ts).
 * - Petty Cash's addresses are this app's already (`/entity/<shortid>/<name>/petty-cash/...`,
 *   `/settings/petty-cash`) and pass through untouched. Flask's other Petty Cash addresses go to
 *   this app's page for them: the older `/entity/<co>/reports/...` and the bare company address
 *   (Minty `blueprints/shared/legacy_addresses.py`), a submitted report's step views (its own view
 *   here), resume and the id-less summary (the dashboard, whose Continue Report resumes), the CSV
 *   download (report history, where Export CSV is).
 * - A full company uuid in place of `<shortid>/<name>` (Flask accepted one and redirected to the
 *   readable form) needs the company's name, which this app learns only from the token's cookie -
 *   `company-uuid`, settled by the proxy with no lookup.
 * - Flask's other pages -> minty-web through Flask's login-gated `/handoff/minty-web`: its page
 *   for it where there is one (My Profile, Subscriptions, a company's settings tabs and module
 *   choice), else the entity list.
 * - Flask's backend paths -> the same path on accounts-api (`isFlaskBackendPath`, lib/handoff.ts).
 * - Anything else is null: the gate, then Next's 404.
 *
 * A share path carries a secret: nothing here logs a path.
 */

import { isFlaskBackendPath } from "@/lib/handoff";
import { decodeSegments, shareUrl } from "@/lib/share";

export type OldLink =
  /** This app's share page (a 308, served with no token). */
  | { kind: "share"; to: string }
  /** This app's page for an old Petty Cash address (a 308, query kept). */
  | { kind: "local"; to: string }
  /** A Petty Cash page named by the company's full uuid: `tail` follows `/entity/<shortid>/<name>`. */
  | { kind: "company-uuid"; uuid: string; tail: string }
  /** minty-web's page `next`, through `/handoff/minty-web` (scoped to `entityId` when known). */
  | { kind: "hub"; next: string; entityId?: string }
  /** The same path on accounts-api (a 308, query kept). */
  | { kind: "backend"; path: string };

const UUID = /^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/;
const SHORT_ID = /^[0-9a-fA-F]{8}$/;

/** The wizard's steps, at the same addresses as Flask's (app/entity/[ref]/[slug]/petty-cash/reports/new). */
const STEPS = new Set(["opening", "sale", "expense", "deposit", "cash-count", "ending"]);
/** Words under `reports/` that are Flask pages, never a report id. */
const NOT_AN_ID = new Set(["new", "resume", "summary", "download-csv"]);

const ENTITY_LIST = "/entities";

/** minty-web's own page for a Flask page outside a company. */
const HUB_PAGES: [RegExp, string][] = [
  [/^\/profile$/, "/profile"],
  [/^\/subscription(?:\/.*)?$/, "/subscription"],
  [
    /^\/(?:entity|entities(?:\/.*)?|entity\/create|entity\/success|index|login|register|reset_password(?:\/[^/]+)?|no-permission|admin(?:\/.*)?|admin_dashboard|find_user|create|report\/.+|payment[-_]request(?:\/.*)?)$/,
    ENTITY_LIST,
  ],
];

/**
 * A company's Flask Petty Cash address (the segments after the company) as this app's
 * (`/petty-cash...` or `/settings/petty-cash`), or null when it is not one.
 */
function pettyCashTail(rest: string[]): string | null {
  const [a, b, c, d, ...more] = rest;
  if (rest.length === 0) return "/petty-cash";
  if (a === "settings")
    return b === "petty-cash" && rest.length === 2 ? "/settings/petty-cash" : null;
  if (a === "reports") return pettyCashTail(["petty-cash", ...rest]);
  if (a === "ending" && rest.length <= 2)
    return b ? `/petty-cash/reports/${b}/summary` : "/petty-cash";
  if (a === "report" && b === "opening" && rest.length === 2)
    return "/petty-cash/reports/new/opening";
  if (a !== "petty-cash" || more.length > 0) return null;
  if (b === undefined) return "/petty-cash";
  if (b !== "reports") return null;
  if (c === undefined) return "/petty-cash/reports";
  if (c === "new") {
    if (d === "submitted") return "/petty-cash";
    return d !== undefined && STEPS.has(d) ? `/petty-cash/reports/new/${d}` : null;
  }
  if (d === undefined) {
    if (c === "resume" || c === "summary") return "/petty-cash";
    if (c === "download-csv") return "/petty-cash/reports";
    return null;
  }
  if (NOT_AN_ID.has(c)) return null;
  if (d === "summary" || d === "submitted") return `/petty-cash/reports/${c}/${d}`;
  if (STEPS.has(d)) return `/petty-cash/reports/${c}/summary`;
  return null;
}

/** A company's Flask page that is minty-web's now, as the tail of minty-web's company address. */
function hubTail(rest: string[]): string | null {
  const path = rest.join("/");
  if (path === "modules") return "";
  if (path === "settings/users" || path === "settings/integration" || path === "settings/modules")
    return `/${path}`;
  if (path === "settings/xero" || path === "xero-not-connected") return "/settings/integration";
  return null;
}

/** One company's old address: the company as `<shortid>/<name>` or a full uuid, then the rest. */
function companyLink(
  ref: { short: string; name: string } | { uuid: string },
  rest: string[],
  pathname: string,
): OldLink | null {
  const tail = pettyCashTail(rest);
  if (tail !== null) {
    if ("uuid" in ref) return { kind: "company-uuid", uuid: ref.uuid.toLowerCase(), tail };
    const to = `/entity/${ref.short}/${ref.name}${tail}`;
    return to === pathname.replace(/\/+$/, "") ? null : { kind: "local", to };
  }
  const hub = hubTail(rest);
  if (hub !== null) {
    if ("uuid" in ref) {
      const uuid = ref.uuid.toLowerCase();
      // minty-web takes a full id in place of the short one, with a placeholder name it corrects.
      return { kind: "hub", next: `/entity/${uuid}/company${hub}`, entityId: uuid };
    }
    return { kind: "hub", next: `/entity/${ref.short}/${ref.name}${hub}` };
  }
  return null;
}

/** What an old `pettycash.` address becomes, or null when it is this app's own page or unknown. */
export function oldLink(pathname: string): OldLink | null {
  if (isFlaskBackendPath(pathname)) return { kind: "backend", path: pathname };

  const segments = pathname.split("/").slice(1);
  if (segments.at(-1) === "") segments.pop();

  if (segments[0] === "Minty_Report") {
    const decoded = decodeSegments(segments.slice(1));
    const to = decoded ? shareUrl("", decoded) : null;
    return to ? { kind: "share", to } : null;
  }

  if (segments[0] === "entity" && segments.length >= 2) {
    const [, first, second, ...after] = segments;
    if (UUID.test(first)) return companyLink({ uuid: first }, segments.slice(2), pathname);
    if (SHORT_ID.test(first) && second)
      return companyLink({ short: first, name: second }, after, pathname);
    // Flask's oldest company addresses put the uuid last.
    if (first === "settings" && segments.length === 4 && UUID.test(segments[3])) {
      const uuid = segments[3];
      if (second === "entity") return companyLink({ uuid }, ["settings", "petty-cash"], pathname);
      if (second === "users" || second === "module") {
        return companyLink(
          { uuid },
          ["settings", second === "users" ? "users" : "modules"],
          pathname,
        );
      }
    }
  }
  if (
    segments[0] === "invitation" &&
    segments[1] === "xero-not-connected" &&
    segments.length === 3 &&
    UUID.test(segments[2])
  ) {
    return companyLink({ uuid: segments[2] }, ["xero-not-connected"], pathname);
  }

  const bare = `/${segments.join("/")}`;
  const page = HUB_PAGES.find(([re]) => re.test(bare));
  return page ? { kind: "hub", next: page[1] } : null;
}
