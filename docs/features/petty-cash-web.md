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
| `npm test` | Vitest. Covers the proxy, auth, the hand-off, the API client, company addresses (a report's own pages included), the sidebar host, the dashboard's and the wizard steps' rules, the submitted report's (`lib/report.ts`), report history's (`lib/history.ts`: the filters in the address, Flask's pager, the CSV link, a row's badge, time and figures, the range calendar's picks), settings' (`lib/settings.ts`: the address, the pickers' filter, what the country Save sends, the catalogue, a method name's live checks, a shared method's rename sentence, Move up / down, view-only), the flash and the next-day hand-over, and the three guards (styles, assets, raw colours). |
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

- **View Report opens the report's own view in this app** (by the day's `id` in `published`), no longer Flask's summary.
- **"Continue to next day report" starts the day here.** The Submitted page leaves the next day for the dashboard (Flask's `autoStartNextDay`, `takeNextDay` in `lib/flash.ts`). The dashboard selects it and runs Start New Report for it, date rules and deposit check included.

- **Every settings link opens this app's settings page** (Entity Settings, Setup Required's Set Up Settings, Before You Start's "Settings → Petty Cash"). Its Xero card leads on to Flask's page for the Xero mapping, which is what Setup Required and the deposit check are about.

Not ported yet:
- **The subscription notice.**
- **The "Congratulations!" modal.** Flask shows it after the first Xero mapping save, which stays on Flask's settings page.

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
- **Ported steps open in this app.** The dashboard's Start, the deposit check and the stepper all go through `lib/wizardPages.ts`, which sends every step of the wizard here. The Submitted page after it is this app's too.

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
- **Not yet:** this step's read-only view of a submitted report, with its Close button. The report's own view is ported (below); the per-step views are not.
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
- **Flask's toasts and overlays**, word for word, and **Save & Next** (to Bank Deposit, in this app) / **Save & Exit**.

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

### Report wizard, Bank Deposit: `/entity/<shortid>/<name>/petty-cash/reports/new/deposit?transaction_date=`

This is Flask's `report/deposit.html`, at Flask's own address for it. It is built from `components/report/DepositStep.tsx`, with the arithmetic and the rules in `lib/cash.ts`, and reads and saves through `GET`/`PUT /reports/deposit` (Minty `petty_cash_api/routes/cash.py`, over the service the Jinja page shares, `report/services/cash.py`).

What it keeps from Flask:
- **The report header and the stepper**, with the same unsaved-changes hold and toast.
- **"Deposit to Bank"**, then one card: the illustration, "Current Balance:" (the cash on hand before the deposit) and "Deposit Amount" (the currency code inside, "0.00", the money field of `lib/currencyInput.ts`). A saved deposit comes back grouped.
- **Save & Next** (to Cash Count, in this app) and **Save & Exit**.
- **"Fix Negative Balance"** when the cash on hand is already below zero: Flask's sentence, the figure in brackets (shrunk to one line, as Flask's `fitBalanceText` does) and Opening / Sales / Expenses with their cash in or out. It cannot be dismissed, and like Flask's it covers the whole window. Its frame is shared with Opening's (`ReportChrome.tsx`).

Where the app differs:
- **The limit is the owner's rule (2026-10-15).** A deposit above the cash on hand is said under the field as it is typed: "The deposit can't be more than the cash on hand. Enter HKD155.00 or less." Save does nothing until it is fixed, and the API refuses it anyway (422 on `bank_deposit`, whose sentence shows on the field). Flask accepted it and only stopped at Cash Count.
- **The cash on hand is the server's.** Flask read it from a hidden field.
- **The steps behind the modal open in this app**, with Flask's "Redirecting..." overlay.
- **Not yet:** the read-only view of a submitted report, with its Close button.

### Report wizard, Cash Count: `/entity/<shortid>/<name>/petty-cash/reports/new/cash-count?transaction_date=`

This is Flask's `report/cash_count.html`, at Flask's own address for it. It is built from `components/report/CashCountStep.tsx` (the page, the calculator and the alert), with `lib/cash.ts`, and reads and saves through `GET`/`PUT /reports/cash-count`.

