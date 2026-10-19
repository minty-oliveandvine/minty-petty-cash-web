// The silent failure modes of this app's stylesheet, each made loud. It compiles the app's REAL
// app/globals.css with the REAL Tailwind plugin, so it tests what the browser is served.
//
// 1. CLASSES: Tailwind v4 never scans node_modules, so without the `@source` line every utility
//    class inside the packaged sidebar is dropped from the generated CSS - it renders as unstyled
//    stacked text, and nothing errors.
// 2. THIS BRANCH'S LOOK: Flask's exact palette and Tailwind v3 sizes (app/styles/flask-theme.css)
//    for every page, and @minty/shared at v0.4 (the owner, 2026-10-19) for the menu - drawn in
//    tokens.css's names, so without that sheet it draws in Tailwind's defaults (transparent).
// 3. RADII: tokens.css redefines rounded-sm/md/lg/xl to Part 13's 4/8/12/16 px. The pages draw
//    only with the `flask-*` radii, so a plain rounded-md..4xl in this app would silently change
//    size against Flask's.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { beforeAll, describe, expect, it } from "vitest";

const CSS = "app/globals.css";
const PKG_SRC = "node_modules/@minty/shared/src";

let compiled = "";

beforeAll(async () => {
  compiled = (await postcss([tailwind()]).process(readFileSync(CSS, "utf8"), { from: resolve(CSS) })).css;
}, 120_000);

describe("the stylesheet", () => {
  it("declares the source so Tailwind scans the package", () => {
    const source = readFileSync(CSS, "utf8");
    expect(source).toContain('@import "@minty/shared/theme.css";');
    expect(source).toContain('@import "@minty/shared/tokens.css";');
    expect(source).toContain(`@source "../${PKG_SRC}";`);
    expect(existsSync(resolve(PKG_SRC, "sidebar/SideMenu.tsx"))).toBe(true);
  });

  it("keeps @source after every @import, or the last import is dropped", () => {
    const source = readFileSync(CSS, "utf8");
    expect(source.indexOf("@source ")).toBeGreaterThan(source.lastIndexOf("@import "));
  });

  it("emits the shared faces", () => {
    expect(compiled).toMatch(/--font-sans:\s*var\(--font-inter\)/);
  });

  it("emits Flask's palette and Tailwind v3 sizes, and the utilities the pages bind to", () => {
    expect(compiled).toMatch(/--color-flask-teal:\s*#54d3da/i);
    expect(compiled).toMatch(/--radius-flask-lg:\s*0\.5rem/);
    expect(compiled).toMatch(/\.bg-flask-teal\s*\{/);
    expect(compiled).toMatch(/\.rounded-flask-xl\s*\{/);
    expect(compiled).toMatch(/\.shadow-flask-xl\s*\{/);
  });

  it("takes Part 13's tokens for the menu, with nothing local declaring their names", () => {
    expect(compiled).toMatch(/--color-surface-card:\s*var\(--minty-neutral-0\)/);
    expect(compiled).toMatch(/--color-accent-avatar-bg:\s*var\(--minty-yellow-50\)/);
    expect(compiled).toMatch(/--radius-lg:\s*12px/);
    expect(compiled).toMatch(/--text-title-l:\s*20px/);
    // A local --radius-sm..xl, --text-* or one of tokens.css's colour groups would win invisibly
    // over the shared sheet (or be overridden by it).
    for (const file of [CSS, "app/styles/flask-theme.css"]) {
      const own = readFileSync(file, "utf8");
      expect(own, file).not.toMatch(/^\s*--(radius-(sm|md|lg|xl)|text-[\w-]+|color-(brand|surface|border|text|action|state|status|module|accent|overlay)-[\w-]+):/m);
    }
  });

  it("draws the pages with Flask's radii, never a step tokens.css resizes", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== "__tests__") walk(path);
        } else if (/\.(tsx?|css)$/.test(name)) files.push(path);
      }
    };
    ["app", "components", "lib"].forEach(walk);
    const offenders = files.flatMap((file) =>
      (
        readFileSync(file, "utf8")
          // comments quote Flask's own classes as the source of a value; they are not ours
          .replace(/\/\*[\s\S]*?\*\/|(?<!:)\/\/.*$/gm, "")
          .match(/(?<![\w-])rounded(-[trblse]{1,2})?-(md|lg|xl|2xl|3xl|4xl)(?![\w-])/g) ?? []
      ).map((cls) => `${file}: ${cls}`),
    );
    expect(offenders).toEqual([]);
  });

  it("emits the packaged sidebar's own utilities", () => {
    // Declarations, not class selectors: no escaping to get wrong. Each appears in the v0.4
    // sidebar and nowhere in this app's own source, so if Tailwind stops scanning node_modules
    // they disappear from the output.
    expect(compiled).toMatch(/width:\s*min\(100%,\s*353px\)/); // Sidebar's menu panel
    expect(compiled).toMatch(/padding-top:\s*max\(48px,\s*env\(safe-area-inset-top,\s*0px\)\)/); // SideMenu's nav
    expect(compiled).toMatch(/margin-left:\s*calc\(var\(--spacing\)\s*\*\s*22\)/); // the logo
    // tokens.css colour roles only the packaged sidebar uses here
    expect(compiled).toMatch(/background-color:\s*var\(--color-state-selected\)/);
    expect(compiled).toMatch(/background-color:\s*var\(--color-accent-avatar-bg\)/);
  });
});
