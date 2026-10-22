"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { useLandingHandoff, type LandingParams } from "@minty/shared/landing";

import { setAuth } from "@/lib/auth";
import { APP_HOME, redirectToHandoff } from "@/lib/handoff";

/** No token (a bookmark, a stale tab): back through Flask for `next` and the company it named. */
function backThroughFlask({ next, entityId }: LandingParams) {
  redirectToHandoff(next, entityId || undefined);
}

/**
 * Where Minty (Flask's `/handoff/petty-cash-web`) sends people:
 * `/landing?token=<jwt>&next=<path>&entity_id=…&entity_name=…`. Stores the token (lib/auth.ts)
 * and forwards to `next`. Reached with no token - a bookmark, a stale tab - it goes to Flask's
 * re-handoff for `next`, which comes back here with one. The logic is `useLandingHandoff`
 * (@minty/shared/landing), the same in every app.
 */
function LandingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useLandingHandoff({ searchParams, router, setAuth, home: APP_HOME, onNoToken: backThroughFlask });

  return (
    <main className="flex min-h-dvh items-center justify-center">
      <p className="text-body-m text-text-secondary" role="status">
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
