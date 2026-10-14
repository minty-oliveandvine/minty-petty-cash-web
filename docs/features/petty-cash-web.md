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
| `npm test` | Vitest. Covers the proxy, auth, the hand-off, the API client, company addresses, the sidebar host, the launch page's rules and the Daily Closing stage mapping, and the three guards (styles, assets, raw colours). |
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
| In progress | an open report (the newest draft; its day is `draft_date`, as Flask's Continue used it) | its stages, **Continue Daily Closing** to Flask's resume |
| Done | `published[server_today]` exists | all five done, "Today's report is submitted", **View report** to Flask's summary |
| Not started | otherwise | five stages ahead, **Start today's Daily Closing** |
| Gate | yesterday has no submitted report although earlier days do | the Start is disabled with "Finish Tue 13 Oct first." beside it, and the banner starts that day |
| Loading | until `/home` answers | a skeleton card |

- **Starting goes through the kept rules.** `startProblem` runs first, and its sentence shows inline in the card. Then comes "Before You Start" when the day before banked cash, the Deposit to Bank amount, and `POST /deposit-correction`. Only then does Flask's wizard open on the right day.
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
- **The open stage.** Done and current stages link into that stage of Flask's wizard. Cash Count opens at the deposit, its first section, unless the report is in `cash_count`.

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

## Not here yet

- **The other pages.** The report wizard, history, the report summary, settings and Xero publish are next, in that order.
- **PR previews and the Vercel project** belong to the infra step (Step 5), which is being re-planned. That is why there is no `preview.yml` yet.
