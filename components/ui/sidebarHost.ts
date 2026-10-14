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
import { setSidebarHost, type SidebarHost, type Viewer } from "@minty/shared/sidebar";

import { mintyFetch } from "@/lib/apiClient";
import { clearAuth, getAuth, moduleClaims } from "@/lib/auth";
import { pettyCashHome } from "@/lib/companyPages";
import { env } from "@/lib/env";
import { historyUrl, settingsUrl } from "@/lib/flaskPages";
import { leaveTo, withReturnOrigin } from "@/lib/handoff";
import { siblingUrl } from "@/lib/previewSibling";

/** This app's settings page: `/entity/<shortid>/<name>/petty-cash/settings`. */
const SETTINGS_PAGE = /^\/entity\/[^/]+\/[^/]+\/petty-cash\/settings\/?$/;

function home(): string {
  const auth = getAuth();
  return auth?.entityId ? pettyCashHome(auth.entityId, auth.entityName) : "/";
}

/** A Flask address (accounts), naming this app as where to hand back to in a preview set. */
function accounts(path: string): string {
  return withReturnOrigin(`${env.ACCOUNTS_API_URL}${path}`);
}

/** minty-web's page `next`, through Flask's login-gated re-handoff. */
function hub(next: string): string {
  return accounts(`/handoff/minty-web?${new URLSearchParams({ next }).toString()}`);
}

export const sidebarHost: SidebarHost = {
  app: "minty-petty-cash-web",
  entityId: () => getAuth()?.entityId ?? "",
  entityName: () => getAuth()?.entityName ?? "",

  /** The token's claims, both on when unknown - never hide nav on a guess. */
  moduleAccess: () => moduleClaims(),

  /**
   * Petty Cash's dashboard is this app's own page; Reports and Settings are still Flask's
   * (lib/flaskPages.ts) until they are ported. The entity list, Subscriptions and My Profile are
   * minty-web's, reached through Flask's hand-offs; Bills is the payments app, through Flask's
   * `/entity/<id>/payment-request` (which hands over with that app's own token).
   */
  links: {
    entities: () => hub("/entities"),
    subscriptions: () => hub("/subscription"),
    pettyCashDashboard: () => home(),
    pettyCashReports: (id) => historyUrl(id || getAuth()?.entityId || ""),
    bills: () => {
      const id = getAuth()?.entityId;
      if (id) return accounts(`/entity/${encodeURIComponent(id)}/payment-request`);
      // In a branch preview set, the same set's payments app.
      return `${siblingUrl(env.PAYMENT_REQUEST_WEB_URL, "payment-request", typeof window === "undefined" ? null : window.location.host)}/`;
    },
    settings: () => settingsUrl(getAuth()?.entityId ?? ""),
    profile: () => {
      const id = getAuth()?.entityId;
      return accounts(id ? `/profile?${new URLSearchParams({ entity_id: id }).toString()}` : "/profile");
    },
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
      leaveTo(`${env.ACCOUNTS_API_URL}/logout`);
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
