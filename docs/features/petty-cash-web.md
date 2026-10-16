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

`@minty/shared/sidebar`, with this app's host in `components/ui/sidebarHost.ts`. That file is the only app-specific part.
- **This app's own pages:** Dashboard, Reports (the report history, since Wave 2g) and Settings (Petty Cash settings, since Wave 2h; its Xero parts link on to Flask's page).
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
| `npm test` | Vitest. Covers the proxy, auth, the hand-off, the API client, company addresses, the sidebar host, the launch page's rules, the Daily Closing stage mapping, the Addition to Drawer, Sales, Expenses, Cash Count and Close rules (and the receipt read), the outcome page's facts, the Daily Report's facts and warnings, the report history's rules (address and filters, the pager, "Showing a–b of n", the date range, the CSV link and its gate, a row's meta and actions), the settings rules (the country body, the sales-method list on the page, the name checks, the waiting changes and how Save sends them, stopping at a refusal), the stage addresses, the money input and the flash, and the three guards (styles, assets, raw colours). |
| `npm run test:e2e` | Playwright on a 1440 px desktop and a 360 px phone, against local Flask (`e2e/README.md`). |

`npm run lint` and `npm run typecheck` complete the gate. CI runs everything but e2e (`.github/workflows/ci.yml`, the shared `next-web.yml@v1`).

## Ported so far (`development`)

`development` is a **faithful port** of Flask's Petty Cash pages: the same sections, steps, wording, rules and destinations, drawn with minty-payment-request-web's design (Part 13 tokens, `@minty/shared/ui`, its App bar). The Part 15 redesign (five-stage Daily Closing, Action Dashboard) comes afterwards, on its own branch.

The port order is dashboard, then the report wizard, then history, then settings, then Xero publish. Pages not ported yet are Flask's, linked from `lib/flaskPages.ts`. The person is already signed in to Flask, because this app's token came from Flask's login-gated hand-off.

### Dashboard: `/entity/<shortid>/<name>/petty-cash`

This replaces Flask's `entity/entity_dashboard_v2.html`. It is built from `components/dashboard/`, with its rules in `lib/dashboard.ts` and one read, `GET /home`.

It carries over:
- **The opening states.** The "previous reports" warning banner, "Today's report is submitted", and the Report in Progress / Current balance row.
- **The draft card.** "Pick up where you left off" with its six steps, "n/6 Complete", Continue Report and "Last edit … ago".
- **Start New Report / View Report.**
- **Quick Actions.** View History and Entity Settings, both Flask's pages for now.
- **The Report Calendar.** Today, submitted, not-submitted and pickable days; the same clickable-day rules; the onboarding floor.
- **The deposit check.** "Before You Start" (yes, changed, or none), "Deposit to Bank", and the correction through `POST /deposit-correction`.
- **The non-dismissable "Setup Required".**
- **Read-only access** for a superuser outside the company.

What is deliberately different, as fixes rather than redesign:
- **One "today".** It is always the server's Hong Kong date (`server_today`). Flask mixed the browser's date, UTC and Hong Kong time.
- **The date rules always run.** Starting a report checks them every time. Flask skipped them after a calendar click.
- **The right day is corrected.** The deposit correction targets the day shown in the dialog. Flask always posted the latest report's date, which is the same day in the normal path.
- **Warnings stay on the page.** They show next to the button that raised them, not as a toast (Part 14: errors are never toasts). The deposit amount is checked as it is typed.
- **Removed:**
  - the always-hidden Xero bank-account dropdown, and the live Xero read behind it;
  - the "1 user" count, which never counted;
  - the heading overwrite that happened in draft mode.
- **Phone layout of the steps.** They are two rows of three on a phone, so labels are never clipped and never under 12 px. Flask shrank them to 7.6 px.

Not ported yet:
- **The subscription notice** (Flask claims it once per Flask session).
- **The "Congratulations!" modal** (`?success=true`), which belongs to the settings save and comes with the settings page.

## The redesign (`redesign/part-15`)

The Part 15 redesign is built on its own branch, `redesign/part-15`, on top of the faithful port above, in the waves of Part 15.H. Wave 1 is the launch page.

### Wave 1: the launch page, Part 15.6a "Action Dashboard"

`/entity/<shortid>/<name>/petty-cash` answers one question: "What should I do?" It still reads only `GET /home` (now typed with its `user_count`, which the page does not use).

The page, top to bottom (`components/dashboard/Dashboard.tsx`):
1. **h1 "Petty Cash", visible.** The App bar names the module for screen readers only, so it does not "carry" the title (15.6 Accessibility).
2. **The greeting** (P15-01): "Good evening, Olive · Wed 14 Oct 2026" with a small Minty. Not a heading. The first name is the first word of `useViewer()`'s name, the time of day is the device's clock, the date is `server_today`. No name, no greeting. On first use the empty state carries Minty, so the greeting goes without.
3. **One primary work card.** "Today's Daily Closing", or "Daily Closing · Tue 13 Oct" when the open report is an earlier day's. It holds the Step progress, "3 of 5 done · Next: Cash Count", "Saved 6:02 pm" and one action.
4. **The business-rule gate** (15.9e): a warning Page banner, "Finish Tue 13 Oct first", with "Start Daily Closing for Tue 13 Oct". The banner has no action when the open report is already that day's (the card's Continue is the action), and none for read-only access.
5. **"Recent reports"**: the newest three submitted days as Record rows (the day, "Closing balance", the amount as plain text, a Submitted pill in Info), each opening the day's report - Flask's report summary in Wave 1, this app's Daily Report since Wave 2f - plus "See all" to the report history (Flask's until Wave 2g, this app's since).

