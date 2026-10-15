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
| `npm test` | Vitest. Covers the proxy, auth, the hand-off, the API client, company addresses, the sidebar host, the launch page's rules, the Daily Closing stage mapping, the Addition to Drawer, Sales and Expenses rules (and the receipt read), the stage addresses, the money input and the flash, and the three guards (styles, assets, raw colours). |
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
5. **"Recent reports"**: the newest three submitted days as Record rows (the day, "Closing balance", the amount as plain text, a Submitted pill in Info), each opening Flask's report summary, plus "See all" to Flask's history.

Layout (15.6 Responsive, with this app's Tailwind breakpoints): one column on a phone; at most 640 wide on a tablet; from `lg` (1024) the card and the recent reports sit side by side (2:1), centred, at most 1200.

The states (`launchState` and `gateDay`, `lib/dashboard.ts`):

| State | When | The card |
|---|---|---|
| First use | nothing submitted and no open report | 15.11a empty state with Minty, "Your first Daily Closing", **Start today's Daily Closing** |
| In progress | an open report (the newest draft; its day is `draft_date`, as Flask's Continue used it) | its stages, **Continue Daily Closing** to Flask's resume (to this app's own stage when the report is on Addition to Drawer, Sales or Expenses, Waves 2a-2c) |
| Done | `published[server_today]` exists | all five done, "Today's report is submitted", **View report** to Flask's summary |
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
- **Cash Count onwards are still Flask's pages**, in Flask's look, with its six-step stepper (Sales moved here in Wave 2b, Expenses in Wave 2c).

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
- **No draft for the day** (409 `to: "opening"`): the person is taken to this app's Addition to Drawer, which shows the API's sentence as a warning Page banner under its header, read once (`lib/flash.ts`). Any other refusal (422, 403, no answer) is a Danger inline alert above the actions, and the actions come back.
- **Unsaved changes** are counted by amount: grouping does not count, an emptied field does (it saves as zero), and putting a value back clears the hold.
- **The launch page's Continue** opens this stage when the report is on `sales` (and Expenses on `expenses`, Wave 2c); every later section still uses Flask's resume. Addition to Drawer's Save & Next opens it in-app.

Known gaps of Wave 2b:
- **No autosave and no "Saved 6:02 pm"** (15.9f), as Wave 2a: the API saves only on Save & Next / Save & Exit and carries no saved time.
- **A day with no draft still shows the form.** The API refuses only the save (409), so someone who types first is sent to Addition to Drawer and loses what they typed. A business-rule gate on arrival (15.9e) would need the read to say so; `draft: null` alone could be used, but Flask's page did not gate either.
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
- **Save & Next** sends `{transaction_date, action: "next"}` and goes on to Cash Count, which opens at Bank Deposit - still **Flask's page** (`openStep(..., "deposit")`, a full navigation). **Save & Exit** sends `action: "exit"` (Flask records nothing) and goes to the launch page.
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

## Not here yet

- **The other pages.** The report wizard, history, the report summary, settings and Xero publish are next, in that order.
- **PR previews and the Vercel project** belong to the infra step (Step 5), which is being re-planned. That is why there is no `preview.yml` yet.
