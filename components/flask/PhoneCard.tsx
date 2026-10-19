"use client";

import { useRef, type ReactNode } from "react";

import { useViewer } from "@minty/shared/viewer";

import { useMounted, useSidebar } from "@/components/ui/Sidebar";
import { sidebarHost } from "@/components/ui/sidebarHost";

/**
 * Flask's two header buttons, drawn as Flask draws them (28px initials on #FFE6B1, the 40px ≡ in
 * #656565) and wired to the shared sidebar: the initials go to My Profile (minty-web's page - this
 * app's sidebar has no profile view), the ≡ opens the menu.
 */
function HeaderButtons() {
  const sidebar = useSidebar();
  const mounted = useMounted();
  const viewer = useViewer();
  const menu = useRef<HTMLButtonElement>(null);
  return (
    <div className="flex items-center gap-2">
      <a
        href={mounted ? sidebarHost.links.profile() : undefined}
        className="relative inline-flex shrink-0 cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-flask-teal/50"
        aria-label="My Profile"
        title={viewer?.name ?? ""}
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-flask-avatar-bg text-[12px] font-semibold text-flask-avatar-ink">
          {viewer?.initials || "?"}
        </span>
      </a>
      <button
        ref={menu}
        type="button"
        onClick={() => sidebar?.openMenu(menu.current)}
        aria-label="Open navigation menu"
        aria-expanded={sidebar ? sidebar.open && sidebar.view === "menu" : false}
        aria-controls={sidebar?.panelId}
        className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-flask-md text-flask-menu transition-colors hover:bg-flask-menu/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flask-menu"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" className="size-6" aria-hidden="true">
          <path d="M120-240v-80h720v80H120Zm0-200v-80h720v80H120Zm0-200v-80h720v80H120Z" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Flask's page frame for Petty Cash (`entity_dashboard_v2.html`): a "phone card" - full width on a
 * phone, 640 / 768 / 1024 px centred above that (`.flask-main-container`), the screen's height,
 * grey, with a large shadow - whose content scrolls inside it. Its header: the back chevron to the
 * company list, the company's initials in the middle, the person's initials (My Profile) and the
 * menu. `overlays` (Flask's modals) sit inside the card, over everything in it.
 *
 * A report step's header (`report/*.html`) adds the day's date pill before the initials and the
 * report's status badge after them, sets the initials a weight lighter, and carries the stepper
 * under the header (`stepper`), outside the scrolling content.
 *
 * Report history (`report_history/report_history.html`) puts its date filter there instead
 * (`toolbar`, drawn as given), and pads its own content (`flush`).
 *
 * A shared report (`publicView`, Flask's `is_shared_link`) keeps only the middle: no chevron and no
 * header buttons, Flask's empty boxes in their place - and so no read of the person (the page has
 * no token) and nowhere to go.
 */
export function PhoneCard({
  acronym,
  children,
  overlays,
  datePill,
  badge,
  stepper,
  toolbar,
  flush = false,
  backHref,
  publicView = false,
}: {
  acronym: string;
  children: ReactNode;
  overlays?: ReactNode;
  /** A report step: "01 SEP". */
  datePill?: string;
  /** A report step: its Draft / Submitted / Published badge. */
  badge?: ReactNode;
  stepper?: ReactNode;
  /** Report history: its date filter under the header, outside the scrolling content. */
  toolbar?: ReactNode;
  /** The content pads itself: only Flask's room at the bottom (`pb-40`). */
  flush?: boolean;
  /** Where the chevron goes; the company list by default (the dashboard's). */
  backHref?: string;
  /** A shared report: no chevron, no person's initials, no menu. */
  publicView?: boolean;
}) {
  const report = datePill !== undefined;
  // The two header links read the cookie and the page's origin, which the server does not have:
  // drawn without an address until the browser has taken over, so both renders agree.
  const mounted = useMounted();
  return (
    <div className="flask-main-container flex min-h-screen items-center justify-center">
      <div className="relative flex h-screen w-full flex-col overflow-hidden bg-flask-gray-50 shadow-flask-xl">
        <div className="relative flex flex-shrink-0 items-center justify-between bg-flask-gray-50 px-4 py-3">
          {publicView ? (
            <div className="h-6 w-6 shrink-0" />
          ) : (
            <div className={report ? "flex shrink-0 justify-start sm:min-w-0 sm:flex-1" : "flex min-w-0 flex-1 justify-start"}>
              <a
                href={backHref ?? (mounted ? sidebarHost.links.entities() : undefined)}
                className="text-flask-header transition-colors"
                aria-label={backHref ? "Back" : "Back to your companies"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 19l-7-7 7-7" />
                </svg>
              </a>
            </div>
          )}
          {publicView ? (
            // Nothing either side, so the day and the company's name share the whole width, centred.
            <div className="mx-2 flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap sm:gap-3">
              {datePill ? (
                <span className="shrink-0 whitespace-nowrap rounded-full bg-flask-teal-soft/50 px-2 py-1 text-xs font-medium text-flask-teal-pill sm:px-3">{datePill}</span>
              ) : null}
              <h1 className="min-w-0 truncate text-lg font-medium text-flask-header" title={acronym}>
                {acronym}
              </h1>
              {badge}
            </div>
          ) : report ? (
            // Below 640px the group takes the room between the chevron and the buttons, centred there
            // (the page's centre leaves the longest badge under the initials); above, Flask's centre.
            <div className="mx-2 flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap sm:absolute sm:left-1/2 sm:mx-0 sm:flex-none sm:-translate-x-1/2 sm:gap-3">
              {datePill ? (
                <span className="shrink-0 whitespace-nowrap rounded-full bg-flask-teal-soft/50 px-2 py-1 text-xs font-medium text-flask-teal-pill sm:px-3">{datePill}</span>
              ) : null}
              <h1 className="min-w-0 truncate text-lg font-medium text-flask-header">{acronym}</h1>
              {badge}
            </div>
          ) : (
            <h1 className="absolute left-1/2 -translate-x-1/2 text-lg font-semibold text-flask-header">{acronym}</h1>
          )}
          {publicView ? (
            <div className="h-8 w-8 shrink-0" />
          ) : (
            <div className={report ? "flex shrink-0 justify-end sm:flex-1" : "flex flex-1 justify-end"}>
              <HeaderButtons />
            </div>
          )}
        </div>
        {stepper ? <div className="relative flex-shrink-0 bg-flask-gray-50 px-4 py-2 sm:px-6 sm:py-2">{stepper}</div> : null}
        {toolbar}
        <div className={`relative flex-1 overflow-y-auto overflow-x-hidden bg-flask-gray-50 ${flush ? "" : "p-6"} pb-40`}>{children}</div>
        {overlays}
      </div>
    </div>
  );
}