Layout (15.6 Responsive, with this app's Tailwind breakpoints): one column on a phone; at most 640 wide on a tablet; from `lg` (1024) the card and the recent reports sit side by side (2:1), centred, at most 1200.

The states (`launchState` and `gateDay`, `lib/dashboard.ts`):

| State | When | The card |
|---|---|---|
| First use | nothing submitted and no open report | 15.11a empty state with Minty, "Your first Daily Closing", **Start today's Daily Closing** |
| In progress | an open report (the newest draft; its day is `draft_date`, as Flask's Continue used it) | its stages, **Continue Daily Closing** to this app's own stage the report is on (every stage since Wave 2e; Flask's resume only for a section this app does not know) |
| Done | `published[server_today]` exists | all five done, "Today's report is submitted", **View report** to the day's report (this app's Daily Report since Wave 2f, by `published[server_today].id`) |
| Not started | otherwise | five stages ahead, **Start today's Daily Closing** |
| Gate | yesterday has no submitted report although earlier days do | the Start is disabled with "Finish Tue 13 Oct first." beside it, and the banner starts that day |
| Loading | until `/home` answers | a skeleton card |

- **Starting goes through the kept rules.** `startProblem` runs first, and its sentence shows inline in the card. Then comes "Before You Start" when the day before banked cash, the Deposit to Bank amount, and `POST /deposit-correction`. Only then does the day's first stage open (this app's Addition to Drawer since Wave 2a).
- **Read-only access** disables Start and Continue with "Read-only access" beside them. Steps are not links for read-only access.
- **Setup Required** (incomplete Xero settings) still holds the page.

**The five stages** (`lib/dailyClosing.ts`, Part 15.15b and D15-05) are laid over Flask's six report sections:

| Flask section | Stage (Step label) |
|---|---|
| `opening` | Addition to Drawer (Drawer) |
| `sales` | Sales |
| `expenses` | Expenses |
| `deposit` | Cash Count (Bank Deposit is folded into it) |
| `cash_count` | Cash Count. The stage is done only once **this** section is done. |
| `ending` | Close |

- **"Next"** is the stage Continue lands on: Flask's resume opens `current_section`, or `opening` when it is empty. So it can be a stage already done, when the person went back to it.
- **The open stage.** Done and current stages link into that stage: this app's own page once it is redesigned (Addition to Drawer, Sales), Flask's wizard otherwise (`lib/wizardPages.ts`). Cash Count opens at the deposit, its first section, unless the report is in `cash_count`.

**Step progress** (`components/ui/StepProgress.tsx`, Part 14) is built here because `@minty/shared/ui` has none yet:
- an ordered list with `aria-current="step"`;
- current = brand fill (D14-03) with a bold label, done = brand tint + check, upcoming = sunk + border;
- the labels are always visible, 12 px at least, and may wrap; the list sits in a 70 px frame so they never overlap.

What Wave 1 changed against the faithful port:
- **Removed:**
  - the Report Calendar (15.6: no calendar until the dashboard is redefined), with its day-picking rules and the month-grid helpers;
  - Quick Actions (View History and Entity Settings: the recent list's See all and the sidebar replace them);
  - the "Report in Progress / Current balance" row;
  - the six-step stepper and "Last edit ... ago".
- **Changed:**
  - "Today's report is submitted" now follows `published[server_today]` (the one "today"), not `today_is_latest_report`;
  - a day earlier than today cannot be started from the card any more. The gate banner starts it, and the card's Start waits for it.
- **Kept:** the start rules and the deposit check, word for word.

Known gaps:
- **Minty is the 2D cat** (`/cat-hole.png`), as everywhere: the 3D character is not exported yet.
- **An earlier day's open report is dated by `draft_date`.** `/home` gives the EARLIEST draft's date with the NEWEST draft's progress; with two drafts open they can disagree (Flask's Continue had the same limit).

### Wave 2a: the first Daily Closing stage, "Addition to Drawer" (Part 15.9 / 15.15)

`/entity/<shortid>/<name>/petty-cash/reports/new/opening?transaction_date=` replaces Flask's Opening page on this branch. The address is Flask's own, so a link into one app works in the other; the visible name is the stage's, "Addition to Drawer" (15.15: "02 Opening -> Addition to Drawer"). It reads and saves through the existing `GET`/`PUT /reports/opening` (Minty `petty_cash_api/routes/opening.py`), unchanged.

The page, top to bottom (`components/closing/AdditionToDrawer.tsx`, a 720 column centred, phone first):
1. **The Workflow header** (15.1 Workflow): "‹ Petty Cash" back to the launch page; "Daily Closing · Tue 13 Oct 2026" with the report's status pill (Draft, Neutral; `lib/reportStatus.ts`) - the line Flask's App-bar date pill moves to; the five-stage Step progress; the stage title as the h1 and one line of guidance. While loading, the title shows at once and the rest is skeleton.
2. **The stage form** (15.3), one card:
   - the starting cash as read-only Description rows, never an input: "Starting cash" with where it came from ("Carried over from your last Daily Closing." or "Your opening balance from setup."), and, only when some of it is in the safebox, "In the cash drawer" / "In the safebox";
   - "Cash added to the drawer" (optional, helper "Optional. Leave it empty when no cash was added."): an Amount input with the currency as its prefix and in its accessible name, right-aligned, `inputMode="decimal"`, cleaned as typed and grouped + padded on blur (`lib/currencyInput.ts`, Flask's `currency.js` rules);
   - "Where the cash came from": Company bank / Personal, radio rows 44 tall, stacked on a phone.
3. **The stage summary**: "Opening cash HKD2,450.50" (starting cash plus the cash added), live as the amount is typed, plain text, never coloured.
4. **The actions** (15.2, not sticky): **Save & Next** (Primary) and Save & Exit (Ghost) - Primary first and full width on a phone, `[Save & Exit] [Save & Next]` at the right from 640. Enter in the amount is Save & Next.

The rules (`lib/addition.ts`, `lib/dailyClosing.ts`):
- **The stages.** The current stage is this one, done or not; the others are done when their section is (`stagesOnPage`). Done stages are links, to where they were left (`stageSection`; Cash Count at the deposit unless the report is in `cash_count`), through `lib/wizardPages.ts` - Flask's wizard for every stage but this one. Stages not done are not links: Save & Next is the way forward (15.9d).
- **Save & Next** sends `{transaction_date, cash_addition, withdrawal, action: "next"}` and opens the Sales stage, in this app since Wave 2b (a client-side move). **Save & Exit** sends `action: "exit"` and goes to the launch page.
- **A refused day** (409 `to: "dashboard"`, a date rule) goes to the launch page, which shows the sentence as a warning **Page banner** under its h1, read once (`lib/flash.ts`, Flask's flash; never a toast). Any other refusal (409 `to: "opening"`, 422, no answer) is a Danger inline alert above the actions, and the actions come back.
- **Cash below zero** is a business-rule gate (15.9e: rule, reason, one action), never a modal:
  - the last closing ended below zero: the form gives way to a warning Page banner, "Your last closing ended below zero", with why and **Go to Petty Cash** (Flask held the page the same way);
  - the opening cash would be below zero: "Opening cash is below zero. Add at least HKD120.50 to the drawer to continue." beside the summary, live; a save is not sent and the amount takes focus.
- **Unsaved changes** hold the stage links and the back link: a warning inline alert under the stages says so, with **Leave without saving**. Putting the change back clears it. A reload or a typed address is not held.
- **The launch page** now opens this stage: Start (after Before You Start and the correction), the Drawer stage link, and Continue when the open report is on `opening` (or names no section). Continue on any other stage is still Flask's resume.

Against Flask's Opening, deliberately: the "Fix Negative Balance" modal became the gate above (15.10: "Fix Negative Balance -> section issue + gate"); the illustration is gone (15.D: no characters in active input); "Withdrawal from" is "Where the cash came from"; a negative amount reads "-HKD120.00", not "(HKD120.00)".

Known gaps of Wave 2a:
- **No autosave and no "Saved 6:02 pm"** (15.9f): the API saves only on Save & Next / Save & Exit and `GET /reports/opening` carries no saved time.
- **Stages not done cannot be opened from here**, even the one the report was left on: when someone goes back to this stage, Save & Next walks them forward through Flask's pages.
- ~~Close is still Flask's page~~ - every stage is this app's since Wave 2e (Sales in 2b, Expenses in 2c, Cash Count in 2d, Close in 2e).

### Wave 2b: the second Daily Closing stage, "Sales" (Part 15.9 / 15.15)

`/entity/<shortid>/<name>/petty-cash/reports/new/sale?transaction_date=` replaces Flask's Sales page on this branch, at Flask's own address. It reads and saves through the existing `GET`/`PUT /reports/sales` (Minty `petty_cash_api/routes/sales.py`), unchanged.

**One stage frame.** What both stages share moved out of `AdditionToDrawer.tsx` into `components/closing/Stage.tsx`: the frame and the read (`StagePage`: App bar, the 720 column, loading skeleton, a failed read as a Danger inline alert), the Workflow header, the stages (`stageSteps`), the unsaved-changes hold (`useLeaveHold`), the Amount input, Save & Next / Save & Exit (`StageActions`), where a refusal goes (`refused`) and where a section opens (`openStep`: a client-side move for this app's stages, Flask's page otherwise). Addition to Drawer draws only its own form now; its behaviour is unchanged.

The page, top to bottom (`components/closing/Sales.tsx`, rules in `lib/sales.ts`):
1. **The Workflow header**, as Wave 2a: Sales is current, Drawer is a done link back to this app's Addition to Drawer; "Add the day's sales for each way your customers paid. Leave a method empty if it had no sales."
2. **The stage form**, Part 15.3b grouped form, one card:
   - **Electronic payments** and **Delivery**: a Section header (h2 + why the section exists), one Amount input per method the company switched on, in Settings order, labelled with the **catalogue's name as it stands** ("WeChat Pay"; Flask title-cased it to "Wechat Pay"), then the section's running subtotal as a Description row. A section with no methods is left out. Deliveroo is never listed (the save has always skipped it).
   - **Cash**: "Cash sales".
   - The fields are **one column on a phone** - 15.3 allows pairs only when both values are at most 10 characters, and "12,345,678.90" is 13 - and two from 640. Every field is optional, so none warns: the input only takes digits and one point (11 whole digits at most, the API's limit), and the amounts are grouped and padded on blur.
3. **The stage summary**: "Total sales" (electronic + delivery + cash), live, plain text, never coloured. Subtotals and the total are polite live regions (15.15).
4. **The actions**, as Wave 2a. Enter in any amount is Save & Next.

The rules:
- **Save & Next** sends `{transaction_date, cash_sales, amounts, action: "next"}` with **every** method the stage shows (an empty field as 0) and opens Expenses (this app's own stage since Wave 2c, a client-side move). **Save & Exit** sends `action: "exit"` and goes to the launch page.
- **A day with no Daily Closing yet** (`draft: null` in the read; the owner, 2026-10-15): instead of the form, a warning Page banner says so on arrival - "This day's Daily Closing hasn't started" - with one action, **Go to Addition to Drawer**. There is nothing to type, so nothing is lost.
- **A draft gone by the time of the save** (409 `to: "opening"`): the person is taken to this app's Addition to Drawer, which shows the API's sentence as a warning Page banner under its header, read once (`lib/flash.ts`). Any other refusal (422, 403, no answer) is a Danger inline alert above the actions, and the actions come back.
- **Unsaved changes** are counted by amount: grouping does not count, an emptied field does (it saves as zero), and putting a value back clears the hold.
- **The launch page's Continue** opens this stage when the report is on `sales` (and Expenses on `expenses`, Wave 2c); every later section still uses Flask's resume. Addition to Drawer's Save & Next opens it in-app.

Known gaps of Wave 2b:
- **No autosave and no "Saved 6:02 pm"** (15.9f), as Wave 2a: the API saves only on Save & Next / Save & Exit and carries no saved time.
- **The no-draft sentence is the API's** ("...let's start with the opening entry."), which still names Flask's old stage.

### Wave 2c: the third Daily Closing stage, "Expenses" (Part 15.9 / 15.15c)

`/entity/<shortid>/<name>/petty-cash/reports/new/expense?transaction_date=` replaces Flask's Expenses page on this branch, at Flask's own address. It reads, adds, deletes and moves on through the Petty Cash API's Expenses routes (Minty `petty_cash_api/routes/expenses.py`), unchanged: `GET /reports/expenses`, `POST /reports/expenses/lines` (multipart, one receipt), `DELETE /expense-lines/<id>`, `GET /expense-lines/<id>/receipts/<receipt id>`, `PUT /reports/expenses` and `POST /suppliers`.

The page, top to bottom (`components/closing/Expenses.tsx`, in Stage.tsx's frame; rules in `lib/expenses.ts`):
1. **The Workflow header**, as Waves 2a/2b: Expenses is current; Drawer and Sales are done links to this app's stages. "Add each expense paid from the cash drawer, with its receipt."
2. **The entries** (15.15c), one card: "2 expenses" (h2), "To change an expense, delete it and add it again.", **Add expense** (Secondary - Save & Next stays the one Primary), then a Part 14 Record row per entry, stacked:
   - the account's name and the amount (plain text, never coloured; it wraps under the name before it is ever clipped);
   - "ParknShop · Account 429", and the description when there is one;
   - the receipt as a small File card (an icon by type, the name truncated, "View") that opens it full screen;
   - **Delete** (Ghost, 44 tall), named "Delete expense: General Expenses, HKD120.50" for screen readers.
   - Nothing yet: "No expenses added yet." / "Add an expense when you're ready. A day with no expenses can go straight on with Save & Next." (Part 11 §11.16), with Add expense. No character: 15.D keeps Minty out of active input.
3. **The stage summary**: "Total expenses", the API's own total after every add and delete, a polite live region.
4. **The actions**, as Waves 2a/2b.

**Add expense** (`components/closing/ExpenseForm.tsx`, loaded on first open): the shared Part 14 **Drawer**, 480 wide from the right on a computer and a full-screen sheet on a phone. Title "Add expense", "Fill it in from the receipt.", footer [Cancel] [Add expense] (Primary; first on a phone). The fields, in this order:
- **Receipt** (required): Part 14 Camera capture while empty - "Add the receipt", "Keep the total and the date in view. PDF, JPEG or PNG, up to 10 MB." - with **Take photo** (phones only, by width: `accept="image/*,application/pdf"` + `capture="environment"`) and **Choose file** (no `capture`); a file can be dropped on it too. The file inputs are the controls (visually hidden inside their button-looking labels), so they carry the field's name, `aria-required` and its problem. Once picked: a File card (thumbnail or PDF icon, name truncated, "860 KB · Photo", **View** full screen, **Remove**).
- **Supplier** (required): the Part 14 Supplier picker, an ARIA combobox over the synced Xero suppliers, A to Z, narrowed as typed (trimmed, spaces collapsed, any case), options 52 tall in the flow of the sheet (never clipped), the count announced; ↑ ↓ Enter, and Escape closes only the list. 'Add "…" as a new supplier' comes last when no supplier has exactly that name and `permissions.create_supplier` is true. It opens a **New supplier** panel (name prefilled, checked as typed: empty after a press, over 150, or already a supplier); only **Add supplier** calls `POST /suppliers`, which creates the contact in Xero - creation is never automatic. The new supplier joins the list and is chosen. A name typed in full is that supplier when the field is left (matching, not creating).
- **Amount** (required): the Stage Amount input, now with `required` and an error.
- **Account** (required): a native select, "General Expenses · 429" (the business label first, the code kept visible), helper "Where Minty records this expense in Xero."
- **Description** (optional, last): a live counter, "Optional. 16 of 300 characters."

Validation (CLAUDE.md, as typed; the API refuses the same with a 422):
- **At once:** a description over 300 ("The description is 301 characters. Shorten it to 300 characters or fewer."); a file that is not a PDF, JPEG or PNG, empty, or over 10 MB, named ("huge.jpg is 12.3 MB. Attach a file of 10 MB or less."), and not kept.
- **When the field is left** ("not finished yet" while typing): an amount of 0 ("The amount is 0. Enter an amount above 0."); a supplier that is not on the list ('"Parkx" is not a supplier yet. Choose one from the list, or add it as a new supplier.'). Above 99,999,999,999.99 cannot be typed (11 whole digits); the rule names the limit anyway.
- **After a refused Add expense:** the empty required fields ("The receipt is still missing. Take a photo of it or choose its file to continue." and the like), and from then on every field is checked in full. Two or more problems show the shared **error summary**, which takes focus and links to each field; one problem moves the focus to its field.
- **The API's refusal** (422, or a 409 Flask raises while adding) shows as a Danger inline alert at the top of the sheet, which stays open with what was entered. No draft any more (409 `to: "opening"`) goes to Addition to Drawer with the sentence, as every stage does.
- **Closing with something entered** (Escape, the scrim, Cancel, the close button) asks first, inline: "This expense isn't added yet" with **Discard it**. An empty sheet just closes.

**Delete** is a Part 14 Confirmation modal, Destructive (a bottom sheet on a phone): "Delete this expense?", "**General Expenses, HKD120.50 from ParknShop, and its receipt will be deleted.** This can't be undone.", Cancel focused first, **Delete expense** in Danger. A refusal (403, 404, 409) shows its sentence inside the modal and keeps the entry. After a delete, the total is the API's and the focus goes to Add expense.

**Receipts open full screen, never in a new tab** (`components/closing/ReceiptViewer.tsx`, loaded on first open): the bytes are read with the bearer (`pettyCashBlob`, new in `lib/apiClient.ts`) or taken from the picked file, and drawn from an object URL the viewer owns and revokes - an image in `<img>`, a PDF in the browser's own viewer in an `<iframe>` (pdf.js is not a dependency here). A failed read says why in place. Its Escape is caught on `window` in the capture phase, so over the sheet one Escape closes only the viewer. It is the app's one viewer.

The rules:
- **Save & Next** sends `{transaction_date, action: "next"}` and goes on to Cash Count, which opens at Bank Deposit (`openStep(..., "deposit")`) - Flask's page in Wave 2c, this app's own Cash Count stage since Wave 2d (a client-side move). **Save & Exit** sends `action: "exit"` (Flask records nothing) and goes to the launch page.
- **No draft for the day.** Unlike Sales, Expenses' read itself is refused (409 `to: "opening"`), so the stage never shows: the person lands on Addition to Drawer, with the sentence as a warning Page banner, read once.
- **Every add and delete is saved at once**, so the stage has no unsaved-changes hold of its own; the sheet asks before it discards.
- **A report that is no longer a draft** shows its entries without Add expense or Delete (Flask hid both).
- **Sales' Save & Next** and **the launch page's Continue** (a report on `expenses`) open this stage in-app; the Expenses Step links on the other stages and the launch page do too.

Wave 2a/2b files touched for this wave:
- `components/closing/Stage.tsx`: `StagePage` takes `here` and routes a read refused with `{error, to}` through `refused` (Expenses' read is the first that answers 409 `to: "opening"`); `AmountInput` takes `id`, `required`, `error` and `onBlur`.
- `lib/wizardPages.ts`: `expenses` is a ported step (`reports/new/expense`).
- `lib/apiClient.ts`: `form` (a multipart body) and `pettyCashBlob`.
- `e2e/04_sales.spec.ts`: Save & Next now lands on this app's Expenses (stubbed); `lib/__tests__/currencyInput.test.ts`: the step addresses.
- `components/dashboard/Dashboard.tsx`: a comment only (Continue already follows `isPorted`).

Against Flask's Expenses, deliberately: Flask's "View Expense Details" modal is gone - the row shows every detail, and its receipt opens full screen; the supplier list is A to Z with the add option last and the duplicate check (Flask offered "Add" for a case-different name); "Account Code" is "Account" with the code beside the name; the delete confirmation names what goes; the total is the API's, not added up in the browser; amounts are never red (Flask drew them red).

Known gaps of Wave 2c:
- **No edit.** The API has add and delete only, so an entry is changed by deleting it and adding it again; the list says so. A "Change" that adds the new entry then deletes the old one was not built: someone allowed to add but not to delete would end up with both.
- **No AI suggestions (15.14).** The API has no receipt-reading endpoint yet, so nothing is "Suggested"; every field is typed.
- **No photo compression or HEIC conversion** (Part 14 File card / Camera capture: under 1 MB on the device, HEIC to JPG) - it would need code this wave did not add. A phone photo is sent as it is, so one over 10 MB is refused by name; iOS normally hands the page a JPEG, but a HEIC file chosen from Files is refused ("isn't a PDF, JPEG or PNG").
- **One receipt per entry** - the API's rule (Part 15.13 allows up to 10).
- **The supplier options show the name only.** Part 14 asks for a fact that tells two apart (last bill date); the read gives none.
- **A PDF is drawn by the browser's own viewer**, which an iPhone shows as its first page only; zoom is the viewer's own.
- **Receipts are read twice in development** (React's strict effects), once in production.
- **No autosave status** (15.9f), as Waves 2a/2b - each entry is saved by Add expense.

### Wave 2d: the fourth Daily Closing stage, "Cash Count" (Part 15.9 / 15.15d, D15-05)

`/entity/<shortid>/<name>/petty-cash/reports/new/cash-count?transaction_date=` replaces Flask's Bank Deposit **and** Cash Count pages on this branch, at Flask's Cash Count address. Part 15 folds Bank Deposit into Cash Count (D15-05): one stage, the deposit first, because the cash for the bank is taken out before counting (A15-02). It reads through `GET /reports/cash-count` and saves the deposit and the count **together** through `PUT /reports/cash-count` with `bank_deposit` (Minty `petty_cash_api/routes/cash.py`): one transaction, and a refusal of either writes nothing. `GET`/`PUT /reports/deposit` are not used.

The page, top to bottom (`components/closing/CashCount.tsx`, in Stage.tsx's frame; rules in `lib/cashCount.ts`):
1. **The Workflow header**, as Waves 2a-2c: Cash Count is current; Drawer, Sales and Expenses are done links to this app's stages. "Take out any cash for the bank first, then count what is left in the drawer and the safebox."
2. **The stage card**, three groups (Section header + why):
   - **Bank deposit**: "Cash on hand" as a Description row (opening cash and cash sales, less expenses - the API's figure), then **Cash taken for bank deposit** (optional), the Stage Amount input with the limit in its helper: "Optional. Up to HKD1,300.50, the cash on hand."
   - **Cash in the drawer**: Flask's calculator, kept (15.15) and now on the page instead of in a modal - the company's notes, then its coins, each a `fieldset`; one row per denomination: its name ("HKD1,000", "HKD0.50"), the count (`inputMode="numeric"`, digits only, labelled "Number of HKD1,000 notes"), and the row's amount. The amount wraps under the row before it is ever clipped. Then "Drawer total", a polite live region.
   - **Cash in the safebox** (optional): an Amount input. It counts with the drawer, as Flask's formula does.
3. **Check** (the stage summary, 15.15d): **Expected in drawer** (cash on hand less the deposit as typed), **Counted** (drawer + safebox), **Difference** in words - "HKD20.00 short", "HKD0.01 over", "None" - each a polite live region, plain text, never coloured. A difference adds a Warning inline alert, "The count is HKD20.00 short", and **Reason for the difference** (a Textarea; required while there is a difference, with the red `*`, sr-only "(required)" and `aria-required`; helper "So the reviewer knows what happened. 18 of 300 characters.").
4. **The actions**, as Waves 2a-2c. Enter in a count or an amount is Save & Next.

The rules (the owner's, 2026-10-15; the API refuses the same):
- **Expected = cash on hand - deposit; difference = (drawer + safebox) - expected**, to the cent, added up in cents (3 x HKD0.10 is exactly HKD0.30). **Any cent is a difference** (Flask ignored 0.01).
- **The deposit can't be more than the cash on hand**, said as it is typed and naming the amount allowed (the API's sentence): "The deposit can't be more than the cash on hand. Enter HKD1,300.50 or less."
- **A count above a million** is said as typed ("The count is 1,000,001. Enter 1,000,000 or fewer.").
- **The reason**: over 300 characters is said at once; missing while there is a difference only after a refused **Save & Next** ("The count is HKD20.00 short. Add the reason to continue."). **Save & Exit keeps a difference without one.** The reason is sent only while there is a difference (`""` otherwise), so a note never outlives the difference it explained.
- **A refused Save & Next** with one problem moves the focus to that field; with two or more the shared error summary takes the focus and links to each. Nothing is sent.
- **Save & Next** sends `{transaction_date, bank_deposit, counts: {<id>: n}, safe_box_balance, discrepancy_reason, action: "next"}` - **`bank_deposit` every time**, every denomination (an empty field as 0) - and goes on to Close (`openStep(..., "ending")`) - Flask's Ending page in Wave 2d, this app's own Close stage since Wave 2e (a client-side move). **Save & Exit** sends `action: "exit"` and goes to the launch page.
- **The API's 422** names its field (`bank_deposit`, `discrepancy_reason`, `safe_box_balance` or a denomination id): its sentence shows on that field, which takes the focus, until the field changes. A 409 without a place (`{error}`) is a Danger inline alert above the actions; no draft (409 `to: "opening"`, the read's or a save's) goes to Addition to Drawer with the sentence, read once.
- **Cash on hand below zero** is a business-rule gate (15.9e; Flask's "Fix Negative Balance" modal): the form gives way to a warning Page banner, "The cash on hand is below zero", with the sums ("Opening cash HKD600.00 plus cash sales HKD0.00, less expenses HKD620.00, comes to -HKD20.00, and cash can't be counted against less than zero. Check the expenses and the cash sales, then come back to Cash Count.") and one action, **Go to Expenses**. With the deposit limited to the cash on hand, the expected cash can only go below zero this way.
- **Unsaved changes** (by value: the deposit, any count, the safebox, the reason) hold the stage links and the back link, as Waves 2a/2b.

Addresses: `deposit` and `cash_count` are both ported steps (`lib/wizardPages.ts`'s `PORTED`, each to `reports/new/cash-count`), so the launch page's stage link, its **Continue** on a report in `deposit` or `cash_count`, and Expenses' Save & Next all open this stage in-app. Flask's own Bank Deposit address on this app, `.../reports/new/deposit?transaction_date=`, **redirects** here with the same day (`reports/new/deposit/page.tsx`, a server `redirect`) - both, so a link written either way lands.

Wave 2a-2c files touched for this wave:
- `lib/wizardPages.ts`: `deposit` and `cash_count` ported (to `reports/new/cash-count`).
- `components/closing/Expenses.tsx`, `components/closing/Stage.tsx`, `components/dashboard/Dashboard.tsx`: comments only (Save & Next and Continue already follow `isPorted`).
- `lib/__tests__/currencyInput.test.ts`: the step addresses.
- `e2e/02_dashboard.spec.ts`: Continue on a `deposit` report opens this app's Cash Count (stubbed), and a new test keeps Flask's resume for a report on Close; `e2e/05_expenses.spec.ts`: Save & Next lands on this app's Cash Count (stubbed); `e2e/04_sales.spec.ts`: a comment.

Against Flask's pages, deliberately: one stage instead of two (D15-05); the calculator is on the page, not in a modal behind a button, and the read-only "Cash Box Balance" it filled is gone (the drawer total is live); Flask's denomination label drew a 0.50 coin as "$0" (`| int`) - it reads "HKD0.50" here; "Cash Shortage"/"Cash Surplus" in red or green became the difference in words in a Warning alert; the cash-register and safebox pictures are gone (15.D); the "Fix Negative Balance" modal with four ways back became the gate with one; "Expected Cash Count Balance" is "Expected in drawer".

Known gaps of Wave 2d:
- **No autosave and no "Saved 6:02 pm"** (15.9f), as Waves 2a-2c.
- **The gate's one action is Expenses.** A negative cash on hand can also come from a missing cash sale or a low opening; Flask offered all four stages. 15.9e asks for one action, and the stage just before is the likeliest.
- **A difference shows on arrival.** Before anything is counted, Counted is HKD0.00 and the Check says the whole expected cash is short (with the Warning alert); nothing is red, and the reason is asked for only by Save & Next.
- **No denominations** (a company whose country has none set up): an Info inline alert says so in place of the calculator; a save is refused by the API's 409 ("...check the entity's country settings"), shown inline.
- **The no-draft sentence is the API's** ("...let's start with the opening entry."), as Wave 2b.

### Wave 2e: the fifth Daily Closing stage, "Close", and the outcome page (Part 15.9g / 15.15e / 15.12e)

`/entity/<shortid>/<name>/petty-cash/reports/new/ending?transaction_date=` replaces Flask's Ending page on this branch, at Flask's own address, and `/entity/<shortid>/<name>/petty-cash/reports/<report id>/submitted` replaces Flask's "Report submitted" page, at Flask's address shape. They read and submit through the Petty Cash API's Close routes (Minty `petty_cash_api/routes/close.py`), unchanged: `GET /reports/close`, `POST /reports/submit` and `GET /reports/<report id>/outcome`. The submit is Flask's own (`report/services/submit.py`, shared with the Jinja Close page).

**Close** (`components/closing/Close.tsx`, in Stage.tsx's frame; rules in `lib/close.ts`) is a Work Verification (15.9g): read-only, nothing typed, so no unsaved-changes hold. Top to bottom:
1. **The Workflow header**, as Waves 2a-2d: Close is current; the four stages before it are done links. "Check the day, then submit the Daily Report."
2. **The business-rule gate** (15.9e), only when the read's `problem` says the day can't be submitted now: a warning Page banner with the rule, the reason and one action, the stage that fixes it ("This day can't be submitted yet" / "Finish Sales before you submit the day." / **Go to Sales**; a date rule is **Go to Petty Cash**). A drawer below zero says it in figures, as Flask's Close did: "The drawer is below zero" / "Expected in drawer comes to -HKD20.00. Lower the deposit or check the earlier stages before you submit." / **Go to Cash Count**.
3. **The summary**, one card, a section per stage, each a Section header (h2) with an **Edit** link (named "Edit Sales" and so on, 44 tall) back to that stage in the app:
   - **Addition to Drawer**: "Starting cash balance", "Added to the drawer".
   - **Sales**: one row per method the Sales stage shows (Settings order, catalogue names, Deliveroo left out), "Cash", **Total sales**.
   - **Expenses (n)**: "General Expenses · ParknShop" per entry, "Receipts 1 of 2 expenses" (entries that carry a receipt), **Total expenses**; "No expenses added for the day." when there are none.
   - **Cash Count**: "Cash taken for bank deposit", "Expected in drawer", "Counted in the drawer", "In the safe box", **Difference** in words ("HKD20.00 short", "HKD0.01 over", "None"). A difference adds a Warning inline alert in this section (15.10b): "The count is HKD20.00 short" with "Reason: …" (or "No reason was given yet.").
4. **Closing balance**, the stage summary on a sunk surface, the API's figure.
5. **The actions** (15.2, not sticky): **Submit Daily Report** (Primary, busy "Submitting…") first and full width on a phone, Save & Exit (Ghost, a link home: every stage saved itself) under it; `[Save & Exit] [Submit Daily Report]` at the right from 640. While the gate stands, Submit is disabled with its reason under it ("Fix Sales first, then submit.", `aria-describedby`).

Every figure is the API's; nothing is added up in the browser. No KPIs or trends (D15-03): the read's `yesterday_total` and `history` are the Daily Report's. Amounts are plain text, never coloured. **Any cent is a difference** (the owner, 2026-10-15): `differenceOf` rounds on the size, so -0.005 is a cent short, never "None".

The rules:
- **Submit** sends `{transaction_date}` once - a ref guards it, so two clicks in the same tick send one request - and the button stays busy until the outcome page opens (a client-side move).
- **A refused submit** (409 `{error, to}`; nothing was written) is a Danger inline alert above the actions with the API's sentence and one link to where it is fixed ("The figures changed after the cash count. Check the cash count again, then submit." / **Go to Cash Count**); Submit comes back. A 409 `to: "submitted"` (someone submitted the day meanwhile) opens that report's outcome instead. A 422, 403 or no answer is the sentence alone ("We couldn't submit the day. Check your connection, then try again.").
- **No draft** (the read's 409 `to: "opening"`): Addition to Drawer, with the sentence as a warning Page banner, read once, as every stage.
- **A day already submitted** (the read's 409 `to: "submitted"` with `report_id`): its outcome page.
- These two, and the outcome after a submit, go **in place of** the Close page (`router.replace`), so Back from the outcome does not bounce through a day that is no longer open.

**The outcome page** (`components/closing/ReportOutcome.tsx`, rules in `lib/outcome.ts`): a Part 14 Outcome state (Kind = Completion), a centred 440 column. Minty (decorative), the outcome sentence as the h1 - "Today's report is submitted" when the report is the server's today, else "The report is submitted" - which takes the focus (15.12); "Tue 13 Oct 2026 · E2E Petty Cash Shop"; three facts from the server: **Cash counted** (drawer + safebox), **Difference** ("HKD20.00 short · note added", "HKD0.01 over", "None"), **Sent to Xero** ("Yes · 6:12 pm" on the device's clock, "Pending", "Not yet: it failed", "Not yet"). While Xero is working on it, an Info inline alert says so (15.12 partial success). Then **View report** (Primary, full width) and, centred under it, **Back to home** and **Start the next day**. A report that is not submitted (a reopened draft) says "This report isn't submitted yet" with **Go to Close**. An id the API doesn't know (another company's, or none) shows the API's sentence and Back to home.

- **View report** opens the report's Daily Report, this app's own since Wave 2f (`reportHref`; it was Flask's report summary for the day).
- **Start the next day** goes to the **launch page**, which starts `next_day` itself (`requestStart` / `takeStartRequest`, Flask's `autoStartNextDay`): the same rules as its Start button - the date rules, **Before You Start** when the submitted day banked cash, the deposit correction - then Addition to Drawer. It starts only when that day is the one the launch page would start (today with nothing open, or the gate's day), not for read-only access and not under Setup Required; otherwise the page just opens. It is offered only for an earlier day's report: today's next day is tomorrow, which no rule lets start.

Addresses: `ending` is a ported step (`lib/wizardPages.ts`'s `PORTED`, to `reports/new/ending`), and `outcomeHref` is the outcome page. So Cash Count's Save & Next, the launch page's Continue on a report in `ending`, and its Close step link open Close in the app.

Wave 1 and 2a-2d files touched for this wave:
- `components/closing/Stage.tsx`: `refused` sends a `to: "submitted"` (with `report_id`) to the outcome page; a read refused with a place to go now **replaces** the page instead of pushing it (Close's already-submitted case would otherwise trap Back; Expenses' and Cash Count's no-draft reads behave the same way, now without the extra history entry); comments.
- `lib/wizardPages.ts`: `ending` ported; `outcomeHref`.
- `components/dashboard/Dashboard.tsx`: takes the outcome page's start request once on arrival and runs its own `start(day)`; a comment.
- `components/closing/CashCount.tsx`: a comment only (Save & Next already follows `isPorted`).
- `lib/__tests__/currencyInput.test.ts`: the step addresses (every step is this app's; the outcome address).
- `e2e/02_dashboard.spec.ts`: Continue on a report left on Close opens this app's Close (was: Flask's resume); a quiet Close stub. `e2e/06_cash_count.spec.ts`: Save & Next lands on this app's Close (stubbed).

Against Flask's pages, deliberately: Close's alerts are a gate with one action (the drawer below zero) and a section issue (the difference), with Submit disabled and its reason beside it - Flask only disabled Submit for the drawer; any rule the API reports now gates on arrival, not only after a refused submit; "Receipts" counts entries with a receipt, not receipt files (the same with the API's one-receipt rule); Close's Save & Exit is a link, as Flask's was.

Known gaps of Wave 2e:
- **Publish to Xero is left out** of the outcome page (the Xero API is not ported to the Petty Cash API). The Daily Report (Wave 2f) links to Flask's page for it. Part 15.12e names only View report and Back to home.
- **No polling while Xero publishes**: "Pending" and the Info line stay until the page is reloaded (Flask's page polled its own publishing-status endpoint).
- **Minty is the 2D cat** (`/cat-hole.png`), not the 3D happy pose 15.12e asks for, as everywhere.
- **The no-draft sentence is the API's** ("...let's start with the opening entry."), as Waves 2b-2d.
- **The gate's sentence is the API's** for every rule but the drawer below zero, and the API's below-zero sentence ("Hmm, it looks like your cash balance is negative...") is what a refused submit shows if the figures change between the read and the submit.

### Wave 2f: the Daily Report (Part 15.7 / 15.15f)

`/entity/<shortid>/<name>/petty-cash/reports/<report id>/summary` replaces Flask's report summary on this branch, at Flask's id address for it. It reads and acts through the Petty Cash API's report routes (Minty `petty_cash_api/routes/report.py`), unchanged: `GET /reports/<id>`, `POST /reports/<id>/reopen`, `DELETE /reports/<id>` and `POST /reports/<id>/share-link`; receipts through Expenses' `GET /expense-lines/<id>/receipts/<receipt id>`. Its order is Flask's redesigned Jinja page's (`report/ending.html`).

The page, top to bottom (`components/closing/DailyReport.tsx`, rules in `lib/report.ts`, a centred 720 column - 15.D: reports are read, not compared):
1. **The Report header** (15.1 Report): "‹ Petty Cash" back to the launch page; "Daily Report" (the h1) with the API's Status pill (`status_label` / `status_tone`: Submitted and Publishing to Xero are Info, Published to Xero Success, Publish failed Danger, Draft Neutral; a tone outside Part 13's five is logged as an error and drawn Neutral); the day; then the actions, each only while `permissions.*` says so (15.1: hidden, not disabled): **Share** (Secondary), **Publish to Xero** (Primary, while the report is not in Xero) and **More** (Part 14 Menu: "Publish to Xero again" once it is in Xero, **Edit report**, then **Delete report** last in Danger - D15-14). `[Share] [Publish to Xero] [More]` at the right from 768; on a phone the Primary is first and full width, Share and More share the row under it, and More opens as a bottom sheet.
2. **Three KPIs** (15.7: exactly these): Total sales, Total expenses ("2 expenses"), Cash position ("Counted, with the safe box") - stacked on a phone, in a row from 640; amounts wrap before they are ever clipped.
3. **The difference as a fact** (15.7; any cent counts): a Warning inline alert, "Cash was HKD20.00 short" / "Note: Change given twice" (or "No reason was given.").
4. **The breakdowns**, collapsed native disclosures: **Sales by method** (the Sales stage's methods in Settings order, Deliveroo left out, Cash, Total sales), **Expenses (n)** (Record rows: the account, the amount, "ParknShop · Account 429", the description; Total expenses), **Receipts (n)** (a File card per receipt, "General Expenses · HKD120.50", opening it **full screen** in the app's one viewer, `ReceiptViewer.tsx` - never a new tab), **Cash** (starting cash, added, where it came from, cash sales, expenses, deposit, expected, counted, safe box, the difference in words).
5. **Closing balance**, the server's figure on a sunk surface.
6. **The audit facts** (Part 14 Audit meta, on the device's clock): "Submitted by Olive Tan · Tue 13 Oct 2026, 6:12 pm", then "Sent to Xero · Tue 13 Oct 2026, 6:15 pm", "Publishing to Xero", "Xero publish failed" or "Not in Xero yet".

Every figure is the API's; nothing is added up in the browser. Amounts are plain text, never coloured.

The actions:
- **Edit report** asks first, as Flask's page does (a Part 14 Confirmation modal, Cancel focused): "Edit this report?" / "It goes back to a draft so every stage can be changed, then you submit it again." A report that has been to Xero (`was_published`) adds a Warning: "It is already in Xero" / "Publishing it again adds new entries in Xero. The ones there now are not removed: void them in Xero by hand." **Edit report** sends `POST reopen` once (a ref guards it) and opens the first stage, Addition to Drawer, for the day (`openStep`, a client-side move).
- **Delete report** is a Destructive Confirmation modal: "Delete this report?" / "**The Daily Report for Tue 13 Oct 2026 is deleted with its expenses and receipts.** This can't be undone.", Cancel focused, **Delete report** in Danger. **The owner's rule (2026-10-15):** a report that has been to Xero MAY be deleted, but the modal warns first: "It is in Xero" / "Deleting it here does not remove its entries in Xero, and publishing this day again adds a second copy. To change the report, use Edit report instead." After `DELETE`, the launch page opens **in place of** the report (`router.replace`) and says "The Daily Report for Tue 13 Oct 2026 is deleted." as a Success Page banner, read once (`lib/flash.ts`).
- **Share** (Flask's "Share this report"): a modal - "Anyone with the link can read the Daily Report for Tue 13 Oct 2026, without signing in, until it expires." - makes the link with `POST share-link` and shows it read-only; **Copy link** copies it, closes the modal and confirms with a **toast**, "The link to the Daily Report for Tue 13 Oct 2026 is copied." (`components/ui/Toast.tsx`, minty-payment-request-web's Part 14 look: one raised card, "Success", bottom-left on a computer and bottom-centre on a phone, 5 s, paused on hover or focus - the branch's first toast). A copy the browser refuses says so (Warning) and leaves the link to copy by hand.
- **Publish to Xero is not ported.** While `permissions.publish` is true the page links, full page, to Flask's page for it - its outcome page, `/entity/<id>/petty-cash/reports/<report id>/submitted`, through `ACCOUNTS_API_URL` (`publishUrl`, `lib/flaskPages.ts`) - which publishes with its own confirmation and polls the status.

Refusals are the API's sentence as an inline alert where the action was taken - never a false success and never a toast. A refused reopen or delete (400 not the latest, 403, 409 while Xero is publishing, 409 already a draft) shows inside its modal, which stays open with its action back; a refused share link (409 for a draft) inside the Share modal, with Copy link disabled. An id the API doesn't know (404, another company's included) shows the sentence and **Back to home**, as the outcome page does. **A reopened report** (still a draft) shows its Draft pill and an Info Page banner, "This report isn't submitted yet" / "Check the day in Close, then submit it." with **Go to Close**, and no actions (Flask's page offered only Continue).

The ways in, now this app's (`reportHref`, `lib/wizardPages.ts`; `reportSummaryUrl` is gone): the outcome page's **View report**, the launch page's **Recent reports** rows (by `published[day].id`), and its Done state's **View report** (`launchState` now carries `reportId`) - all client-side.

Wave 1 and 2a-2e files touched for this wave:
- `components/closing/ReportOutcome.tsx`, `components/dashboard/Dashboard.tsx`: View report and the Recent reports rows open this page (`Link`); comments.
- `lib/dashboard.ts`: the Done state carries the report's id. `lib/close.ts`: `salesRows` takes any `{sales: {methods}}` (Close's and the Daily Report's). `lib/dates.ts`: `momentText`. `lib/flaskPages.ts`: `publishUrl` in place of `reportSummaryUrl`. `lib/wizardPages.ts`: `reportHref`.
- `app/.../reports/[reportId]/submitted/page.tsx`: the id is read by `reportIdFromSegment` (`lib/report.ts`), shared with this page.
- New in `components/ui/`: `MoreMenu.tsx` (Part 14 Menu) and `Toast.tsx` (Part 14 Toast) - `@minty/shared/ui` has neither yet.
- `e2e/02_dashboard.spec.ts`, `e2e/07_close.spec.ts`: View report and Recent reports land on this page. `lib/__tests__/dashboard.test.ts`, `lib/__tests__/currencyInput.test.ts`, `lib/__tests__/dates.test.ts`: the Done state's id, the page's address, `momentText`.

Its way back was the launch page ("‹ Petty Cash") while history was Flask's; since Wave 2g it is "‹ Reports", the report history, as Flask's page does.

Against Flask's page, deliberately: Publish to Xero is on the report (Flask's redesign keeps it on the outcome page only); Share confirms with a toast instead of a line inside the modal; Delete lands on the launch page with a banner; a draft shows its figures with the way back to Close.

Not yet (no API):
- **Per-field edits on a submitted report**: the difference reason, the withdrawal (where the cash came from), an expense line's supplier, account or receipt (Flask's "Edit details" on an earlier report). Only Edit report (back to a draft, latest report only) exists.
- **Download PDF** (15.7's header names it) and **revoking a share link** (15.7: "read-only and revocable").
- **The shared (public) variant**: a share link still opens Flask's page.
- **"Edited after submission"** (15.7's Info banner "Edited by … · see history"): the read carries no edit history.
- **Charts** (15.7: optional) with their table alternative.

Known gaps of Wave 2f:
- **No polling while Xero publishes**: "Publishing to Xero" stays until the page is reloaded, as on the outcome page.
- **The audit facts are on the device's clock**, as the outcome page's "Sent to Xero" time.
- **The toast and the More menu live in this app** until `@minty/shared/ui` has them.
- **Recent reports still say Submitted** for a day already in Xero (`published[day].xero_integrated` is not read there yet); the Daily Report itself says Published to Xero.

### Wave 2g: Report history (Part 15.4b)

`/entity/<shortid>/<name>/petty-cash/reports` replaces Flask's report history on this branch, at Flask's own address. Every filter lives in the address: `?status=&start_date=&end_date=&page=&per_page=`.
- Back and a reload keep the filters, and a filter change goes back to page 1.
- It reads `GET /reports` (Minty `petty_cash_api/routes/history.py`) with the address's five keys exactly as they stand, so a bad one is the API's to refuse.
- Edit and Delete use the Daily Report's `POST /reports/<id>/reopen` and `DELETE /reports/<id>`, unchanged.
- Its order and content are those of Flask's redesigned Jinja page (`report_history/report_history.html`).

The page, top to bottom (`components/history/ReportHistory.tsx`, rules in `lib/history.ts`, a centred 960 column - 15.4: list rows stay at most 960 wide):
1. **The Standard header** (15.1): "‹ Petty Cash" back to the launch page, "Reports" (the h1, the sidebar's word and Flask's), "Every Daily Report, newest first."
2. **The date range** (Part 14 has no Date range yet: two Date fields, the native pickers): **From**, **To**, **Show** (Secondary; Enter in a field is Show) and **Export CSV** (Ghost). On a phone the two dates share one row and the buttons go under them.
   - An end before the start is said at once on To: "The end date is before the start date. Choose a later end date."
   - One date alone means "not finished yet", so it is said only when Show is pressed, on the empty one: "The To date is still empty. Choose it to see the reports between the two dates." The field takes the focus, and from then on both are checked as typed.
   - Nothing is sent while either stands. The fields follow the address, so Back puts the dates back.
3. **The status chips** (Part 14 Filter chip, toggles with `aria-pressed`, the pill's own words): All, Draft, Submitted, Published to Xero, Publish failed.
   - "Publish failed" also holds a publish still under way (Publishing to Xero), as the API's `failed` does.
   - On a phone they scroll sideways in their own row (never the page), and the chosen one is brought into view.
   - **Clear filters** follows them while a status or a date range is set.
4. **The reports** as Part 14 Record rows, newest day first, in a list named "Daily Reports":
   - the day (the row's link; the whole card opens it);
   - the meta line, "Expenses HKD240.50 · Submitted by Olive", or "Daily Closing in progress" for a draft;
   - Total sales, plain text, never coloured, captioned "Sales" (its own right-aligned 160 track from 768);
   - the API's Status pill (`status_label` / `status_tone`, through `reportPill`);
   - the row's **More** menu where the API allows anything.
   - A failed publish lists its reasons under "Why it didn't reach Xero", each with an icon and, once resolved, "· Resolved" in words.
   - On a phone each row is a stacked card. From 768 the amount and the pill sit in their own columns.
5. **The pager** (Part 14 Pagination): "Showing 21–30 of 120", **Rows per page** (10/25/50/100) and the pages as links in the address (`1 … 2 3 4 … 12`, `aria-current="page"`).
   - Previous / Next are disabled at the ends.
   - Targets are 36 for a pointer and 44 for touch (`pointer-coarse`: by the input, not the width).
   - A phone gets Previous, "Page 3 of 12" and Next only.

The states:
- **Loading:** five Skeleton rows (`aria-busy`). A reload in place (Try again, or after a delete) keeps the rows on show.
- **No reports at all:** the 15.11a first-use Empty state with Minty, "No reports yet" / "Completed Daily Reports will appear here." (Part 10's words) and **Go to Petty Cash**.
- **No reports match:** the 15.11c Empty state, no character, "No reports match these filters" / "Try another date range or status." and **Clear filters**.
- **A 422** (a filter the API refuses, from a typed address): the API's sentence as a Danger inline alert with **Clear filters**.
- **Any other failure:** the API's sentence (or "We couldn't reach Petty Cash. Check your connection, then try again.") with **Try again**.
- **A page past the end** (the last row of the last page deleted, or a typed address): the last page opens in its place.

Opening a row:
- **A submitted row** opens its Daily Report (`reportHref`), client-side.
- **A draft** opens its Daily Closing where it was left, as the launch page's Continue does: the row's `current_section` (opening .. ending) through the app's section-to-stage mapping (`stepHref`; `deposit` and `cash_count` are both Cash Count), or Addition to Drawer when it names none. It is a plain link, so a new tab lands there too. A section this app did not know would go to Flask's resume (`resumeUrl`), as on the launch page.

The row actions (Part 14 Menu, `components/ui/MoreMenu.tsx`), each only where the API allows (15.1: hidden, not disabled):
- **Publish to Xero**, or "Publish to Xero again" once the pill says Published to Xero: with `can_publish`, never on a draft. It stays Flask's page, a full-page link (`publishUrl`).
- **Edit report** (`permissions.edit`: the latest report only, never a draft): the Daily Report's Confirmation modal (with "It is already in Xero" when it has been there). It reopens the report, then opens Addition to Drawer for the day.
- **Delete report** (`permissions.delete`), last, in Danger: the Daily Report's Destructive modal, with the owner's "It is in Xero" warning when `was_published`.
  - On success the list is read again in place, a **toast** says "The Daily Report for Tue 13 Oct 2026 is deleted.", and the focus goes to the h1.
  - A refusal shows the API's sentence inside the dialog, which stays open.

**Export CSV stays Flask's download**: a full-page link to `ACCOUNTS_API_URL` + `/entity/<entity id>/petty-cash/reports/download-csv?start_date=&end_date=` (`csvUrl`, `lib/flaskPages.ts`).
- It exports the dates the list **shows** (the address's), not what the fields hold while typed.
- Until both are shown it is a disabled button with its reason beside it (`aria-describedby`): "To export, choose both dates and select Show."

The ways in, now this app's (`historyHref`, `lib/wizardPages.ts`; Flask's `historyUrl` is gone):
- the launch page's **See all** (a client-side `Link`);
- the sidebar's **Reports** (`components/ui/sidebarHost.ts`'s `pettyCashReports`);
- the Daily Report's way back, "‹ Reports" (it was "‹ Petty Cash"). 15.1 gives a Record header a back link to its parent list, and Flask's Daily Report goes back to history.

Wave 1 and 2a-2f files touched for this wave:
- `components/closing/DailyReport.tsx`: Edit report and Delete report moved to `components/closing/ReportDialogs.tsx` (`EditReportDialog`, `DeleteReportDialog`), shared with this page. Where a delete lands stays the page's (`onDeleted`), so the Daily Report behaves as before. The back link is "‹ Reports".
- `lib/report.ts`: `reportPill`, `publishLabel`, `editWarning` and `deleteWarning` take only the fields they read, so a history row fits them.
- `lib/flaskPages.ts`: `csvUrl` in place of `historyUrl`. `lib/wizardPages.ts`: `historyHref`.
- `components/dashboard/Dashboard.tsx`: See all. `components/ui/sidebarHost.ts`: Reports.
- `components/ui/__tests__/sidebarHost.test.ts`: Reports is this app's page. `e2e/02_dashboard.spec.ts`: See all lands on this app's history (a quiet stub of its read). `e2e/08_daily_report.spec.ts`: the back link.

Against Flask's page, deliberately:
- a failed row shows its publish reasons on the page, where Flask's redesign dropped them (its old page had them in a hover tooltip);
- Edit report and Publish to Xero join Delete in the row's More menu, where the API allows them;
- a delete reloads the list in place with a toast, not the whole page with a flash;
- a filter the API refuses says so, where Flask quietly fell back to the whole list.

Not yet (no API):
- **Counts on the chips** (15.4: "counts per status from the same query"): the read gives only the filtered total. 15.4b's historical variant says "no counts" anyway.
- **Search** (15.4b: "search/date filter first"): the API filters by status and dates only.
- **The Table view** (15.4, D14-16): Record rows only.

Known gaps of Wave 2g:
- **"Publish to Xero again" is chosen by the pill's tone** (Success is only ever Published to Xero): the rows carry no `xero_integrated`.
- **The date fields are the browser's own pickers**, in the device's date order. Part 14's Date field wants a calendar popover on a computer, and its Date range is a future component.
- **A phone has no numbered pages**, only Previous / Next and "Page n of m" (Part 14 Pagination: "Phone: prev/next or Load more"). There is no Load more.
- **No polling while Xero publishes**, as on the Daily Report.

### Wave 2h: Petty Cash settings, without Xero (Part 15.20 / 15.20b)

`/entity/<shortid>/<name>/settings/petty-cash` replaces the parts of Flask's Petty Cash settings that need no Xero, at Flask's own address (`settingsHref`, `lib/companyPages.ts`). It reads `GET /settings` and writes through `PUT /settings/country` and the sales-method routes (Minty `petty_cash_api/routes/settings.py`), unchanged. Its order and content are those of Flask's redesigned page (`entity/settings_entity.html`, `partials/electronic_delivery_section.html`, `static/js/petty_cash_settings.js`).

The page, top to bottom (`components/settings/PettyCashSettings.tsx`, rules in `lib/settings.ts`, a centred 720 column):
1. **The Standard header** (15.1): "‹ Petty Cash" back to the launch page, "Petty Cash settings" (the h1). No intro text (2.9.10).
2. **Country & currency** (one card, its own Save): **Country** and **Currency**, native selects in Part 14 Input geometry.
   - A country alone brings its currency: choosing another country puts Currency on "The country's own currency" with "Saving sets the currency that goes with the country. Choose one here to use another." Choosing the saved country again puts the saved pair back.
   - Save sends only what changed (`{country_code}`, `{currency_id}` or both).
3. **Sales methods** (one card, its own Save): **Electronic** and **Delivery**, each a group (h3 + why) with its methods in list order (an ordered list), then **Add electronic method** / **Add delivery method** (Secondary).
   - **Add** opens a panel in place with one field, **Method** (required: the red `*`, sr-only "(required)", `aria-required`). It is an ARIA combobox over the catalogue methods not on the list (`available`, plus any removed on the page and not saved yet), narrowed as typed, A to Z, in the page's flow. A name the catalogue has (any case) is that catalogue method under its own spelling (`sale_info_id`); any other name is a new one (`name`). ↑ ↓ Enter choose; Enter with nothing highlighted is Add; Escape closes the list.
   - **Each row's More menu** (`components/ui/MoreMenu.tsx`; a bottom sheet on a phone): **Rename**, **Move up**, **Move down**, then **Remove** in Danger. Move up / Move down are the non-drag reorder, by keyboard (Enter opens the menu, ↓ Enter chooses) and by touch. After a move the focus stays on that row's More button and "AlipayHK moved to 2 of 3." is said (polite).
   - **Rename** is a Part 14 modal with **Name** (required), checked as typed.
   - A row not saved yet says "Added · not saved yet" or "Renamed from Octopus · not saved yet". Removals are listed under the lists: "Removed when you save: Visa. Reports that used them keep their amounts."
4. **Xero**, only while `xero_connected`: one sentence ("The Xero account mapping and the Petty Cash account codes are set on the Xero settings page, which reads them from Xero.") and **Go to Xero settings**, a full-page link to Flask's page (`settingsUrl`, `lib/flaskPages.ts`). No Xero behaviour is ported (the owner, 2026-10-16).

The rules:
- **One Save per card** (15.20b), Primary, first and full width on a phone. It is disabled with its reason beside it (`aria-describedby`): "No changes to save yet." until the card changed, and "Only Accountants and Admins can change these." (Flask's words) for someone who may change nothing in it.
- **The sales methods wait for Save**, as on Flask's page. The API takes one change per call, so Save sends them one by one (`saveMethods`): removals, additions, renames, then each touched list's order (`PUT /sales-methods/order` with that list in full). The order goes only when the API's order differs from the page's, and only for someone who may reorder.
- **A save stops at the first refusal.** A Danger inline alert in the card names what wasn't saved ("Octopus wasn't renamed") with the API's sentence, plus "The changes before it are saved; the rest are still waiting for Save." when some went through. What went through is kept, and the rest stays on the page.
- **A save that went through** is a toast: the API's `message` for one change ("WeChat Pay added.", "Name saved.", "Order saved.", "Method removed. Reports that used it keep their amounts.", "Country and currency saved."), or "Sales methods saved." for several. A refusal (403, 404, 409, 422, or no answer) is never a toast and never a false success.
- **Names are checked as typed** (CLAUDE.md; the API refuses the same):
  - over 100 characters, at once: "The name is 101 characters. Shorten it to 100 characters or fewer.";
  - a name already on that list (any case), at once: "visa is already on the list. Type another name.";
  - a new name for a method other companies use too (the read's `shared`: renaming it would rename the shared catalogue method, which the API refuses with a 409), as soon as the name differs from its own: "Other companies use Visa too, so it can't be renamed here. Remove it and add a new method instead." Rename stays in the menu for it, so the person learns why in place; a menu item can't carry a reason beside it, so it is neither hidden nor disabled;
  - empty, only after a refused Add or Rename: "The method's name is still empty. Choose a method or type a new name to add it."
- **Permissions** (`permissions.*`):
  - the pickers only with `edit_country`, otherwise the country and currency as facts;
  - Add only with `add_sales_method`;
  - Rename and Remove only with `rename_sales_method` and `remove_sales_method` (a method not saved yet is the person's own addition and needs only `add_sales_method`);
  - Move up and Move down only with `reorder_sales_methods`.
  - A cashier sees the page read-only: facts, plain lists, no menus, and both Saves disabled with the reason. Without `view_sales_methods` the card says "Your role can't see the sales methods. Ask an Accountant or an Admin."
- **Unsaved changes ask first** (`@minty/shared/leaveGuard`, minty-web's words). A link out of the page (the back link, the sidebar, Go to Xero settings) opens "Leave without saving?" with **Go Back** (focused) and **Discard changes**. A reload or a closed tab gets the browser's own prompt.

The ways in:
- **The sidebar's Settings** is this page now (`components/ui/sidebarHost.ts`; `currentOf` marks this address as current). The package draws it as a plain link, so it is a full page load.
- **The launch page's two settings links stay Flask's page.** Setup Required (the Xero account and contact slots not mapped) and a deposit correction's missing Deposit Bank Account / Petty Cash Account are all Xero mappings. Wave 1 had already removed the launch page's other settings link (Quick Actions' Entity Settings).

Wave 1 and 2a-2g files touched for this wave:
- `components/ui/sidebarHost.ts` (and its test): Settings is this page; the current-page pattern is its address.
- `lib/companyPages.ts`: `settingsHref`. `lib/flaskPages.ts`: `settingsUrl` is now for the Xero parts (a comment).
- `components/dashboard/Dashboard.tsx`: a comment only.

Against Flask's page, deliberately:
- Electronic and Delivery are **one card with one Save** (15.20b, two cards on the page), where Flask has a card and a Save for each.
- **Rename** is in the row's menu with a modal, where Flask renamed by clicking the name.
- **Remove asks nothing**: it only waits for Save, and the method can be added back. Flask's pending delete asked first.
- **A refusal stops the save** and says which change it was, where Flask sent every change and reported the first failure as "Nothing else was saved".
- Country and currency are native selects, where Flask has searchable pickers.
- Without Xero connected there is **no Xero card**, where Flask's mapping and account-code cards say "Xero isn't connected. Connect it in Entity & Integration".

Not yet:
- **The Xero parts** (the account mapping and the account codes): Flask's page.
- **The "Congratulations!" modal** (`?success=true`) Flask showed after a settings save, which the faithful port listed as coming with this page. Part 14 confirms a save with a toast.

Known gaps of Wave 2h:
- **No drag to reorder**: Move up / Move down only.
- **Every Save sends one call per change**, so many changes are several round trips. Two people editing at once can stale the order (the API's 409, shown with its sentence).

## Not here yet

- **Xero publish** is next, once it is confirmed. The Daily Closing's five stages and its outcome page are this app's since Wave 2e, the Daily Report since Wave 2f, the report history since Wave 2g, and Petty Cash settings without its Xero parts since Wave 2h.
- **Settings' Xero parts** (the account mapping and the account codes) stay on Flask's page (the owner, 2026-10-16); another session is on Xero.
- **PR previews and the Vercel project** belong to the infra step (Step 5), which is being re-planned. That is why there is no `preview.yml` yet.
