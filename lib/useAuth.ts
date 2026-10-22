"use client";

import { useClientValue } from "@minty/shared/clientValue";

import { getAuthSnapshot, type AuthInfo } from "@/lib/auth";

// Kept out of lib/auth.ts, which proxy.ts imports: the edge bundle needs no React.

const noAuth = () => null;

/**
 * The cookie's token and company, for rendering: null on the server and in the first client
 * render (so the two agree - no hydration mismatch), the cookie's after that. The cookie does
 * not change under a page; a new token arrives with a navigation.
 */
export function useAuth(): AuthInfo | null {
  return useClientValue(getAuthSnapshot, noAuth);
}