What it keeps from Flask:
- **The report header and the stepper**, with the unsaved-changes hold (a count, the safebox or the reason).
- **"Cash Count"** and the grey **"Expected Cash Count Balance"** pill (the cash on hand less the deposit).
- **One card:** the cash register, **"Cash Box Balance"** (read-only "Actual Cash Balance", filled from the calculator) with the calculator button, the safebox, **"Safebox Cash Balance"** ("Please enter Balance of the safebox", the money field) and the **"Total Cash Count"** bar (till + safebox).
- **"Discrepancy Details":** the red "Cash Shortage: HKD…" or green "Cash Surplus: HKD…" alert with "Please review your entries or provide a reason for the discrepancy below.", and the Description box, locked with "No discrepancy — description not required" when there is none. A reason for a difference that is then resolved is dropped, as Flask does.
- **"Use Calculator":** a row per denomination in the company's order (its label, "X", the count, the row's total), "Total Cash Till Balance" and Save, which copies the counts in. Its backdrop covers the whole window and an outside click closes it.
- **Save & Next** (to Ending, in this app) and **Save & Exit**; Flask's toasts ("Please enter description", the unsaved-changes one).
- **"Fix Negative Balance"** when the expected cash is below zero, with Flask's own sentence for this page ("Cash balance cannot be negative, let's go back to") and Opening / Sales / Expenses / Deposit.

