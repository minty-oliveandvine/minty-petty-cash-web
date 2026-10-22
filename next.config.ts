import { withMintyDefaults } from "@minty/shared/next";

/**
 * withMintyDefaults (@minty/shared/next) supplies what every Minty app sends and needs: the
 * security headers on every path (the same values as Flask's pettycash/core/http_hardening.py),
 * no X-Powered-By, `transpilePackages: ["@minty/shared"]` (the package ships .ts source - without
 * it the build fails on the first .ts file under node_modules) and 127.0.0.1 as an allowed dev
 * origin (Next 16 refuses dev-only requests from another origin, and 127.0.0.1 is what a
 * Windows-hosted test runner reaches for). Only this app's own settings are below.
 */
export default withMintyDefaults({
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
});
