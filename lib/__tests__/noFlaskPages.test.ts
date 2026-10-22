// The user's rule (2026-10-16): Flask is a backend only, its HTML is not used - so no screen here
// may send a person to a Flask page. Every address on Flask (`ACCOUNTS_API_URL`) is built in the
// files below, and only to a hand-off, an action or an API (docs/features/petty-cash-web.md,
// "No Flask pages") - since the shared-code refactor (2026-10-21) by @minty/shared's builders,
// handed this app's Flask base.

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
  "lib/hub.ts", // minty-web's settings sections, through /handoff/minty-web
  "components/ui/sidebarHost.ts", // /handoff/minty-web, the payments hand-off, /logout
  "components/settings/SettingsTabs.tsx", // the settings pills' hand-offs
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

/**
 * The @minty/shared builders that may be handed the Flask base: each builds only a hand-off
 * (`/handoff/...`), a payments hand-off (`/entity/<id>/payment-request`,
 * `/entity/<id>/settings/payment-request`) or `/logout` - never a page.
 */
const FLASK_BUILDERS = ["hubHandoffUrl", "flaskHandoffUrl", "settingsSectionUrl", "paymentRequestSettingsUrl", "pettyCashSettingsUrl", "billsUrl", "logoutUrl"];

/** The bases of this app's own Flask clients: the JSON API (lib/apiClient.ts) and its hand-off (lib/handoff.ts). */
const FLASK_BASES = [/\bclients\(\(\) => env\.ACCOUNTS_API_URL\)/g, /\bflaskBase: \(\) => env\.ACCOUNTS_API_URL\b/g];

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

  it("builds every literal one of them to a hand-off, an action or an API - never a page", () => {
    const built = files
      .filter((f) => ALLOWED.has(f.name))
      .flatMap((f) => [...f.text.matchAll(/\$\{env\.ACCOUNTS_API_URL\}([^`]*)`/g)].map((m) => ({ file: f.name, path: m[1] })));
    // a helper that takes the path as an argument (`${path}`) is checked through its callers below
    const literal = built.filter((b) => !/^\$\{\w+\}$/.test(b.path));
    expect(literal.filter((b) => !ALLOWED_PATHS.some((re) => re.test(b.path)))).toEqual([]);
  });

  it("hands the Flask base only to a shared hand-off builder or to this app's own clients", () => {
    const builderCall = new RegExp(`\\b(?:${FLASK_BUILDERS.join("|")})\\(\\s*env\\.ACCOUNTS_API_URL\\b`, "g");
    const uses = files
      .filter((f) => ALLOWED.has(f.name) && f.name !== "lib/env.ts")
      .map((f) => {
        const total = [...f.text.matchAll(/env\.ACCOUNTS_API_URL/g)].length;
        const explained = [...f.text.matchAll(builderCall)].length + FLASK_BASES.reduce((n, re) => n + [...f.text.matchAll(re)].length, 0);
        return { file: f.name, total, explained };
      });
    expect(uses.every((u) => u.total > 0)).toBe(true);
    expect(uses.filter((u) => u.total !== u.explained)).toEqual([]);
  });

  it("leaves no module of Flask page links behind", () => {
    expect(files.some((f) => f.name === "lib/flaskPages.ts")).toBe(false);
    expect(files.filter((f) => /from "@\/lib\/flaskPages"/.test(f.text)).map((f) => f.name)).toEqual([]);
  });
});
