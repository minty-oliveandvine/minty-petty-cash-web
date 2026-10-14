"use client";

import { useEffect, useState } from "react";

import { NavMenu, ViewerBadge } from "@/components/ui/NavMenu";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { getAuth } from "@/lib/auth";
import { env } from "@/lib/env";

/** What `GET /api/petty-cash/v1/companies/<id>` answers (Minty `petty_cash_api/routes/company.py`). */
export type CompanyContext = {
  company: {
    id: string;
    name: string;
    role: string | null;
    role_label: string | null;
    currency: { code: string; decimal_places: number } | null;
  };
  person: { first_name: string; name: string; initials: string };
};

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";

type State = { kind: "loading" } | { kind: "ready"; data: CompanyContext } | { kind: "failed"; message: string };

export function PettyCashHome() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    pettyCashFetch<CompanyContext>("")
      .then((data) => live && setState({ kind: "ready", data }))
      .catch((err: unknown) => {
        // A 401 has already gone back through the hand-off; anything else is said as it stands.
        if (!live || (err instanceof ApiError && err.status === 401)) return;
        // The API's own sentence; a fetch that never got an answer is said in Part 11's words.
        setState({ kind: "failed", message: err instanceof ApiError ? err.message : UNREACHABLE });
      });
    return () => {
      live = false;
    };
  }, []);

  const entityId = getAuth()?.entityId ?? "";
  const companyName = state.kind === "ready" ? state.data.company.name : (getAuth()?.entityName ?? "");

  return (
    <>
      <header className="border-b border-border-subtle bg-surface-card">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-2 px-4 sm:h-15 sm:px-6">
          <span className="min-w-0 truncate text-body-m text-text-secondary">{companyName}</span>
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <ViewerBadge />
            <NavMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6">
        <h1 className="text-title-l text-text-primary">Petty Cash</h1>
        {state.kind === "loading" ? (
          <p className="mt-3 text-body-m text-text-secondary" role="status">
            Loading…
          </p>
        ) : state.kind === "failed" ? (
          <p className="mt-3 text-body-m text-status-danger-ink" role="alert">
            {state.message}
          </p>
        ) : (
          <p className="mt-3 text-body-m text-text-secondary">
            The new Petty Cash for {state.data.company.name} is on its way. Until then, do today&apos;s
            closing in Minty.
          </p>
        )}
        {entityId ? (
          <a
            href={`${env.ACCOUNTS_API_URL}/entity/${encodeURIComponent(entityId)}/petty-cash`}
            className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-action-primary px-4 text-button text-action-on-primary hover:bg-action-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
          >
            Open Petty Cash in Minty
          </a>
        ) : null}
      </main>
    </>
  );
}
