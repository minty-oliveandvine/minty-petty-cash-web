# minty-petty-cash-web - the app, its sign-in and its backends

Petty Cash's own front end (Next.js 16, Tailwind v4, port **3010**). It is replacing the Petty Cash pages in Minty (the Flask app) and redesigning them to the owner's guidelines (Parts 13-15, `Minty/docs/design/`).

- `main` is this scaffold.
- The redesign is built on `development` and reviewed as a PR into `main`.
- Production keeps Flask's pages until traffic is switched.

## Addresses

One company's Petty Cash lives at `/entity/<shortid>/<name>/petty-cash/...`. This is the address form every Minty app shares (`@minty/shared/companyRef`, Flask's `blueprints/shared/entity_ref.py`).
- The first 8 hex characters decide the company.
- The name is only for reading.

`/` sends a signed-in person to their company's Petty Cash.

## Sign-in: Flask mints, this app never refreshes

Flask is the only thing that mints tokens. This app has no login and no refresh, the same model as minty-web.

1. Flask's login-gated `GET /handoff/petty-cash-web?next=<path>&entity_id=<company>` (Minty `blueprints/entity/routes/modules.py`) mints a 30-minute module token for **one** company. It does so only if the person belongs to that company, the company is past onboarding and Petty Cash is on for it.
2. Flask sends the browser to `/landing?token=…&next=…&entity_id=…&entity_name=…`.
3. `/landing` stores the token in the `petty_cash_token`, `petty_cash_entity_id` and `petty_cash_entity_name` cookies (`lib/auth.ts`). Their names are this app's own, because every localhost port shares one cookie jar. The cookies live exactly as long as the token's `exp`.
4. `proxy.ts` (Next 16's middleware) gates every page:
   - **No cookie:** back through the hand-off, naming the company from the address. Flask accepts a uuid or `<shortid>/<name>`.
   - **A cookie for another company than the address names:** the same. The token is for one company.
   - **Under 5 minutes left:** renewed on the way to the next page, never in the middle of a form.
5. **A 401 from any API call:** back through the hand-off, once (`lib/handoff.ts`).

## Backends (`lib/env.ts`, `lib/apiClient.ts`)

The variable names follow the owner's 2026-10-14 decision: Flask is becoming `accounts-api`, and Petty Cash gets its own API.

| Variable | What | Default (decided ports) | Today on a workstation |
|---|---|---|---|
| `ACCOUNTS_API_URL` | Flask: the hand-off, `/api/me/profile`, logout | `http://localhost:8000` | `http://localhost:5001` |
| `PETTY_CASH_API_URL` | Petty Cash's API: `pettyCashFetch` | `http://localhost:8010` | `http://localhost:5001` (Flask serves it for now) |
| `SUBSCRIPTION_API_URL` | the sidebar's Subscriptions | `http://localhost:8001` | `http://localhost:8000` |
| `PAYMENT_REQUEST_WEB_URL` | the sidebar's Bills (fallback) | `http://localhost:3020` | same |

- **Inlined at build time.** Every variable is listed under `next.config.ts`'s `env`.
- **The Petty Cash API is in Flask for now.** It lives at `/api/petty-cash/v1/companies/<id>/...`, Minty's `blueprints/petty_cash_api` (Minty `docs/features/petty-cash-api.md`). The owner's target is a Django `minty-petty-cash-api` serving **the same paths**, so only `PETTY_CASH_API_URL` changes when it moves.
- **The company is only in the path.** Flask checks it against membership on every call, and the door fails closed.
- **One header pair.** Every call sends `Authorization` and nothing else (Flask's CORS allows `Authorization` and `Content-Type`).
- **Errors.** A refusal is `{"error": "<sentence>"}`, and the screen shows the sentence as it stands. A fetch that never got an answer says "We couldn't reach Petty Cash. Check your connection, then reload the page." It is never the browser's error text.

## The sidebar

**On `development`, `@minty/shared` is pinned at `v0.1`** (the user, 2026-10-14). That is the sidebar from before its Part 13 restyle, the menu Flask's pages show, so it matches the pixel-faithful port. The cost:
- v0.1 has no `previewSibling`, so `lib/previewSibling.ts` is a copy of v0.3's (minty-web keeps one the same way). Change the package first, then the copy.
- v0.1 has no Part 13 `tokens.css`, so the colours the sidebar reads (`--avatar-bg`, `--avatar-fg`, `--primary`) are declared in `app/globals.css`.

`port/prw-look` pins `v0.3`.


`@minty/shared/sidebar`, with this app's host in `components/ui/sidebarHost.ts`. That file is the only app-specific part.
- **This app's own pages:** Dashboard, Reports and Settings.
- **minty-web's pages, through Flask's hand-offs:** the entity list, Subscriptions and My Profile.
- **Through Flask's `/entity/<id>/payment-request`:** Bills.
- **No profile slot.** My Profile is minty-web's page.

## Design

- **Tokens:** `@minty/shared/tokens.css`, Part 13. Screens bind only to semantic utilities, and `__tests__/no_raw_colours.test.ts` fails on a hex or a palette colour.
- **Icons:** Material Symbols **Rounded**.
- **Fonts:** Inter through `next/font`. No Jakarta, because the mark is an image.
- **The `@source` line.** `app/__tests__/packagedStyles.test.ts` guards the `@source` line that makes Tailwind scan the package.

## Tests

| Command | What |
|---|---|
| `npm test` | Vitest. Covers the proxy, auth, the hand-off, the API client, company addresses, the sidebar host and the three guards (styles, assets, raw colours). |
| `npm run test:e2e` | Playwright on a 1440 px desktop and a 360 px phone, against local Flask (`e2e/README.md`). |

`npm run lint` and `npm run typecheck` complete the gate. CI runs everything but e2e (`.github/workflows/ci.yml`, the shared `next-web.yml@v1`).

## Ported so far (`development`)

`development` is a **pixel-faithful port** of Flask's Petty Cash pages (the user, 2026-10-14):
- Flask's look, kept exactly: its phone card, colours, type, spacing, buttons, modals and toasts.
- The same sections, steps, wording, rules and destinations.

The same pages drawn in minty-payment-request-web's design are on the **`port/prw-look`** branch. The Part 15 redesign comes later, on its own branch.

**How the look is kept exact.** Flask draws with Tailwind v3 (from a CDN) and hex values. This app uses Tailwind v4 and `@minty/shared`'s Part 13 tokens, where the scales differ: `rounded-lg` is 12px, the greys are oklch, and the shadows were renamed. So every value Flask uses is declared once, as `flask-*` theme tokens, in `app/styles/flask-theme.css`, and the ported pages draw only with those. No hex appears in a class, so `__tests__/no_raw_colours.test.ts` still holds. The phone card's widths are Flask's: full width, then 640, 768 and 1024 px.

**Order.** Dashboard, then the report wizard, history, settings and Xero publish. Pages not ported yet are Flask's, linked from `lib/flaskPages.ts`. The person is already signed in to Flask, because this app's token came from Flask's login-gated hand-off.

### Dashboard: `/entity/<shortid>/<name>/petty-cash`

This is Flask's `entity/entity_dashboard_v2.html`, built from `components/dashboard/` and `components/flask/`. Its rules live in `lib/dashboard.ts`, and it makes one read, `GET /home`.

The page is the same in every element:
- Flask's header: the back chevron, the company's initials, the person's initials and the ≡. The two buttons open the shared sidebar.
- The warning banner, "Today's report is submitted", and Report in Progress / Current balance.
- "Pick up where you left off" with Flask's six-pill stepper. Its labels are 7.6px on a phone, as Flask draws them, which is below the workspace's 12px minimum, deliberately.
- Start New Report / View Report.
- Quick Actions.
- The Report Calendar and its legend.
- "Before You Start", "Deposit to Bank" and the non-dismissable "Setup Required".
- The top-right toasts.

Behaviour is Flask's, minus its bugs:
- **One "today".** It is always the server's Hong Kong date. Flask mixed the browser's date, UTC and Hong Kong time.
- **The date rules always run.** Starting a report checks them every time; Flask skipped them after a calendar click.
- **The right day is corrected.** The deposit correction targets the day shown in the dialog.
- **The amount field accepts small amounts.** "0.50" can be typed; Flask turned a zero into "-".
- **Removed:**
  - Flask's always-hidden bank and date fields, and the live Xero read behind them;
  - the "1 user" count, which never counted;
  - the heading overwrite that happened in draft mode.

Not ported yet:
- **The subscription notice.**
- **The "Congratulations!" modal**, which comes with the settings page.

### Report wizard, Opening: `/entity/<shortid>/<name>/petty-cash/reports/new/opening?transaction_date=`

This is Flask's `report/opening.html`, at Flask's own address for it. It is built from `components/report/OpeningStep.tsx` and `ReportChrome.tsx` (the report header badge and the "Saving..." overlay), and reads and saves through `GET`/`PUT /reports/opening`.

What it keeps from Flask:
- **The report header:** the "14 OCT" date pill, the initials and the Draft badge.
- **The stepper.** The page is the current step; links follow the draft, and unsaved changes hold them back with Flask's toast.
- **The balances:** the illustration, then Starting Cash Balance, Cash Till Balance and Safebox.
- **"Addition to Cash Drawer".** `lib/currencyInput.ts` is Flask's `currency.js`: the value is cleaned while you type, then grouped and padded when you leave the field.
- **"Withdrawal from:"** with Flask's forms-plugin radios (`.flask-radio`).
- **The live Opening Cash Balance.**
- **Save & Next and Save & Exit.**
- **"Fix Negative Balance"**, which cannot be dismissed.

Where the app differs:
- **The opening balance is the server's.** Flask took it from a hidden form field.
- **A refused day lands on the dashboard with its message.** `lib/flash.ts` carries Flask's flash there, so the message still shows.
- **Ported steps open in this app.** The dashboard's Start, the deposit check and the stepper all go through `lib/wizardPages.ts`, which sends the ported steps here and the rest to Flask. Bank Deposit onwards is still Flask's.

### Report wizard, Sales: `/entity/<shortid>/<name>/petty-cash/reports/new/sale?transaction_date=`

This is Flask's `report/sales.html`, at Flask's own address for it. It is built from `components/report/SalesStep.tsx` and `lib/sales.ts`, and reads and saves through `GET`/`PUT /reports/sales`.

What it keeps from Flask:
- **The report header and the stepper**, as on Opening, with the same unsaved-changes hold. Emptying a field does not count as a change, as in Flask.
- **"Sales Entry"**, then one card:
  - **Electronic Payments** and **Delivery Sales**: a field per method the company switched on, two to a row, in Settings order. Deliveroo is left out of delivery.
  - **Cash Sales**: one full-width field with no label.
  - each section ends in its running total ("Total Electronic Payment Sales", "Total Delivery Sales", "Total Cash Sales").
- **Flask's labels:** Python's `.title()` of each name, so "WeChat Pay" shows as "Wechat Pay" and "OpenRice" as "Openrice" (`flaskLabel`).
- **The money fields** of `lib/currencyInput.ts`. A zero shows as an empty field with the "0.00" placeholder.
- **Save & Next** (to Expenses, in this app) and **Save & Exit**.

Where the app differs:
- **No stand-in fields.** Flask shows Visa, Mastercard and Food Panda to a company with no methods, then drops what is typed in them. They are left out here.
- **A save with no draft** goes back to Opening with Flask's sentence as a toast.
- **Flask's save bugs are fixed in the shared service** (Minty `report/services/sales.py`): a re-save closed on the cash typed the time before, and a method the page has no field for was zeroed.
- **Not yet:** the read-only view of a submitted report, with its Close button. It comes with the Submitted step.
- **One column on phones** (the owner, 2026-10-15): Flask's two-column grid cut an amount like "1,200.50" short beside the currency code at 360 px, so the fields stack below 640 px and pair up from there. The only layout change from Flask on this page.

### Report wizard, Expenses: `/entity/<shortid>/<name>/petty-cash/reports/new/expense?transaction_date=`

This is Flask's `report/expense.html`, at Flask's own address for it. It is built from `components/report/ExpensesStep.tsx` (the page, the list and the two modals), `AddExpenseCard.tsx` (the add card) and `ReceiptViewer.tsx`, with its rules in `lib/expenses.ts`. It talks to `GET`/`PUT /reports/expenses`, `POST /reports/expenses/lines` (multipart), `DELETE /expense-lines/<id>`, `GET /expense-lines/<id>/receipts/<receipt id>` and `POST /suppliers`. `lib/apiClient.ts` gained a multipart body (`form`) and `pettyCashBlob` for a receipt's bytes.

What it keeps from Flask:
- **The report header and the stepper.** While the add card is open, the stepper holds with Flask's "You have an unsaved expense. Please save before navigating."
- **"Expenses"**, then one card listing the day's lines as Flask's server-drawn rows: the account's name in bold ("N/A" without one), the supplier, the description, the amount in red, and the bin. "No expenses added yet" when there are none, then "Total Expense" and "+ Add New Expense".
- **The add card, inline below the list:**
  - "Receipt/Document": the dashed box to click or drop on. A picture shows itself (borderless, 256 x 192). A PDF turns the box green with `"<name>" Uploaded` and "Click to change files". The corner button opens the picked file full screen.
  - "Expense Amount" with `lib/currencyInput.ts`, and "Description".
  - "Suppliers": A to Z, any part of the name in any case, "+ Add '<text>' as a new contact" and "No Xero contact found", with ↑/↓/Enter/Escape. The "New Contact" panel (Cancel / Create, "Creating Contact...") adds the supplier to the list and chooses it.
  - "Account Code": the name with its code under it, filtered by name.
  - Cancel / Add. Add refuses an amount of 0, a supplier or account not chosen from its list, or no receipt, with red borders and "Please fill out the Required Fields".
  - Flask's file sentences: "I can take PDF, JPEG, or PNG files.", "Files need to be under 10MB." and, on a drop, "Only one file is allowed per expense." A drop names the file, as Flask's does.
- **Expense Details** (a tap on a line): the receipt first, "Amount Paid", Contact Name, Description and Account (`<code> <account>`), and Close.
- **Delete Expense** (the bin): Flask's warning, Cancel / Delete, "Deleting Expense...".
- **Flask's toasts and overlays**, word for word, and **Save & Next** (to Flask's Bank Deposit) / **Save & Exit**.

Where the app differs:
- **The server's sentence is shown.** A refused add, delete or new supplier shows what the API says; Flask's own fallbacks are used only when it says nothing.
- **Receipts open full screen, never in a tab**, in Flask's receipt viewer. Their bytes are read with the bearer and shown as object URLs. This app does not carry pdf.js, so a PDF is not drawn as pages:
  - in the add card it shows Flask's green "Uploaded" box with its tick;
  - in Expense Details it is a tile with its name and "Open";
  - full screen it is the browser's own PDF viewer in an `<object>`. Phone browsers that cannot show a PDF inline say "This PDF can't be previewed here."
- **No page reload.** A delete updates the list and the total from the API's answer; Flask reloads the page.
- **"+ Add … as a new contact" is offered only to someone allowed to create one** (`permissions.create_supplier`). Flask offers it to everyone and the server refuses.
- **The drop box keeps its wording.** After an add or a cancel Flask's box says "Click to upload", which loses "or drag and drop"; here it never changes.
- **Enter works.** Enter in the add card adds, and in New Contact it creates. Flask's Enter does nothing there.
- **Every name is text.** Flask writes supplier and account names into its dropdowns as HTML; React escapes them.
- **Left out:** editing a saved line (Flask's page has no way into it), the dead "submit all" path, the receipt reader (`expense_ai.js`, behind a flag), and the read-only view of a submitted report.
- **Known, as in Flask:** Save & Next or Save & Exit with the add card still open leaves the typed expense unsaved, without a warning. Typing does not clear an open toast, which Flask does.

## Not here yet

- **The other pages.** The rest of the report wizard (Bank Deposit, Cash Count, Ending, Submitted), history, the report summary, settings and Xero publish are next, in that order.
- **PR previews and the Vercel project** belong to the infra step (Step 5), which is being re-planned. That is why there is no `preview.yml` yet.
