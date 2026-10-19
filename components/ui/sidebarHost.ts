"use client";

/**
 * The ONE file the packaged sidebar (`@minty/shared/sidebar`) reads of this app - minty-web's and
 * minty-payment-request-web's own files of this name are the other two hosts.
 *
 * Imported for its side effect by every shim in this folder, so the host is registered before
 * anything renders. An unregistered host throws by design.
 */

import { usePathname } from "next/navigation";

import { guardLeave } from "@minty/shared/leaveGuard";
import { siblingUrl } from "@minty/shared/previewSibling";
import { setSidebarHost, type SidebarHost, type Viewer } from "@minty/shared/sidebar";

import { mintyFetch } from "@/lib/apiClient";
import { clearAuth, getAuth, moduleClaims } from "@/lib/auth";
import { pettyCashHome, settingsHref } from "@/lib/companyPages";
import { env } from "@/lib/env";
import { leaveTo } from "@/lib/handoff";
import { billsUrl, hubUrl, logoutUrl } from "@/lib/hub";
import { historyHref } from "@/lib/wizardPages";

/** This app's settings page: `/entity/<shortid>/<name>/settings/petty-cash` (Flask's address for it). */
const SETTINGS_PAGE = /^\/entity\/[^/]+\/[^/]+\/settings\/petty-cash\/?$/;

function home(): string {
  const auth = getAuth();
  return auth?.entityId ? pettyCashHome(auth.entityId, auth.entityName) : "/";
}

export const sidebarHost: SidebarHost = {
  app: "minty-petty-cash-web",
  entityId: () => getAuth()?.entityId ?? "",
  entityName: () => getAuth()?.entityName ?? "",

  /** The token's claims, both on when unknown - never hide nav on a guess. */
  moduleAccess: () => moduleClaims(),

  /**
   * Petty Cash's dashboard, Reports (the report history) and Settings are this app's own pages
   * (Settings links on to Flask's page to connect Xero). The entity list, Subscriptions and My Profile are
   * minty-web's, reached through Flask's hand-offs; Bills is the payments app, through Flask's
   * `/entity/<id>/payment-request` (which hands over with that app's own token).
   */
  links: {
    entities: () => hubUrl("/entities"),
    subscriptions: () => hubUrl("/subscription"),
    pettyCashDashboard: () => home(),
    pettyCashReports: (id) => {
      const auth = getAuth();
      return historyHref(id || auth?.entityId || "", auth?.entityName ?? "");
    },
    bills: () => {
      const id = getAuth()?.entityId;
      if (id) return billsUrl(id);
      // In a branch preview set, the same set's payments app.
      return `${siblingUrl(env.PAYMENT_REQUEST_WEB_URL, "payment-request", typeof window === "undefined" ? null : window.location.host)}/`;
    },
    settings: () => {
      const auth = getAuth();
      return auth?.entityId ? settingsHref(auth.entityId, auth.entityName) : "/";
    },
    // minty-web's My Profile, scoped to the company it was opened from (Flask's `/profile` page
    // only redirected there).
    profile: () => hubUrl("/profile", getAuth()?.entityId || undefined),
  },

  /**
   * This app's router. Imported HERE and not in the package, so a test's
   * `vi.mock("next/navigation")` reaches it - a mock does not apply to a module inside
   * node_modules, and the real hook returns null outside an app-router tree.
   */
  usePathname: () => usePathname() ?? "",

  /** Settings is the one menu item that is this app's own page; the rest are minty-web's. */
  currentOf: (pathname) => (SETTINGS_PAGE.test(pathname) ? "settings" : null),

  /** `body`, because this app scrolls the document, as minty-web does. */
  lockScroll: () => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  },

  /**
   * Every app's Logout ends the session everywhere: forget this app's token, then Flask's
   * `/logout`. A page with unsaved changes asks first (`@minty/shared/leaveGuard`); nothing here
   * runs until the person picks "Discard changes".
   */
  logOut: (onLeaving) =>
    guardLeave(() => {
      onLeaving?.();
      clearAuth();
      leaveTo(logoutUrl());
    }),

  currentToken: () => getAuth()?.token ?? "",

  /**
   * Flask's hub surface. DECORATION: a read that fails must never move the page, so a 401 only
   * rejects and the badge stays empty - the page's own reads are what a lapsed token is the
   * business of.
   */
  loadViewer: async (): Promise<Viewer | null> => {
    const body = await mintyFetch<{ user?: { name?: unknown; initials?: unknown } }>(
      "/api/me/profile",
      { onUnauthorized: "reject" },
    );
    const user = body?.user;
    if (typeof user?.name !== "string" || typeof user.initials !== "string") return null;
    return { name: user.name, initials: user.initials };
  },
};

setSidebarHost(sidebarHost);
