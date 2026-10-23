// The way in: Flask's hand-off lands on /landing with a token, the app stores it and goes on to the
// company's Petty Cash dashboard, which reads GET /home from the Petty Cash API - against the
// real stack (local Flask). Runs on the computer and the 360px phone projects.

import { expect, test } from "@playwright/test";

import { credentials, enter, expectNoHorizontalScroll } from "./helpers";
import { companyRef } from "./companyRef";

test("the hand-off lands on the company's Petty Cash dashboard, read from the API", async ({
  page,
}) => {
  const creds = credentials();
  const home = `/entity/${companyRef(creds.entityId, creds.entityName)}/petty-cash`;

  await enter(page, creds, home);

  await expect(page).toHaveURL(new RegExp(`${home}$`));
  // Flask's header: the company's initials are the page's h1
  const initials = creds.entityName
    .split(/\s+/)
    .map((w) => w[0].toUpperCase())
    .join("");
  await expect(page.getByRole("heading", { level: 1, name: initials })).toBeVisible();
  // the dashboard drew from GET /home (the calendar appears only once it answered)
  await expect(page.getByRole("heading", { name: "Report Calendar" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("a page with no token goes to Flask's hand-off for the company in its address", async ({
  page,
}) => {
  const creds = credentials();
  const home = `/entity/${companyRef(creds.entityId, creds.entityName)}/petty-cash`;

  const answer = await page.request.get(home, { maxRedirects: 0 });

  expect(answer.status()).toBe(307);
  const target = new URL(answer.headers()["location"]);
  expect(target.pathname).toBe("/handoff/petty-cash-web");
  expect(target.searchParams.get("next")).toBe(home);
  expect(target.searchParams.get("entity_id")).toBe(companyRef(creds.entityId, creds.entityName));
});
