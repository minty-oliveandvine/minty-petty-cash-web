# Browser tests

Playwright, against a stack that is **already up** - nothing is started here:

- this app: `npm run dev` (port 3010), with `.env.local` from `.env.example`;
- Minty (the Flask app) on 5001 locally, which serves the hand-off and, for now, the Petty Cash API
  (`/api/petty-cash/v1/...`).

Every spec runs twice: the `desktop` project and the 360 px `phone` project (Petty Cash is used on a
phone more than 95% of the time).

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
| `01_handoff` | Flask's hand-off lands on the company's dashboard, which reads `GET /home` from the API. A page with no token goes back to the hand-off for the company in its address. Runs against the real stack. |
| `02_dashboard` | Every dashboard state against a **stubbed** API, asserting Flask's look and behaviour: the header; the deposit check (as stated, changed, too high, none, refused, blocked); a date out of sequence (toast); a draft and its Continue; a submitted day; Setup Required that can't be dismissed; read-only access. Needs only `npm run dev`; Flask's pages are caught, not opened. |
| `03_opening` | The Opening step against a **stubbed** API: Flask's header and balances, the addition's formatting and the live Opening Cash Balance, a draft's values, unsaved changes holding the stepper back, Save & Next / Save & Exit, a refused day landing on the dashboard with its message, Fix Negative Balance, a clean reload. |
| `05_expenses` | The Expenses step against a **stubbed** API: the list and its total, the empty line, Add's required fields and the multipart line it sends, a refused file type, the server's refusal, the supplier search and a new supplier, the account search, delete through the modal (and a refused one), Expense Details with its receipt opened full screen, the open card holding the stepper back, Save & Next to Bank Deposit (in-app), Save & Exit, no draft back to Opening, Sales landing here in-app, a clean reload. |
| `06_deposit` | The Bank Deposit step against a **stubbed** API: the illustration and the cash on hand, a saved deposit, the limit said as you type (nothing sent past it), the server's 422 on the field, Save & Next to Cash Count in-app, Save & Exit, Fix Negative Balance (undismissable, its three ways back), unsaved changes holding the stepper back, no draft back to Opening, Expenses landing here in-app, a clean reload. |
| `07_cash_count` | The Cash Count step against a **stubbed** API: the expected cash, the fields and the totals, the calculator (a 0.50 coin, row totals, Save, Escape and the X, a count past the limit), short / over / none and the locked reason, a one-cent shortage needing a reason on Save & Next, Save & Exit without one, the server's 422 on its field, a saved count, Fix Negative Balance with Deposit, the stepper hold, no draft back to Opening, Expenses → Deposit → Cash Count in-app, Save & Next to Ending in-app, a clean reload. |
| `08_ending` | The Ending step against a **stubbed** API: the draft callout, the four cards and their figures (against yesterday up and down, the 30 bars with the day in red, the expense donut and its names, the cash balance), Show more on each, no yesterday / no expenses / no difference, the shortage and surplus box, Finish posting `{transaction_date}` once on a double click with "Finishing..." then Flask's Submitted page, a 409 sending the person to the step that fixes it with the sentence, an already-submitted refusal, a failure that keeps the day, a problem on arrival (said, beside Finish, nothing posted), Fix Negative Balance, no draft back to Opening, a submitted day to Flask's page, Back to Cash Count and Cash Count's Save & Next back here in-app, a clean reload. |