Where the app differs (Flask's bugs, and the owner's rules of 2026-10-15):
- **Any difference counts, one cent included.** Flask's page needed more than 0.01; the difference is rounded to the cent as the service rounds it.
- **The difference shown is the one saved.** It is worked out from the counts the calculator applied, plus the safebox. Flask's alert read the calculator's rows while they were still being typed, its Total Cash Count read the applied total, and the server saved a third figure.
- **The calculator's total works.** Flask's Save stripped only "$", so with "HKD" the cash box showed HKD0.00.
- **Coins under 1 are labelled by their value** ("HKD0.50", "HKD0.20", "HKD0.10"); Flask showed all three as "HKD0". Notes keep Flask's whole-number label ("HKD1000").
- **Counts are whole numbers.** The field takes digits only (a text field with the numeric keypad, not Flask's number field, which took "1.5" and "e"); a count above 1,000,000, the API's limit, is said in its row and Save does not apply it.
- **Escape closes the calculator** (Flask's didn't), and the X is a 44px target.
- **A reason is needed on Save & Next, not on Save & Exit** - now also refused by the API (422 on `discrepancy_reason`). Besides Flask's toast and red box, the sentence under the box says how much and what to do ("The count is HKD0.01 short. Add the reason to continue."), and "Discrepancy Details" carries the red `*` while a reason is needed. A reason over 300 characters is said as it is typed.
- **A balanced count saves no reason**, so a stale one never reaches the PDF or Xero.
- **The API's 422 shows on its field:** the reason, the safebox, or a count (under Cash Box Balance).
- **Layout, at a phone's width:** the expected-cash pill wraps its figure onto a second line rather than run off the card, and each calculator row puts its total under the count. Flask's 96 / 128px total box overlapped its "HKD" with any amount over 999; here the code sits beside the amount, and the box is 160px from 640px up.
- **Left out:** Flask's "Set cash count before proceeding…" toast (it could not be reached once a difference needs a reason), the read-only view of a submitted report and its edit-mode "Save changes".

### Report wizard, Ending: `/entity/<shortid>/<name>/petty-cash/reports/new/ending?transaction_date=`

This is Flask's ORIGINAL `report/ending.html` (before the Part 15 redesign replaced it; Minty `f3e9d05`), at Flask's own address for it. It is built from `components/report/EndingStep.tsx` and `ReportSummary.tsx` (the summary's cards, shared with a submitted report's view), with the sums and the drawings in `lib/ending.ts`, and reads `GET /reports/close` and submits through `POST /reports/submit` (Minty `petty_cash_api/routes/close.py`, over the submit the Jinja page shares, `report/services/submit.py`). The charts are plain SVG, no library.

What it keeps from Flask:
- **The report header and the stepper.**
- **The slate "Draft report" callout**, word for word, then **"Summary"** with the currency code on the right.
- **Total Sales:** the day's total, then "{x.x}%" with a green up or red down arrow and "Compared to Yesterday" (no sales the day before: the green arrow alone; an unchanged day is a red 0.0%, as in Flask). Then Electronic Sales | Delivery Sales | Cash Sales. "Show more" lists each method (electronic on the left; delivery and Cash Sales on the right), "-" for nothing, labelled as on Sales (`flaskLabel`).
- **Sales History:** the 30 days up to the day as bars, seven to a view, scrolled to the day, which is red; each bar's figure ("1.2k" from a thousand) and its date ("13 OCT" / "TUE"). Nothing is drawn when every day is zero. The bars are measured from the box, as Flask's `bar_chart.html` does, including its phone sizes (under 640px).
- **Total Expenses:** the day's lines summed by account, largest first. Flask's donut of the top seven and "Other expenses" (the rest, in yellow), with its gaps and minimum slice sizes; the total in the hole, or the slice under the pointer (on the chart or its name). The names beside it, truncated as in Flask, "&" written "and". "Show more" lists every account with its amount. "No expenses recorded" when there are none.
- **Cash Balance:** what was counted (till + safebox); "Show more" splits it into "Cash Till Balance" and "Safebox".
- **The difference box:** red "Cash Shortage: HKD…" or green "Cash Surplus: HKD…" with the reason, when there is a difference.
- **Back** (to Cash Count, in this app) above **"Finish Daily Report"** (teal, the tick). While it submits the button says "Finishing..." and Flask's overlay counts "Finishing... N%" (2% every 600ms, never past 95%).
- **"Fix Negative Balance"** on arrival when the expected cash is below zero, with Flask's five ways back (Opening, Sales, Expenses, Deposit, Cash Count). It cannot be dismissed.
- After the submit: **the Submitted page**, this app's own (`reportHref(…, "submitted")` in `lib/companyPages.ts`).

Where the app differs (Flask's bugs):
- **One submit, however many clicks.** Flask's form could post twice; here a ref guards the call and the button is disabled while it runs.
- **A refusal keeps the day.** The API's 409 `{error, to}` shows its sentence and opens the step that fixes it (Opening, Sales, Expenses, Bank Deposit or Cash Count, in this app); `to: "dashboard"` lands on the dashboard with it (`lib/flash.ts`); `to: "submitted"` opens that report's Submitted page. Any other failure says so and leaves Finish ready to try again. Flask's clean-up could delete the draft.
- **Nothing is posted while something would stop it.** When the API names a `problem` on arrival, it is said at once as Flask's toast and stays under the button (its accessible description); Finish then posts nothing and opens the step that fixes it, with the sentence. A drawer below zero shows Fix Negative Balance instead, and Finish only shows it again.
- **The figures are the server's.** Flask read the drawer from its own template sums.
- **The day already submitted** (a 409 on arrival) opens its Submitted page; no draft goes back to Opening with Flask's sentence.
- **The total in the donut is the real total.** Flask showed the total it had padded to draw a small "Other expenses".
- **Layout, at a phone's width:** the big total and the three sales figures shrink to fit their column (Flask's `fitBalanceText` rule, never under 12px) instead of running into the next one, and a breakdown row puts its amount under a name too long to share the line.
- **Show more** reaches 44px for a finger without moving Flask's layout, and says whether it is open (`aria-expanded`).
- **Left out:** Flask's 30-second "Retry Submission" / "Cancel" panel (a failure here resets the button and says why). The submitted-report mode of the same template is its own page here (below).
- **Flask's own sizes below the workspace rules, kept:** the stepper's 7.6px labels and the chart's 10px figures and dates on a phone; the legend's 4px dots; the 40px-high Back.

### The Submitted page: `/entity/<shortid>/<name>/petty-cash/reports/<report id>/submitted`

This is Flask's ORIGINAL `report/submitted.html` (Minty `1c25b35^1`), at Flask's own address for it. It is built from `components/report/SubmittedPage.tsx` and `ReportActions.tsx` (Share), with its wording in `lib/report.ts`, and reads `GET /reports/<id>/outcome` (Minty `petty_cash_api/routes/close.py`). The Ending step's Finish, and its "already submitted" refusals, open it.

What it keeps from Flask:
- **The phone card with no header**, its content centred: the teal tick, **"Report Submitted / Successfully!"** ("Report Published to Xero / Successfully!" once the report is in Xero) and "Your daily petty cash report has been processed".
- **"Export Options"** with **Share**. Flask's Save as Image and Detailed PDF were commented out, so they are not here either.
- **"Share Report":** the modal opens saying "Generating link...", then `POST /reports/<id>/share-link` fills in the link. Copy, "Link copied to clipboard!" for three seconds, and Close, Escape or a click outside to close.
- **Publish to Xero** ("Republish to Xero" once it is in Xero), only with `can_publish`.
- **Back to Dashboard** ("Redirecting to Dashboard...") and **Continue to next day report** ("Starting next day report..."). The second leaves `next_day` for the dashboard to start, as Flask's `autoStartNextDay` did.

Where the app differs:
- **Publishing to Xero is still Flask's.** The button is a full-page link to Flask's own Submitted page for the report (`submittedUrl` in `lib/flaskPages.ts`), where the person publishes. Flask's publishing overlay, its republish warning and its polling are not ported.
- **A refused share says the API's sentence** and closes the modal (a draft: "A draft can't be shared. Submit the day first.").
- **A report reopened since** (`submitted: false`) has nothing submitted to show, so the page opens that day's Ending step instead of saying "Submitted".
- **Content taller than the screen scrolls from its top** (a short phone, text at 200%); Flask's centring cut it off above.
- **Left out:** Flask's "Report Successfully Published" toast after its own publish. It comes with Xero publish.

### A submitted report: `/entity/<shortid>/<name>/petty-cash/reports/<report id>/summary`

This is the submitted-report mode of Flask's ORIGINAL `report/ending.html` (Minty `1c25b35^1`, `report/services/ending.py`), at Flask's id address for it. Flask also serves `/reports/summary?transaction_date=`; this app uses the id form. It is built from `components/report/ReportView.tsx`, the summary of `ReportSummary.tsx` (the Ending step's own cards) and `ReportActions.tsx` (Share and Delete), and reads `GET /reports/<id>` (Minty `petty_cash_api/routes/report.py`). The dashboard's View Report opens it.

What it keeps from Flask:
- **The report header:** the date pill, the initials and the Submitted / Published badge. The chevron goes to the dashboard.
- **The summary**, as on Ending: "Summary" with the currency, Total Sales (against yesterday, the three totals, Show more for each method), Sales History (30 days, the day in red), Total Expenses (the donut and every account), Cash Balance (the till and the safebox), and the shortage or surplus box with its reason. No "Draft report" callout.
- **Share**, then **Delete Report** (red), **Edit Report** (olive) and **Close** (teal). Each shows only when the API's `permissions` allow it (`share`, `delete`, `edit`; Close always), so an older report shows Share and Close, as Flask's did.
- **Edit Report:** `POST /reports/<id>/reopen`, with Flask's toasts ("Converting report to draft...", "Back to draft — opening it for you now."), then this app's Opening step for the day. For a report that has been to Xero, Flask's confirm comes first.
- **Delete Report:** Flask's "Delete Report" modal (Cancel / Delete), "Deleting report...", `DELETE /reports/<id>`, then the dashboard with "That report's deleted.".
- **A report that has been to Xero may be deleted, with a warning first** (the owner, 2026-10-15). The modal adds "It is in Xero": "Deleting it here does not remove its entries in Xero, and publishing this day again adds a second copy. To change the report, use Edit report instead." These are Flask's own modal's words, drawn as Flask's amber warning above the red one. The API's `was_published` decides it.
- **Share:** Flask's Share Report modal, as on the Submitted page.

Where the app differs:
- **Every refusal keeps the page and says the API's sentence** (400 not the latest, 403, 404, 409 while publishing or a draft). Flask's delete went to the dashboard as if it had worked ("Failed, Redirecting to Dashboard...").
- **Close goes to report history**, as Flask's did.
- **A draft opens its Ending step:** a draft's summary is the wizard's.
- **No stepper.** Flask drew the six steps, all done, each leading to that step's read-only view of the submitted report. Those views are not ported (the steps here open only a draft); Edit Report is the way back into the wizard.
- **Not yet (no API):** Flask's per-field edits of a submitted report (the difference reason, the withdrawal and an expense line) and older reports' "Edit Details" mode.
- **Known, shared with every report page:** at 360px the header's centred group (date, initials, badge) runs about 6px under the person's initials with a four-letter company acronym and the longer Submitted / Published badge. Flask's header has the same geometry; `PhoneCard` needs a narrower centre to fix it.

### Report history: `/entity/<shortid>/<name>/petty-cash/reports?start_date=&end_date=&page=`

This is Flask's ORIGINAL `report_history/report_history.html` (Minty `1c25b35^1`, route `report/routes/history.py`), at Flask's own address for it. It is built from `components/history/ReportHistory.tsx` and `RangeCalendar.tsx`, with its rules in `lib/history.ts`, and reads `GET /reports` (Minty `petty_cash_api/routes/history.py`) with the address's dates and page only: ten a page and no status, as the original offers. The dashboard's View History, the sidebar's Reports and a report view's Close open it.

What it keeps from Flask:
- **The header:** the chevron (to the dashboard), the company's initials, the person's initials and the ≡.
- **The date filter**, fixed under the header: Start Date and End Date ("DD/MMM/YYYY", read-only) open Flask's range calendar - one month on a phone, two side by side from 640px across both fields; a click picks the start, the next the end (in order), the next starts again; one day picked is that day at both ends; the range in teal, the days between in pale teal, today ringed. Its footer: **Clear** (back to every report) and **Search Report** ("Please choose or enter a valid date range" / "Start date cannot be after end date"). Enter in a field searches too. A page with dates says Flask's "Filter applied".
- **CSV**, Flask's own export (`csvUrl` in `lib/flaskPages.ts`, `report.download_reports_csv`): a full-page link for the dates in the fields, greyed until both are chosen; "Exporting..." for a second, then "Your CSV export is on its way!".
- **"Report Results":** a card per day, newest first - the date and the weekday in its circle (yellow on a weekend), Sales (green) and Expenses (red) as Flask's `amount()` writes them ("-" for nothing, smaller as the figure grows), the badge (Published, Publish failed, Draft, Submitted - a publish under way reads Submitted, as the original drew it), the time in Hong Kong by Flask's rule (when it went to Xero; else when it was submitted; for a draft, when the day was started, which is also the fallback when either time is missing - the API's `created_at`) and "by <first name>".
- **A failed publish's reasons:** the badge's ⓘ and Flask's dark "Publish issues:" box, a cross per open reason and a resolved one struck through in green, on hover as in Flask.
- **The ⋮ menu**, one open at a time: **Edit** and **Delete** (only the latest report, never a draft - the API's `permissions`), **View**, and **Publish** / **Republish** (with `can_publish`; greyed on a draft, "Please finish the report before publishing"). The chevron is View too.
- **Flask's pager** when there is more than a page: "Showing 11 to 20 of 23 reports" ("11-20/23" on a phone), Previous, the first two and last two pages and those beside the current one with "..." between, Next.
- **The filters and the page live in the address**, so Back and a reload keep them.

Where the app differs:
- **View** opens the report's view in this app. A draft opens its own wizard step here, by the row's `current_section` (Opening when it has none, Flask's `resume_report` rule; `draftStep` in `lib/history.ts`); Flask's went through its resume page.
- **Edit** is the report view's (`useEditReport` in `ReportActions.tsx`): Flask's confirm for a report that has been to Xero, `POST /reports/<id>/reopen`, then this app's Opening.
- **Delete** is the report view's modal, with the owner's "It is in Xero" warning when `was_published`; `DELETE /reports/<id>`, then the list is read again in place with Flask's "That report is deleted." (Flask reloaded the page). A refusal says the API's sentence and keeps the list.
- **Publish / Republish** is a full-page link to Flask's Submitted page for the report (`submittedUrl`), where the person publishes. The history page's own publishing (its republish modal, overlay and polling) is not ported.
- **The empty state shows.** Flask's "No reports found" was in the page but never revealed.
- **Refusals:** a bad filter in the address (the API's 422) says its sentence; any other failure says so with **Try again**.
- **The calendar is drawn here**, as Flask themed Flatpickr (this app carries no Flatpickr): its month and year are text, not Flatpickr's month dropdown and year field, and there is no hover preview of a range. Clear and Search Report are 44px on a phone.
- **A tap shows a failed publish's reasons:** Tailwind v4 applies hover only where there is one, so on a phone the badge is a button that opens and closes them (and keyboard focus shows them).
- **Layout, at a phone's width** (the only layout change): below 640px Sales sits over Expenses - side by side, Flask's row ran past its card with a "Publish failed" badge or a six-figure amount. The amount columns keep Flask's widths as minimums, so a long figure widens its column instead of running into the next one; the page numbers wrap on the 640px card, where Flask's ran off its edge. The ⋮, the chevron and the page links reach 44px for a finger without moving Flask's layout.
- **Flask's own sizes below the workspace rules, kept:** the 8-10px dates, figures and times on a phone, the 9px badge and the calendar's 42px days.
- **Not yet:** "Edit" on an older report (Flask's "Edit Details" mode of the summary) has no API, so the menu leaves it out.

### Petty Cash Settings: `/entity/<shortid>/<name>/settings/petty-cash`

This is Flask's ORIGINAL `entity/settings_entity.html`, with `partials/electronic_delivery_section.html` and `static/js/petty_cash_settings.js` (Minty `1c25b35^1`), at Flask's own address for it, for the cards that need no Xero. It is built from `components/settings/PettyCashSettings.tsx` (the page and Country & currency), `SalesMethodsCard.tsx` (Electronic and Delivery) and `SettingsParts.tsx` (the card, the picker, the confirm dialog, the busy overlay), with its rules in `lib/settings.ts`. It reads `GET /settings` and writes through `PUT /settings/country` and `POST`/`PUT`/`DELETE /sales-methods...` (Minty `petty_cash_api/routes/settings.py`). The dashboard's Entity Settings, its two modals' settings links and the sidebar's Settings open it.

Flask drew this page in minty-web's look (Tailwind v4 values written out in `settings_page.css`), not in the phone card, so its greys and reds have their own `flask-set-*` tokens in `app/styles/flask-theme.css`.

What it keeps from Flask:
- **The header:** ‹ Back and "Settings", the company's icon and name, the person's initials (My Profile) and the ≡ (the shared sidebar).
- **The settings tabs:** Users, Entity & Integration, **Petty Cash Settings** (this page), Payment Request Settings (when the token says Payments is on) and Modules. The others are Flask's addresses (`settingsTabUrl` in `lib/flaskPages.ts`), which hand over to the app that holds them.
- **The view-only notice** ("You have view-only access to these settings…") when the person may change nothing. A card they cannot change is grey and its controls are off, as in Flask.
- **Country & currency:** "Select Country" and "Select Currency", Flask's searchable pickers (focus lists everything, typing filters, "No matches", ↑/↓/Enter/Escape, leaving the box puts the choice back), then **Save Changes** ("Saving…" and Flask's busy overlay, "Saving changes…").
- **Electronic and Delivery**, a card each: the methods in order; the name to click for a rename (Enter or leaving the box saves, Escape puts it back); the ⋮ with Move up, Move down and Delete; **Add New Method** with the catalogue picker ("No matching payment method found", "+ Other (type a new name)" opening the Name box) and Cancel / Add.
- **Delete asks first**, in Flask's minty-web dialog: "Delete Electronic Method", 'Are you sure you want to delete "<name>"? This action cannot be undone.', Go back / Delete.
- Each card folds under its heading.

Where the app differs:
- **The Xero mapping and the account codes stay on Flask's page** (the owner, 2026-10-16). Where Flask drew them there is one card, "Xero account mapping and account codes", with a sentence and **Open Xero settings**, a full-page link to Flask's own settings page (`settingsUrl`). It shows only while `xero_connected`; Flask's "Xero isn't connected" notice is not drawn.
- **Each change is saved at once.** Flask held every change for one Save Changes at the bottom. The API takes one change a call, so an add, a rename, a move or a delete goes as it is made, the list is drawn from the API's answer, and its sentence shows as Flask's success toast ("Octopus added.", "Name saved.", "Order saved.", "Method removed. Reports that used it keep their amounts."). A refusal (403, 404, 409, 422) shows the API's sentence and keeps what was there. Save Changes sits in the Country & currency card, because that card is all it saves.
- **The country goes alone.** A changed country is sent without the currency, so it brings its own (the API's rule); a currency picked by hand goes too. Flask posted both, so a new country kept the old currency.
- **A name's own rules as it is typed** (CLAUDE.md): over 100 characters ("That name is too long. Keep it to 100 characters or fewer.") or already on that list in any case ("visa is already on the list."), said under the Name or rename box. An Add with no name says "The method's name is still empty. Type a name to add it." under the box. Flask only toasted, and checked names across both lists; the API checks one type's list, and so does the page.
- **A shared method says so at once.** A method another company has too (`shared` in the read) cannot be renamed (the API's 409), so clicking its name opens no box and says under it: "Other companies use Visa too, so it can't be renamed here. Delete it and add a new method instead." Flask let the person type, then refused on Save.
- **Back goes to the dashboard.** Flask's went back to whatever page came before the settings area.
- **A person who may not see the sales methods** (no `view_sales_methods`) is told so in each card.
- **Left out:** Flask's "Leave without saving?" guard (only the two pickers can hold an unsaved change now) and its reveal of a collapsed card on a refused save.

## Not here yet

- **The other pages.** Next: Xero publish, after confirmation. Until it is ported, the Submitted page's Publish to Xero opens Flask's Submitted page. The Xero mapping and the account codes stay on Flask's settings page (the owner, 2026-10-16).
- **PR previews and the Vercel project** belong to the infra step (Step 5), which is being re-planned. That is why there is no `preview.yml` yet.
