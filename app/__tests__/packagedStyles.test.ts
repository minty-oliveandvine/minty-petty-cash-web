// The silent failure modes of this app's stylesheet, each made loud. It compiles the app's REAL
// app/globals.css with the REAL Tailwind plugin, so it tests what the browser is served.
//
// 1. CLASSES: Tailwind v4 never scans node_modules, so without the `@source` line every utility
//    class inside the packaged sidebar is dropped from the generated CSS - it renders as unstyled
//    stacked text, and nothing errors.
// 2. THIS BRANCH'S LOOK: Flask's exact palette and Tailwind v3 sizes (app/styles/flask-theme.css),
//    and @minty/shared pinned at v0.1 - the sidebar before its Part 13 restyle, which reads the
//    avatar pair and `primary` from this stylesheet.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

  it("gives the v0.1 sidebar the colours it reads, and no Part 13 sheet", () => {
    expect(compiled).toMatch(/--avatar-bg:\s*#ffe6b1/i);
    expect(compiled).toMatch(/--avatar-fg:\s*#6b3a12/i);
    expect(compiled).toMatch(/--color-primary:\s*var\(--primary\)/);
    expect(readFileSync(CSS, "utf8")).not.toContain("@minty/shared/tokens.css");
  });

  it("emits the packaged sidebar's own utilities", () => {
    // Values that appear in the v0.1 sidebar and nowhere in this app's own source: if Tailwind
    // stops scanning node_modules they disappear from the output.
    expect(compiled).toMatch(/background-color:\s*#f7efd9/i);
    expect(compiled).toMatch(/color:\s*#2374f2/i);
  });
});
