// Petty Cash Settings is the hub's tab since 2026-11-10 (owner): minty-web's
// `/entity/<shortid>/<name>/settings/petty-cash`. This app's old address only sends the person on,
// to the same path on accounts-api, whose gated hand-off opens the hub's tab; the dashboard's
// Entity Settings and the sidebar's Settings go to the hub through /handoff/minty-web. The page
// itself and its tests are minty-web's (features/petty-cash-settings). Needs only `npm run dev`.

import { expect, test } from "@playwright/test";

import { companyRef } from "./companyRef";
import { ACCOUNTS_API_URL, landingAddress, mintModuleToken } from "./helpers";

const ENTITY = "3d65f186-5ba1-4bf7-a1b0-cc64a113eb5c";
const NAME = "E2E Petty Cash Shop";
const SETTINGS = `/entity/${companyRef(ENTITY, NAME)}/settings/petty-cash`;

test("the old address goes on to accounts-api, which opens the hub's tab", async ({ page }) => {
  // accounts-api's company address is where the browser is sent; caught here, so nothing leaves
  let sentTo = "";
  await page.route(`${ACCOUNTS_API_URL}/entity/**`, (route) => {
    sentTo = route.request().url();
    return route.fulfill({ contentType: "text/html", body: "<title>Hub</title><p>Hub</p>" });
  });
  await page.route("**/api/petty-cash/v1/companies/**", (route) =>
    route.fulfill({ status: 500, json: { error: "not in this test" } }),
  );
  const token = mintModuleToken({
    secret: "stub",
    userId: "u",
    entityId: ENTITY,
    entityName: NAME,
  });
  await page.goto(
    await landingAddress(page, token, { entity_id: ENTITY, entity_name: NAME, next: SETTINGS }),
  );
  await expect.poll(() => sentTo).toBe(`${ACCOUNTS_API_URL}${SETTINGS}`);
});
