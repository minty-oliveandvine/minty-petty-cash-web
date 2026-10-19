// No Flask pages (the owner, 2026-10-16): "The frontend/HTML in flask will not be used. flask will be
// an exclusive backend." So no screen here may send a person to a Flask page. Flask stays reachable
// only as a backend: its login-gated hand-offs (which mint a token and redirect), `/logout`, and its
// JSON APIs. This guard reads the source as text and fails on any Flask address (`ACCOUNTS_API_URL`)
// built anywhere but those helpers - lib/handoff.ts and lib/apiClient.ts - and on any path there
// that is not on the list below. Add to the list only a backend route, with the reason beside it.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const DIRS = ["app", "components", "lib"];
/** The repo root's own sources (the proxy runs on every request). */
const ROOT_FILES = ["proxy.ts"];

/** Where the setting is declared, not used. */
const DECLARED = "lib/env.ts";

/** file -> the Flask addresses it may build, each a backend route and never a page. */
const ALLOWED: Record<string, { pattern: RegExp; why: string }[]> = {
  "lib/handoff.ts": [
    { pattern: /^ACCOUNTS_API_URL\}\/handoff\/petty-cash-web\?/, why: "mints this app's token and redirects back" },
    { pattern: /^ACCOUNTS_API_URL\}\/handoff\/minty-web\?/, why: "mints minty-web's token and redirects there" },
    { pattern: /^ACCOUNTS_API_URL\}\/entity\/\$\{id\}\/payment-request`/, why: "mints the payments app's token and redirects to its home" },
    { pattern: /^ACCOUNTS_API_URL\}\/entity\/\$\{id\}\/settings\/payment-request`/, why: "mints the payments app's token and redirects to its settings" },
    { pattern: /^ACCOUNTS_API_URL\}\/logout`/, why: "ends the session" },
  ],
  "lib/apiClient.ts": [{ pattern: /^ACCOUNTS_API_URL, path, init\)/, why: "mintyFetch - Flask's JSON hub API" }],
};

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "__fixtures__" || name === "node_modules") continue;
      out.push(...sources(p));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Each use of the Flask address in `text` that `rel` may not make, as `rel:line  code`. */
function offences(rel: string, text: string): string[] {
  if (rel === DECLARED) return [];
  const found: string[] = [];
  for (const match of text.matchAll(/ACCOUNTS_API_URL[^\n]*/g)) {
    if ((ALLOWED[rel] ?? []).some((a) => a.pattern.test(match[0]))) continue;
    const line = text.slice(0, match.index).split("\n").length;
    found.push(`${rel}:${line}  ${match[0].trim()}`);
  }
  return found;
}

describe("the guard itself", () => {
  it.each([
    ["components/x.tsx", "const u = `${env.ACCOUNTS_API_URL}/entity/${id}/settings/petty-cash`;"],
    ["lib/handoff.ts", "return `${env.ACCOUNTS_API_URL}/entity/${id}/petty-cash/reports/resume`;"],
    ["lib/handoff.ts", "return `${env.ACCOUNTS_API_URL}${path}`;"],
    ["lib/flaskPages.ts", "return `${env.ACCOUNTS_API_URL}/entity/${encodeURIComponent(entityId)}`;"],
  ])("catches a Flask page in %s", (rel, sample) => {
    expect(offences(rel, sample)).toHaveLength(1);
  });

  it.each([
    ["lib/handoff.ts", "withReturnOrigin(`${env.ACCOUNTS_API_URL}/handoff/minty-web?${qs.toString()}`)"],
    ["lib/handoff.ts", "return `${env.ACCOUNTS_API_URL}/logout`;"],
    ["lib/apiClient.ts", "return requestJson<T>(env.ACCOUNTS_API_URL, path, init);"],
    ["lib/env.ts", 'ACCOUNTS_API_URL: url(process.env.ACCOUNTS_API_URL, "http://localhost:8000"),'],
  ])("lets the backend address in %s through", (rel, sample) => {
    expect(offences(rel, sample)).toEqual([]);
  });
});

describe("No Flask pages: Flask is a backend only", () => {
  it("builds a Flask address only through the hand-off and API helpers", () => {
    const files = [...DIRS.flatMap((dir) => sources(join(ROOT, dir))), ...ROOT_FILES.map((f) => join(ROOT, f))];
    const found = files.flatMap((file) => offences(relative(ROOT, file).split(sep).join("/"), stripComments(readFileSync(file, "utf8"))));
    expect(found, `a Flask address outside the allowed hand-offs and APIs (lib/handoff.ts):\n${found.join("\n")}`).toEqual([]);
  });
});
