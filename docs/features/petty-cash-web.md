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
- **Ported steps open in this app.** The dashboard's Start, the deposit check and the stepper all go through `lib/wizardPages.ts`, which sends every step of the wizard here; the Submitted page after it is still Flask's.

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

This is Flask's ORIGINAL `report/ending.html` (before the Part 15 redesign replaced it; Minty `f3e9d05`), at Flask's own address for it. It is built from `components/report/EndingStep.tsx`, with the sums and the drawings in `lib/ending.ts`, and reads `GET /reports/close` and submits through `POST /reports/submit` (Minty `petty_cash_api/routes/close.py`, over the submit the Jinja page shares, `report/services/submit.py`). The charts are plain SVG, no library.

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
- After the submit: **Flask's Submitted page** (`/entity/<id>/petty-cash/reports/<report id>/submitted`, `submittedUrl` in `lib/flaskPages.ts`).

Where the app differs (Flask's bugs):
- **One submit, however many clicks.** Flask's form could post twice; here a ref guards the call and the button is disabled while it runs.
- **A refusal keeps the day.** The API's 409 `{error, to}` shows its sentence and opens the step that fixes it (Opening, Sales, Expenses, Bank Deposit or Cash Count, in this app); `to: "dashboard"` lands on the dashboard with it (`lib/flash.ts`); `to: "submitted"` opens Flask's Submitted page for that report. Any other failure says so and leaves Finish ready to try again. Flask's clean-up could delete the draft.
- **Nothing is posted while something would stop it.** When the API names a `problem` on arrival, it is said at once as Flask's toast and stays under the button (its accessible description); Finish then posts nothing and opens the step that fixes it, with the sentence. A drawer below zero shows Fix Negative Balance instead, and Finish only shows it again.
- **The figures are the server's.** Flask read the drawer from its own template sums.
- **The day already submitted** (a 409 on arrival) opens Flask's Submitted page for it; no draft goes back to Opening with Flask's sentence.
- **The total in the donut is the real total.** Flask showed the total it had padded to draw a small "Other expenses".
- **Layout, at a phone's width:** the big total and the three sales figures shrink to fit their column (Flask's `fitBalanceText` rule, never under 12px) instead of running into the next one, and a breakdown row puts its amount under a name too long to share the line.
- **Show more** reaches 44px for a finger without moving Flask's layout, and says whether it is open (`aria-expanded`).
- **Left out:** Flask's 30-second "Retry Submission" / "Cancel" panel (a failure here resets the button and says why), and the submitted-report mode of the same template (Delete, Edit Report, Share, Close), which comes with the report pages.
- **Flask's own sizes below the workspace rules, kept:** the stepper's 7.6px labels and the chart's 10px figures and dates on a phone; the legend's 4px dots; the 40px-high Back.

## Not here yet

- **The other pages.** The Submitted page, history, the report summary, settings and Xero publish are next, in that order.
- **PR previews and the Vercel project** belong to the infra step (Step 5), which is being re-planned. That is why there is no `preview.yml` yet.
