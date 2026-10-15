"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { useToast } from "@/components/flask/Toasts";
import { ApiError } from "@/lib/apiClient";
import { getAuth } from "@/lib/auth";
import { stepHref } from "@/lib/wizardPages";

/** The sentence a refusal carried, or null when the API gave none. */
export function sentenceOf(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as { error?: unknown } | null;
  return body && typeof body.error === "string" ? body.error : null;
}

/** The input a 422 named (`{error, field}`), or null. */
export function fieldOf(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 422) return null;
  const body = err.body as { field?: unknown } | null;
  return body && typeof body.field === "string" ? body.field : null;
}

/** Whether the API sent this step back to Opening (no draft for the day). */
export function toOpening(err: unknown): boolean {
  return err instanceof ApiError && (err.body as { to?: string } | null)?.to === "opening";
}

/** Back to this app's Opening for `day`, saying why there (Flask's redirect and flash). */
export function useBackToOpening() {
  const router = useRouter();
  const toast = useToast();
  return useCallback(
    (sentence: string, day: string) => {
      const auth = getAuth();
      toast(sentence, "error");
      if (auth) router.push(stepHref(auth.entityId, auth.entityName, "opening", day));
    },
    [router, toast],
  );
}
