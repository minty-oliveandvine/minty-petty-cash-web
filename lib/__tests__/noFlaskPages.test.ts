// The user's rule (2026-10-16): Flask is a backend only, its HTML is not used - so no screen here
// may send a person to a Flask page. Every address on Flask (`ACCOUNTS_API_URL`) is built in the
// four files below, and only to a hand-off, an action or an API (docs/features/petty-cash-web.md,
// "No Flask pages").

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SOURCE_DIRS = ["app", "components", "lib"];

/** The only files that may name `ACCOUNTS_API_URL`, and why. */
const ALLOWED = new Set([
  "lib/env.ts", // where it is read
  "lib/apiClient.ts", // Flask's JSON hub API (mintyFetch)
  "lib/handoff.ts", // /handoff/petty-cash-web, this app's own token
  "lib/hub.ts", // /handoff/minty-web, the payments hand-off, /logout
]);

/** What a path built on `ACCOUNTS_API_URL` may start with: hand-offs, actions and APIs - never a page. */
// `/entity/<id>/settings/payment-request` is Flask's `entity_settings_payments`: login-gated, it
// mints the payments app's token and redirects to its settings (no page) - the settings pills'
// Payment Request Settings, as minty-web's pills use it.
const ALLOWED_PATHS = [
  /^\/handoff\/(minty-web|petty-cash-web)\?/,
  /^\/entity\/\$\{[^}]+\}\/payment-request$/,
  /^\/entity\/\$\{[^}]+\}\/settings\/payment-request$/,
  /^\/logout$/,
  /^\/api\//,
];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" || name === "node_modules" ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = SOURCE_DIRS.flatMap((d) => sources(join(ROOT, d))).map((path) => ({
  name: relative(ROOT, path).split(sep).join("/"),
  text: readFileSync(path, "utf8"),
}));

describe("no Flask pages", () => {
  it("reads the source", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.map((f) => f.name)).toEqual(expect.arrayContaining([...ALLOWED]));
  });

  it("builds Flask addresses only in the hand-off and API helpers", () => {
    const offenders = files.filter((f) => !ALLOWED.has(f.name) && f.text.includes("ACCOUNTS_API_URL")).map((f) => f.name);
    expect(offenders).toEqual([]);
  });

  it("builds every one of them to a hand-off, an action or an API - never a page", () => {
    const built = files
      .filter((f) => ALLOWED.has(f.name))
      .flatMap((f) => [...f.text.matchAll(/\$\{env\.ACCOUNTS_API_URL\}([^`]*)`/g)].map((m) => ({ file: f.name, path: m[1] })));
    // a helper that takes the path as an argument (`${path}`) is checked through its callers below
    const literal = built.filter((b) => !/^\$\{\w+\}$/.test(b.path));
    expect(literal.filter((b) => !ALLOWED_PATHS.some((re) => re.test(b.path)))).toEqual([]);

    const throughAccounts = files
      .filter((f) => ALLOWED.has(f.name))
      .flatMap((f) => [...f.text.matchAll(/\baccounts\(`([^`]*)`\)/g)].map((m) => ({ file: f.name, path: m[1] })));
    expect(throughAccounts.length).toBeGreaterThan(0);
    expect(throughAccounts.filter((b) => !ALLOWED_PATHS.some((re) => re.test(b.path)))).toEqual([]);
  });

  it("leaves no module of Flask page links behind", () => {
    expect(files.some((f) => f.name === "lib/flaskPages.ts")).toBe(false);
    expect(files.filter((f) => /from "@\/lib\/flaskPages"/.test(f.text)).map((f) => f.name)).toEqual([]);
  });
});
