# Browser tests

Playwright, against a stack that is **already up** - nothing is started here:

- this app: `npm run dev` (port 3010), with `.env.local` from `.env.example`;
- Minty (the Flask app) on 5001 locally, which serves the hand-off and, for now, the Petty Cash API
  (`/api/petty-cash/v1/...`).

Every spec runs twice: the `desktop` project and the 360 px `phone` project (Petty Cash is used on a
phone more than 95% of the time).

`E2E_BASE_URL` points the specs at another dev server, e.g. a second worktree's on 3012:
`E2E_BASE_URL=http://localhost:3012 npx playwright test e2e/02_dashboard.spec.ts`. The stubbed
spec runs anywhere; `01_handoff` needs an origin Flask's CORS allows (3010 by default).

```
E2E_JWT_SECRET=<Minty's SECRET_KEY>  \
E2E_MINTY_USER=<a user id>           \
E2E_MINTY_ENTITY=<their company id, Petty Cash on>  \
E2E_MINTY_ENTITY_NAME=<that company's name>         \
npm run test:e2e
```

A spec signs its own module token with `E2E_JWT_SECRET`, the same shape Flask's
`/handoff/petty-cash-web` mints, so no Flask sign-in is needed. Without the variables every spec is
skipped and says what to set. Use the local `postgres` database's **E2E Petty Cash Shop** as
`e2e-terms@minty.test`. Never point a spec at a database with real data.

Browse from `localhost`, not `127.0.0.1`: `localhost:3010` is the origin Flask allows by default
(`PETTY_CASH_WEB_URL`).

`e2e/companyRef.ts` is a copy of `@minty/shared/companyRef`, because Playwright cannot load the
package's `.ts` source from `node_modules`. `lib/__tests__/e2eCompanyRef.test.ts` pins the copy to
the package.

| Spec | What it proves |
|---|---|
| `01_handoff` | Flask's hand-off lands on the company's launch page, which reads `GET /home` from the API (its Start, Continue or View report appears). A page with no token goes back to the hand-off for the company in its address. Runs against the real stack. |
| `02_dashboard` | The launch page (Part 15.6a) against a **stubbed** API: no console error after a reload; not started (greeting, five stages, no calendar); in progress (3 of 5 done, Next, "Saved 6:02 pm" on a fixed Hong Kong clock, stage links, Continue to Flask's resume); the gate banner; done (View report); first use; recent reports and See all; Setup Required that can't be dismissed; read-only access. Start still passes through the deposit check (as stated, changed with the amount limit, none, refused, blocked). Needs only `npm run dev`; Flask's wizard, summary and history pages are caught, not opened. |
