"use client";

/**
 * The ONE file the packaged sidebar (`@minty/shared/sidebar`) reads of this app - minty-web's and
 * minty-payment-request-web's own files of this name are the other two hosts.
 *
 * Imported for its side effect by every shim in this folder, so the host is registered before
 * anything renders. An unregistered host throws by design.
 */

import { usePathname } from "next/navigation";

import { moduleClaims } from "@minty/shared/auth";
import { billsUrl } from "@minty/shared/companyRef";
import { hubHandoffUrl, logoutUrl } from "@minty/shared/handoff";
import { guardLeave } from "@minty/shared/leaveGuard";
import { loadViewer } from "@minty/shared/portal";
import { siblingUrl } from "@minty/shared/previewSibling";
import { pushAppScrollLock } from "@minty/shared/scrollLock";
import { setSidebarHost, type SidebarHost } from "@minty/shared/sidebar";

import { mintyFetch, type ApiRequest } from "@/lib/apiClient";
import { clearAuth, getAuth } from "@/lib/auth";
import { pettyCashHome, settingsHref } from "@/lib/companyPages";
import { env } from "@/lib/env";
import { leaveTo } from "@/lib/handoff";
import { isSharePage } from "@/lib/share";
import { historyHref } from "@/lib/wizardPages";

/** This app's settings page: `/entity/<shortid>/<name>/settings/petty-cash` (Flask's address for it). */
const SETTINGS_PAGE = /^\/entity\/[^/]+\/[^/]+\/settings\/petty-cash\/?$/;

/** Flask's hub API for a decoration: a 401 only rejects, it never moves the page. */
const mintyDecoration = <T>(path: string, init: ApiRequest = {}) => mintyFetch<T>(path, { ...init, onUnauthorized: "reject" });

function home(): string {
  const auth = getAuth();
  return auth?.entityId ? pettyCashHome(auth.entityId, auth.entityName) : "/";
}

export const sidebarHost: SidebarHost = {
  app: "minty-petty-cash-web",
  entityId: () => getAuth()?.entityId ?? "",
  entityName: () => getAuth()?.entityName ?? "",

  /** The token's claims, both on when unknown - never hide nav on a guess. */
  moduleAccess: () => moduleClaims(getAuth()?.token),

  /**
   * Petty Cash's dashboard, Reports (the report history) and Settings are this app's own pages
   * (Settings links on to Flask's page to connect Xero). The entity list, Subscriptions and My Profile are
   * minty-web's, reached through Flask's hand-offs; Bills is the payments app, through Flask's
   * `/entity/<id>/payment-request` (which hands over with that app's own token).
   */
  links: {
    entities: () => hubHandoffUrl(env.ACCOUNTS_API_URL, "/entities"),
    subscriptions: () => hubHandoffUrl(env.ACCOUNTS_API_URL, "/subscription"),
    pettyCashDashboard: () => home(),
    pettyCashReports: (id) => {
      const auth = getAuth();
      return historyHref(id || auth?.entityId || "", auth?.entityName ?? "");
    },
    bills: () => {
      const id = getAuth()?.entityId;
      if (id) return billsUrl(env.ACCOUNTS_API_URL, id);
      // In a branch preview set, the same set's payments app.
      return `${siblingUrl(env.PAYMENT_REQUEST_WEB_URL, "payment-request", typeof window === "undefined" ? null : window.location.host)}/`;
    },
    settings: () => {
      const auth = getAuth();
      return auth?.entityId ? settingsHref(auth.entityId, auth.entityName) : "/";
    },
    // minty-web's My Profile, scoped to the company it was opened from (Flask's `/profile` page
    // only redirected there).
    profile: () => hubHandoffUrl(env.ACCOUNTS_API_URL, "/profile", getAuth()?.entityId || undefined),
  },

  /**
   * This app's router. Imported HERE and not in the package, so a test's
   * `vi.mock("next/navigation")` reaches it - a mock does not apply to a module inside
   * node_modules, and the real hook returns null outside an app-router tree.
   */
  usePathname: () => usePathname() ?? "",

  /** Settings is the one menu item that is this app's own page; the rest are minty-web's. */
  currentOf: (pathname) => (SETTINGS_PAGE.test(pathname) ? "settings" : null),

  /** `body` (this app has no `app-scroll-root`: it scrolls the document, as minty-web does). */
  lockScroll: () => pushAppScrollLock(),

  /**
   * Every app's Logout ends the session everywhere: forget this app's token, then Flask's
   * `/logout`. A page with unsaved changes asks first (`@minty/shared/leaveGuard`); nothing here
   * runs until the person picks "Discard changes".
   */
  logOut: (onLeaving) =>
    guardLeave(() => {
      onLeaving?.();
      clearAuth();
      leaveTo(logoutUrl(env.ACCOUNTS_API_URL));
    }),

  /**
   * The public share page has no viewer: a signed-in person's token never leaves on it, so no
   * profile read is made there (lib/share.ts).
   */
  currentToken: () => (typeof window !== "undefined" && isSharePage(window.location.pathname) ? "" : (getAuth()?.token ?? "")),

  /**
   * Flask's hub surface. DECORATION: a read that fails must never move the page, so a 401 only
   * rejects and the badge stays empty - the page's own reads are what a lapsed token is the
   * business of.
   */
  loadViewer: () => loadViewer(mintyDecoration),
};

setSidebarHost(sidebarHost);
