"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { setAuth } from "@/lib/auth";
import { redirectToHandoff, safeNext } from "@/lib/handoff";

/**
 * Where Minty (Flask's `/handoff/petty-cash-web`) sends people:
 * `/landing?token=<jwt>&next=<path>&entity_id=…&entity_name=…`. Stores the token (lib/auth.ts)
 * and forwards to `next`. Reached with no token - a bookmark, a stale tab - it goes to Flask's
 * re-handoff for `next`, which comes back here with one. minty-web's app/landing, the same page.
 */
function LandingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token") ?? "";
    const entityId = searchParams.get("entity_id") ?? "";
    const entityName = searchParams.get("entity_name") ?? "";
    const next = safeNext(searchParams.get("next"));

    if (!token) {
      redirectToHandoff(next, entityId || undefined);
      return;
    }

    setAuth(token, entityId, entityName);
    router.replace(next);
  }, [router, searchParams]);

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
