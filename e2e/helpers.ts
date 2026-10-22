// What every spec needs: a module token as Flask's /handoff/petty-cash-web would mint it, and the
// way in through /landing. Signed here with Minty's SECRET_KEY (E2E_JWT_SECRET), so a spec needs
// no Flask sign-in - the token is the same shape, and Flask's API verifies it the same way.
//
// The token, the credentials it names and the sideways-scroll check are @minty/shared/e2e's, the
// same in every app's suite; specs take `companyRef` from there too. This file keeps what is
// Petty Cash's own.

import { test, type Page } from "@playwright/test";
import {
  credentials as sharedCredentials,
  mintModuleToken as sharedMintModuleToken,
  type Credentials,
} from "@minty/shared/e2e";

/**
 * The package's token, typed to take this suite's whole Credentials: the specs that stub the API
 * pass an object literal with `entityName`, which the package's narrower parameter type refuses.
 */
export const mintModuleToken: (creds: Credentials, overrides?: Record<string, unknown>) => string =
  sharedMintModuleToken;
export { expectNoSideScroll as expectNoHorizontalScroll } from "@minty/shared/e2e";
export type { Credentials } from "@minty/shared/e2e";

/**
 * The spec's credentials, or the spec is SKIPPED with what to set (e2e/README.md). Stricter than
 * the package's `credentials()`, which returns null, and its `requireCredentials()`, which throws:
 * this suite also needs E2E_MINTY_ENTITY_NAME set (no seed-name default), and an unconfigured run
 * reads as "not run here", never as a failure.
 */
export function credentials(): Credentials {
  const creds = sharedCredentials();
  test.skip(
    !(creds && process.env.E2E_MINTY_ENTITY_NAME),
    "Set E2E_JWT_SECRET (Minty SECRET_KEY), E2E_MINTY_USER, E2E_MINTY_ENTITY and E2E_MINTY_ENTITY_NAME (see e2e/README.md)",
  );
  return creds as Credentials;
}

/** Arrive as Flask's hand-off sends a person: /landing with the token, on to `next`. */
export async function enter(page: Page, creds: Credentials, next: string) {
  const qs = new URLSearchParams({
    token: mintModuleToken(creds),
    entity_id: creds.entityId,
    entity_name: creds.entityName,
    next,
  });
  await page.goto(`/landing?${qs.toString()}`);
}
