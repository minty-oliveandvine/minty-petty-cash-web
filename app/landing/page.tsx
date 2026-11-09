"use client";

import { readLanding, useLandingHandoff, type LandingParams } from "@minty/shared/landing";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { setAuth } from "@/lib/auth";
import { accountsApiUrl, APP_HOME, redirectToHandoff } from "@/lib/handoff";

/**
 * Where accounts-api (`/handoff/petty-cash-web`) sends people: `/landing?code=<one-time code>&
 * next=<path>&entity_id=…&entity_name=…` (gap 4, 2026-11-09: a code, never the token). The shared
 * hook swaps the code for the token, stores it (lib/auth.ts) and forwards to `next`. Reached with
 * neither - a bookmark, a stale tab - it goes to accounts-api's re-handoff for `next`, which comes
 * back here with one. A code that cannot be swapped says so, and Continue takes that way back.
 */
const backThroughHandoff = (landing: LandingParams) =>
  redirectToHandoff(landing.next, landing.entityId || undefined);

function LandingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refused } = useLandingHandoff({
    searchParams,
    router,
    setAuth,
    home: APP_HOME,
    onNoToken: backThroughHandoff,
    accountsApiUrl,
  });

  if (refused) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
          <p role="alert" className="text-sm text-flask-gray-900">
            {refused}
          </p>
          <button
            type="button"
            onClick={() => backThroughHandoff(readLanding(searchParams, APP_HOME))}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-flask-xl bg-flask-teal px-5 text-sm font-medium text-flask-white transition-colors hover:bg-flask-teal/80"
          >
            Continue
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center">
      <p className="text-sm text-flask-gray-500" role="status">
        Loading…
      </p>
    </main>
  );
}

export default function Landing() {
  return (
    <Suspense>
      <LandingContent />
    </Suspense>
  );
}
