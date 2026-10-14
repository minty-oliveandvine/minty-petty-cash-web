import type { NextConfig } from "next";

/**
 * Sent with every response - the same values as minty-web, minty-payment-request-web and
 * minty-onboarding-web, and Flask (pettycash/core/http_hardening.py).
 * - Referrer-Policy same-origin: another site never sees a path or query from here (tokens).
 * - frame-ancestors / X-Frame-Options: only this app may frame its pages (clickjacking).
 * - HSTS in production builds only; a browser ignores it over plain http anyway.
 */
const securityHeaders = [
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
    : []),
];

const nextConfig: NextConfig = {
  /**
   * @minty/shared ships .ts/.tsx SOURCE, not a build, so Next compiles it with this app's own
   * toolchain. Without this the build fails on the first .ts file under node_modules - loudly,
   * unlike the Tailwind scan, which fails silently (see the @source line in app/globals.css).
   */
  transpilePackages: ["@minty/shared"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  /** Slightly smaller responses; security-through-obscurity only. */
  poweredByHeader: false,
  /**
   * The sibling URLs lib/env.ts reads. Listing them here is what makes Next inline the literal
   * `process.env.X` reads at build time - in client code, server code and proxy.ts alike - under
   * their plain names (no NEXT_PUBLIC_ prefix). Raw values only: lib/env.ts owns the defaults.
   * A change needs `npm run dev` restarted or `npm run build` rerun.
   */
  env: {
    ACCOUNTS_API_URL: process.env.ACCOUNTS_API_URL ?? "",
    PETTY_CASH_API_URL: process.env.PETTY_CASH_API_URL ?? "",
    SUBSCRIPTION_API_URL: process.env.SUBSCRIPTION_API_URL ?? "",
    PAYMENT_REQUEST_WEB_URL: process.env.PAYMENT_REQUEST_WEB_URL ?? "",
  },
  /**
   * Next 16 refuses dev-only requests (HMR, the hydration payload) from an origin other than the
   * one the dev server was started as; 127.0.0.1 is what a Windows-hosted test runner reaches
   * for, because Node resolves `localhost` to ::1 first and stalls ~2 s per request.
   */
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
