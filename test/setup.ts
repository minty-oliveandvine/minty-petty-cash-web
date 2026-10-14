// Runs before every test file, in whichever environment that file asked for.
//
// The DOM half lives in ./setup.dom.ts and is loaded only when there is a window: the proxy's
// test declares `@vitest-environment node` (NextRequest wants the platform Request), and a
// setup that reached for `document` unconditionally would fail it before a single case ran.

export {}; // a module, so the top-level await below is allowed

if (typeof window !== "undefined" && typeof document !== "undefined") {
  await import("./setup.dom");
}
