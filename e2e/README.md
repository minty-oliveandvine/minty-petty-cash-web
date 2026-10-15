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
| `02_dashboard` | The launch page (Part 15.6a) against a **stubbed** API: no console error after a reload; not started (greeting, five stages, no calendar); in progress (3 of 5 done, Next, "Saved 6:02 pm" on a fixed Hong Kong clock, stage links, Continue to Flask's resume); the gate banner; done (View report); first use; recent reports and See all; Setup Required that can't be dismissed; read-only access. Start still passes through the deposit check (as stated, changed with the amount limit, none, refused, blocked) and lands on this app's Addition to Drawer, as does Continue on a report left there. The Drawer and Sales reads are quiet stubs. Needs only `npm run dev`; Flask's wizard, summary and history pages are caught, not opened. |
| `03_addition` | The Addition to Drawer stage (Part 15.9 / 15.15) against a **stubbed** API: the Workflow header, the five stages and the starting cash as facts (from the last closing, or from setup); a draft's values and its done stages' links; the amount cleaned as typed, grouped on blur and moving the opening cash; Save & Next (also by Enter) with its payload, opening this app's Sales stage; Save & Exit home; a refused day landing on the launch page as a Page banner, read once; any other refusal inline; the two negative-cash gates, never sent; unsaved changes holding the stage links and the back link, with Leave without saving; the launch page's Start opening it; a reload with no console error. Needs only `npm run dev`. |
| `04_sales` | The Sales stage (Part 15.9 / 15.15) against a **stubbed** API: the methods in Settings order under their catalogue names, grouped as Electronic payments, Delivery and Cash (Deliveroo left out; a company with no methods has only Cash); a draft's amounts; typing moving the subtotals and Total sales live; Save & Next (also by Enter) with every method in its payload, opening this app's Expenses; a 12,345,678.90 amount never clipped; Save & Exit home; no draft (409) landing on Addition to Drawer with the sentence as a Page banner, read once; any other refusal inline; unsaved changes holding the stage links and the back link; Addition to Drawer's Save & Next opening it client-side; the launch page's Continue on a `sales` report; a reload with no console error. Needs only `npm run dev`. |
| `05_expenses` | The Expenses stage (Part 15.9 / 15.15c) against a **stubbed** API (nothing reaches Xero): the entries as Record rows with their total, the done stages' links, the empty state; Add expense as a 480 Drawer on a computer and a full-screen sheet on a phone, its fields checked as typed (description over 300 at once; a zero amount and an unknown supplier when left; a wrong, empty or too-large file the moment it is picked), a refused submit's error summary taking focus, the multipart payload, Enter adding; the API's 422 inside the sheet; closing with something entered asking first; supplier search, the duplicate check and a new supplier created only on Add supplier (refused by Xero inline; not offered without the permission); Delete with a Danger confirmation (Cancel first, Escape cancels, a refusal inside it); a saved and a picked receipt opened full screen in the app (no new tab; Escape closes only the viewer); Save & Next to Flask's Bank Deposit; Save & Exit home; no draft (the read's 409) landing on Addition to Drawer with the sentence, read once; Sales' Save & Next opening it client-side; the launch page's Continue on an `expenses` report; the largest amount never clipped; a reload with no console error. Needs only `npm run dev`. |
