// @minty/shared/eslint: next/core-web-vitals + typescript and the folders no app lints. This app
// adds nothing of its own.
import { defineConfig, globalIgnores } from "eslint/config";
import minty from "@minty/shared/eslint";

export default defineConfig([
  ...minty,
  // The Cloudflare Workers build (OpenNext) and wrangler's local state: generated, not ours.
  globalIgnores([".open-next/**", ".wrangler/**"]),
]);
