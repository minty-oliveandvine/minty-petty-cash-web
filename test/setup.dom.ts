// The DOM half of the setup, loaded by ./setup.ts whenever a test file has a window.
//
// jest-dom's matchers are imported from the '/vitest' entry point, not the bare package: the
// bare one registers against Jest's expect and silently adds nothing here.

import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// findBy*/waitFor wait 2.5s, not the default 1s - the sibling apps' setting, for full-suite runs.
configure({ asyncUtilTimeout: 2500 });

// RTL only auto-cleans when a global `afterEach` exists, and this project runs with globals
// disabled -- so without this, every render stacks up in the same document.
afterEach(() => {
  cleanup();
  // Every test starts with an empty cookie jar; lib/auth.ts is cookie-backed.
  for (const c of document.cookie.split("; ").filter(Boolean)) {
    document.cookie = `${c.split("=")[0]}=;path=/;max-age=0`;
  }
  localStorage.clear();
  sessionStorage.clear();
});
