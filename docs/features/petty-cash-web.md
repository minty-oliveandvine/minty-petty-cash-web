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

| Variable                  | What                                           | Default (decided ports) | Today on a workstation                            |
| ------------------------- | ---------------------------------------------- | ----------------------- | ------------------------------------------------- |
| `ACCOUNTS_API_URL`        | Flask: the hand-off, `/api/me/profile`, logout | `http://localhost:8000` | `http://localhost:5001`                           |
| `PETTY_CASH_API_URL`      | Petty Cash's API: `pettyCashFetch`             | `http://localhost:8010` | `http://localhost:5001` (Flask serves it for now) |
| `SUBSCRIPTION_API_URL`    | the sidebar's Subscriptions                    | `http://localhost:8001` | `http://localhost:8000`                           |
| `PAYMENT_REQUEST_WEB_URL` | the sidebar's Bills (fallback)                 | `http://localhost:3020` | same                                              |

- **Inlined at build time.** Every variable is listed under `next.config.ts`'s `env`.
- **The Petty Cash API is in Flask for now.** It lives at `/api/petty-cash/v1/companies/<id>/...`, Minty's `blueprints/petty_cash_api` (Minty `docs/features/petty-cash-api.md`). The owner's target is a Django `minty-petty-cash-api` serving **the same paths**, so only `PETTY_CASH_API_URL` changes when it moves.
- **The company is only in the path.** Flask checks it against membership on every call, and the door fails closed.
- **One header pair.** Every call sends `Authorization` and nothing else (Flask's CORS allows `Authorization` and `Content-Type`).
- **Errors.** A refusal is `{"error": "<sentence>"}` (`detail` and `message` are read too), and the screen shows the sentence when it reads as one; a machine code, a one-word answer, markup or an empty string becomes the house line "Something went wrong on my end. Mind trying again?" (`HOUSE_FALLBACK`, `@minty/shared/errorCopy`; owner 2026-10-21). A fetch that never got an answer says "We couldn't reach Petty Cash. Check your connection, then reload the page." It is never the browser's error text.
- **No token, no call.** With no token cookie a call is never made: it goes back through the hand-off (or, for a decoration's `onUnauthorized: "reject"`, only rejects).
- **No default in production.** The local ports above are development and test defaults only: a production build with a variable unset throws, naming it (`envUrl`, `@minty/shared/env`). CI and every Vercel environment set all four.

## Shared modules (`@minty/shared`)

Since the shared-code refactor (2026-10-21) the non-UI code every Next.js app had a copy of comes from the package; this app keeps only its configuration of it and what is its own.

| Package module                                                                                                                         | Used for                                                                      | This app's part                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `env` (`envUrl`)                                                                                                                       | the four base URLs                                                            | `lib/env.ts` names them and their local ports                                                                                                                                        |
| `auth` (`createCookieAuth`, `decodeJwtPayload`, `moduleClaims`, `isTokenExpiringSoon`)                                                 | the token cookies, the claims, the proxy's renewal                            | `lib/auth.ts`: the `petty_cash` instance, a positional `setAuth`                                                                                                                     |
| `clientValue` (`useClientValue`)                                                                                                       | reading the cookie while rendering                                            | `lib/useAuth.ts`                                                                                                                                                                     |
| `handoff` (`createHandoff`, `hubHandoffUrl`, `logoutUrl`)                                                                              | `/handoff/petty-cash-web`, `/handoff/minty-web`, `/logout`                    | `lib/handoff.ts`: the instance (route, `companyFromNext: addressCompanyRef`, home `/`)                                                                                               |
| `landing` (`useLandingHandoff`)                                                                                                        | `/landing`                                                                    | `app/landing/page.tsx`: no token goes back through the hand-off                                                                                                                      |
| `companyRef` (`companyPath`, `addressCompanyRef`, `companyRefFromPath`, `settingsSectionUrl`, `paymentRequestSettingsUrl`, `billsUrl`) | addresses, the company an address names, the settings pills, Bills            | `lib/companyPages.ts` (this app's pages), `lib/hub.ts` (`integrationUrl`, `subscriptionSettingsUrl`)                                                                                 |
| `previewSibling` (`withReturnOrigin`, `siblingUrl`)                                                                                    | the preview set's way back                                                    | -                                                                                                                                                                                    |
| `proxy` (`toFlask`)                                                                                                                    | the proxy's trip to Flask (a 307, or a refreshing page on a preview-set host) | `proxy.ts`                                                                                                                                                                           |
| `apiClient` (`createBearerClient`, `ApiError`, `HOUSE_FALLBACK`), `errorCopy`                                                          | every bearer call and its refusal wording                                     | `lib/apiClient.ts`: `pettyCashFetch`/`pettyCashBlob`/`pettyCashDownload`, `mintyFetch`, `subscriptionFetch`, each with a per-call `onUnauthorized` (`"handoff"` default, `"reject"`) |
| `download` (`saveBlob`, `filenameFromDisposition`)                                                                                     | Export CSV                                                                    | -                                                                                                                                                                                    |
| `portal` (`createProfileApi`, `fetchAllSubscriptions`, `loadViewer`)                                                                   | My Profile, its Subscriptions Overview, the badge                             | `lib/apiClient.ts` (`profileApi`, `loadSubscriptions`), `components/ui/sidebarHost.ts`                                                                                               |
| `scrollLock` (`pushAppScrollLock`)                                                                                                     | the sidebar drawer's scroll lock (`body`)                                     | -                                                                                                                                                                                    |
| `dates` (`formatDay`, `MONTHS`)                                                                                                        | "14 Oct 2026"                                                                 | `lib/dates.ts` keeps `addDays`, the weekday formats, `clockTime`, `momentText`, `savedText`                                                                                          |
| `money`                                                                                                                                | amounts                                                                       | `lib/money.ts` keeps "(No currency selected)" (see _Design_)                                                                                                                         |

What changed in behaviour with the move (owner 2026-10-21, each re-pinned in its test): the house line's wording; a query drops `""` and `null` as well as `undefined`; `{error: ""}` and machine-code refusals show the house line; no token makes no call; `formatDay` shows `""` for anything not a real calendar date (a datetime shows its day); a file name splits on `\` too; the preview-set refresh page escapes `>`; a lone `/` as a URL variable is blank; the Subscriptions Overview read also carries `payer`, `billing` and `transfer_outcomes`, and a page without `entities` is a 502.

## The sidebar

`@minty/shared/sidebar`, with this app's host in `components/ui/sidebarHost.ts`. That file is the only app-specific part.

- **This app's own pages:** Dashboard, Reports (the report history, since Wave 2g) and Settings (Petty Cash settings, since Wave 2h; connecting Xero links on to minty-web's Entity & Integration).
- **minty-web's pages, through Flask's hand-offs:** the entity list and Subscriptions.
- **Through Flask's `/entity/<id>/payment-request`:** Bills.
- **My Profile is the sidebar's sheet, over the page** (the owner, 2026-10-20): the shared panel `@minty/shared/profile` (v0.6) in the redesign's look, wired in `components/ui/AppSidebar.tsx` with this app's Flask calls (`profileApi` in `lib/apiClient.ts`, `@minty/shared/portal`: `GET`/`PATCH /api/me/profile` with `?entity=`), its Subscriptions Overview (`loadSubscriptions`, every page) and a toast of its own. No PASSWORD row. `main` draws the same sheet in the original look. The five `public/profile/` files are asserted against `PROFILE_ASSETS`. minty-web's page (`/handoff/minty-web?next=/profile&entity_id=`) is only the badge's fallback where no sidebar can hold the profile.

## No Flask pages

The user's rule (2026-10-16): Flask's HTML frontend will be deleted and Flask becomes a backend only, so **no screen here sends a person to a Flask page**. Flask (`ACCOUNTS_API_URL`) is reached only through:

- the login-gated hand-offs: `/handoff/petty-cash-web` (this app's token, `lib/handoff.ts`) and `/handoff/minty-web?next=<minty-web path>` (`hubHandoffUrl`, `@minty/shared/handoff`; `settingsSectionUrl` and `lib/hub.ts`'s `integrationUrl`/`subscriptionSettingsUrl` for minty-web's settings);
- the payments app's token hand-off `/entity/<id>/payment-request` (`billsUrl`, `@minty/shared/companyRef`; a redirect, never a page) and `/logout` (`logoutUrl`, `@minty/shared/handoff`; ends the session, then minty-web's sign-in);
- the JSON APIs (`lib/apiClient.ts`). The Xero OAuth callback is Flask's too, but nothing here links it.

`lib/__tests__/noFlaskPages.test.ts` fails when any source file other than those six (`lib/env.ts`, `lib/apiClient.ts`, `lib/handoff.ts`, `lib/hub.ts`, `components/ui/sidebarHost.ts`, `components/settings/SettingsTabs.tsx`) names `ACCOUNTS_API_URL`, when they build a literal Flask address that is not a hand-off, an action or an API, or when they hand the Flask base to anything but a shared hand-off builder or this app's own clients. `lib/flaskPages.ts` is gone (2026-10-16). Where its links went:

| Was (Flask page)                                                                                  | Now                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wizardStepUrl` - a stage not yet ported                                                          | gone: every stage is this app's (`stepHref`; `WizardStep` lives in `lib/wizardPages.ts`)                                                                                                                                            |
| `resumeUrl` - the launch page's Continue and a history draft, for a section this app did not know | `resumeHref`: the section's own stage, Addition to Drawer when the draft names none (or an unknown key)                                                                                                                             |
| `csvUrl` - history's Export CSV                                                                   | `GET /reports/export.csv?start_date=&end_date=` with the bearer (`pettyCashDownload`), saved under the server's `Content-Disposition` name (`@minty/shared/download`; `reports_<start>_to_<end>.csv` when the header can't be read) |
| `settingsUrl` - Setup Required and a deposit correction's missing accounts                        | this app's settings at its Xero cards (`xeroSettingsHref`, `…/settings/petty-cash#xero`); Setup Required's "Choose your company's currency" at Country & currency (`currencySettingsHref`, `#country`)                              |
| `settingsUrl` - a publish answered `reconnect: true` (Daily Report, outcome page, history row)    | **Reconnect Xero in Entity & Integration**: minty-web's `/entity/<shortid>/<name>/settings/integration` through `/handoff/minty-web` (`integrationUrl`)                                                                             |
| `settingsUrl` - the settings page's "not connected" Xero card                                     | **Connect Xero in Entity & Integration**, the same hand-off                                                                                                                                                                         |
| sidebar's My Profile - Flask's `/profile`                                                         | the sidebar's own sheet (`AppSidebar`); `/handoff/minty-web?next=/profile&entity_id=` only where no sidebar can hold it                                                                                                             |

The sidebar's Bills still goes through Flask's `/entity/<id>/payment-request`: it is a token hand-off (Minty `go_to_bills` mints the payments app's token and redirects), not a page.

## Design

- **Tokens:** `@minty/shared/tokens.css`, Part 13. Screens bind only to semantic utilities, and `__tests__/no_raw_colours.test.ts` fails on a hex or a palette colour.
- **Icons:** Material Symbols **Rounded**.
- **Fonts:** Inter through `next/font`. No Jakarta, because the mark is an image.
- **The `@source` line.** `app/__tests__/packagedStyles.test.ts` guards the `@source` line that makes Tailwind scan the package.
- **Amounts** (owner, 2026-10-21: one money rule, `@minty/shared/money`): "HKD 1,234.50" - the ISO code, a **non-breaking space** (U+00A0, the package's `CODE_SPACE`, so a line never splits the code from its amount), two places, grouped; "-HKD 120.00" below zero (the sign leads); never "$" or "HK$". Extra decimals are cut, not rounded; an 11-digit amount keeps every digit. A test that compares an amount exactly writes the space as the escape `\u00a0` in its string (never the raw character); testing-library's `getByText`/`toHaveTextContent` and Playwright's text matchers normalise it to a space, so "HKD 1,234.50" still finds it there.
  - **One display helper:** every amount on a page goes through `lib/money.ts` `money(value, code)` - the shared `formatMoney` with a currency, and, for a company with **no currency, "1,234.50 (No currency selected)"**: never "$" and never a bare number (owner, 2026-10-22: no silent fallback). Only an old report can show it (history, Daily Report, share page, outcome), as no report starts without a currency (_Setup Required_ below; the API refuses the save with 409 `to: "dashboard"`, which the stages turn into the launch page with the sentence, as any `to: "dashboard"` refusal). Typing and reading amounts back stay on the shared `acceptAmountInput`/`parseAmount`; an Amount input with no currency has no prefix.
  - **Denominations** are named by the catalogue's `cash_name` (the cash-count read's `name`, since 2026-10-22): the code, the non-breaking space and the name without its symbol ("$1,000" -> "HKD 1,000", "S$50" -> "HKD 50"); without a name, by their value less a whole note's ".00" ("HKD 1,000", "HKD 0.50"); with no currency, the figure alone.
  - An Amount input refuses a keystroke that is not digits and one point, or goes past 11 whole digits or 2 decimals (the field keeps what it had), and groups + pads on blur; an empty field reads as null, and each call site says it counts as 0. Pinned in `lib/__tests__/money.test.ts`, `lib/__tests__/cashCount.test.ts`, `components/closing/__tests__/AmountInput.test.tsx` and `components/dashboard/__tests__/DepositModals.test.tsx`.

## Tests

| Command            | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`         | Vitest. Covers the proxy, auth, the hand-off, the API client, company addresses, the sidebar host, the launch page's rules, the Daily Closing stage mapping, the Addition to Drawer, Sales, Expenses, Cash Count and Close rules (and the receipt read), Edit expense's changed-fields PATCH and the receipt reader's rules (bands, never overwriting, Clear, the session latch), the expense form as a component (Edit prefilled, saved and refused; the reader's notice, prefill, silence and switching off), the outcome page's facts, the Daily Report's facts and warnings and its charts' rules (`salesMix`: the list's rows, Deliveroo out, largest first, whole % adding up to 100, zeros out, one method, none; `expenseBars`: per account, "No account", largest first then by name, none), the outcome band and the charts as rendered (`components/closing/__tests__/ReportParts.test.tsx`: Cash position the one hero, the chip and decorative art, only the KPIs that arrived, the `role="img"` summaries, the empty states), its detail edits (what may be edited and when, the reason and supplier checks as typed, only the changed fields in the PATCH, the Xero notice, the toasts), the report history's rules (address and filters, the pager, "Showing a–b of n", the date range, Export CSV's request, file name and gate, a row's meta and actions), the settings rules (the country body, the sales-method list on the page, the name checks, the waiting changes and how Save sends them, stopping at a refusal), the Xero cards' rules (the mapping on the page from the read, typing, choosing and leaving a picker, the same-bank, not-in-the-list and empty checks and when each shows, the eight ids sent, a new contact's checks and where it is offered, the first save's toast; the account codes' search, Select all and its mixed state, the at-least-one rule and when the card changed), the Xero publish (how a status settles, a refused start and `reconnect`, the republish warning, the toast, and the poller: its interval, the cap, a retried read, a refusal, a 401, and nothing read after it is stopped), which history rows are watched on arrival, the public share page (the Share dialog's link, the page's address, a read that sends nothing of the reader's, 404 / 410 / anything else, only the figures that arrived), the stage addresses, the money input and the flash, and the three guards (styles, assets, raw colours). |
| `npm run test:e2e` | Playwright on a 1440 px desktop and a 360 px phone, against local Flask (`e2e/README.md`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

`npm run lint` and `npm run typecheck` complete the gate. CI runs everything but e2e (`.github/workflows/ci.yml`, the shared `next-web.yml@v1`).

**Config files on the package's presets (2026-10-22), the same in every Next.js app.** `tsconfig.json` extends `@minty/shared/tsconfig.base.json` and keeps only `paths`, `include` and `exclude`; `eslint.config.mjs` is `@minty/shared/eslint` with nothing added; `package.json`'s `"prettier"` key names `@minty/shared/prettier` (with `format` / `format:check` scripts - `prettier` itself is not yet a devDependency here); `vitest.config.ts` is `mintyVitest(import.meta.url, { exclude: ["public/**"] })`; `playwright.config.ts` is `mintyPlaywright({ port: 3010, desktopName: "desktop", phone: true })` - the same two projects, the phone at the package's `PHONE` (360 x 740); `next.config.ts` is its `env` block wrapped in `withMintyDefaults`, which adds the security headers, `poweredByHeader: false`, `transpilePackages` and `allowedDevOrigins`; and the e2e suite takes `companyRef`, `mintModuleToken` and the sideways-scroll check (as `expectNoHorizontalScroll`) from `@minty/shared/e2e` (`e2e/README.md`). `.editorconfig` is the same file in every app. A shared setting changes in the package and a pin bump, never here.

## Ported so far (`development`)

`development` is a **faithful port** of Flask's Petty Cash pages: the same sections, steps, wording, rules and destinations, drawn with minty-payment-request-web's design (Part 13 tokens, `@minty/shared/ui`, its App bar). The Part 15 redesign (five-stage Daily Closing, Action Dashboard) comes afterwards, on its own branch.

The port order is dashboard, then the report wizard, then history, then settings, then Xero publish. Pages not ported yet are Flask's, linked from `lib/flaskPages.ts` on that branch (on `redesign/part-15` that file is gone - see "No Flask pages"). The person is already signed in to Flask, because this app's token came from Flask's login-gated hand-off.

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

| State       | When                                                                                    | The card                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First use   | nothing submitted and no open report                                                    | 15.11a empty state with Minty, "Your first Daily Closing", **Start today's Daily Closing** - or, when onboarding's start date (`GET /home`'s `start_date`) is before today, **Start the Daily Closing for Mon 28 Sep** on that day. The start date is also the first report's floor in `startProblem` (`draft_date` only for companies onboarded before it existed) |
| In progress | an open report (the newest draft; its day is `draft_date`, as Flask's Continue used it) | its stages, **Continue Daily Closing** to this app's own stage the report is on (every stage since Wave 2e; Addition to Drawer for a section this app does not know - never Flask's resume)                                                                                                                                                                         |
| Done        | `published[server_today]` exists                                                        | all five done, "Today's report is submitted", **View report** to the day's report (this app's Daily Report since Wave 2f, by `published[server_today].id`)                                                                                                                                                                                                          |
| Not started | otherwise                                                                               | five stages ahead, **Start today's Daily Closing**                                                                                                                                                                                                                                                                                                                  |
| Gate        | yesterday has no submitted report although earlier days do                              | the Start is disabled with "Finish Tue 13 Oct first." beside it, and the banner starts that day                                                                                                                                                                                                                                                                     |
| Loading     | until `/home` answers                                                                   | a skeleton card                                                                                                                                                                                                                                                                                                                                                     |

- **Starting goes through the kept rules.** `startProblem` runs first, and its sentence shows inline in the card. Then comes "Before You Start" when the day before banked cash, the Deposit to Bank amount, and `POST /deposit-correction`. Only then does the day's first stage open (this app's Addition to Drawer since Wave 2a).
- **Read-only access** disables Start and Continue with "Read-only access" beside them. Steps are not links for read-only access.
- **Setup Required** holds the page (a non-dismissable modal, so no report can start) while the company has **no currency** (owner, 2026-10-22: no silent fallback) or its Xero settings are incomplete (`setupRequired`, `lib/dashboard.ts`). Each missing setting is a link to its settings card: "Choose your company's currency" first, to Petty Cash Settings at Country & currency (`currencySettingsHref`, `#country`), then each missing Xero setting to the Xero cards (`#xero`); **Set Up Settings** opens the first.

**The five stages** (`lib/dailyClosing.ts`, Part 15.15b and D15-05) are laid over Flask's six report sections:

| Flask section | Stage (Step label)                                                |
| ------------- | ----------------------------------------------------------------- |
| `opening`     | Addition to Drawer (Drawer)                                       |
| `sales`       | Sales                                                             |
| `expenses`    | Expenses                                                          |
| `deposit`     | Cash Count (Bank Deposit is folded into it)                       |
| `cash_count`  | Cash Count. The stage is done only once **this** section is done. |
| `ending`      | Close                                                             |

- **"Next"** is the stage Continue lands on: `current_section`'s stage, or Addition to Drawer when it is empty. So it can be a stage already done, when the person went back to it.
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
   - "Cash added to the drawer" (optional, helper "Optional. Leave it empty when no cash was added."): an Amount input with the currency as its prefix and in its accessible name, right-aligned, `inputMode="decimal"`, a stray keystroke refused and grouped + padded on blur (`@minty/shared/money`, see _Design_);
   - "Where the cash came from": Company bank / Personal, radio rows 44 tall, stacked on a phone.
3. **The stage summary**: "Opening cash HKD 2,450.50" (starting cash plus the cash added), live as the amount is typed, plain text, never coloured.
4. **The actions** (15.2, not sticky): **Save & Next** (Primary) and Save & Exit (Ghost) - Primary first and full width on a phone, `[Save & Exit] [Save & Next]` at the right from 640. Enter in the amount is Save & Next.

The rules (`lib/addition.ts`, `lib/dailyClosing.ts`):

- **The stages.** The current stage is this one, done or not; the others are done when their section is (`stagesOnPage`). Done stages are links, to where they were left (`stageSection`; Cash Count at the deposit unless the report is in `cash_count`), through `lib/wizardPages.ts` - Flask's wizard for every stage but this one. Stages not done are not links: Save & Next is the way forward (15.9d).
- **Save & Next** sends `{transaction_date, cash_addition, withdrawal, action: "next"}` and opens the Sales stage, in this app since Wave 2b (a client-side move). **Save & Exit** sends `action: "exit"` and goes to the launch page.
- **A refused day** (409 `to: "dashboard"`, a date rule) goes to the launch page, which shows the sentence as a warning **Page banner** under its h1, read once (`lib/flash.ts`, Flask's flash; never a toast). Any other refusal (409 `to: "opening"`, 422, no answer) is a Danger inline alert above the actions, and the actions come back.
- **Cash below zero** is a business-rule gate (15.9e: rule, reason, one action), never a modal:
  - the last closing ended below zero: the form gives way to a warning Page banner, "Your last closing ended below zero", with why and **Go to Petty Cash** (Flask held the page the same way);
  - the opening cash would be below zero: "Opening cash is below zero. Add at least HKD 120.50 to the drawer to continue." beside the summary, live; a save is not sent and the amount takes focus.
- **Unsaved changes** hold the stage links and the back link: a warning inline alert under the stages says so, with **Leave without saving**. Putting the change back clears it. A reload or a typed address is not held.
- **The launch page** now opens this stage: Start (after Before You Start and the correction), the Drawer stage link, and Continue when the open report is on `opening` (or names no section). Continue on any other stage was still Flask's resume then (every stage is in the app since Wave 2e; Flask's resume is never used since 2026-10-16).

Against Flask's Opening, deliberately: the "Fix Negative Balance" modal became the gate above (15.10: "Fix Negative Balance -> section issue + gate"); the illustration is gone (15.D: no characters in active input); "Withdrawal from" is "Where the cash came from"; a negative amount reads "-HKD 120.00", not "(HKD 120.00)".

Known gaps of Wave 2a:

- **No autosave and no "Saved 6:02 pm"** (15.9f): the API saves only on Save & Next / Save & Exit and `GET /reports/opening` carries no saved time.
- **Stages not done cannot be opened from here**, even the one the report was left on: when someone goes back to this stage, Save & Next walks them forward through Flask's pages.
- ~~Close is still Flask's page~~ - every stage is this app's since Wave 2e (Sales in 2b, Expenses in 2c, Cash Count in 2d, Close in 2e).

### Wave 2b: the second Daily Closing stage, "Sales" (Part 15.9 / 15.15)

`/entity/<shortid>/<name>/petty-cash/reports/new/sale?transaction_date=` replaces Flask's Sales page on this branch, at Flask's own address. It reads and saves through the existing `GET`/`PUT /reports/sales` (Minty `petty_cash_api/routes/sales.py`), unchanged.

**One stage frame.** What both stages share moved out of `AdditionToDrawer.tsx` into `components/closing/Stage.tsx`: the frame and the read (`StagePage`: App bar, the 720 column, loading skeleton, a failed read as a Danger inline alert), the Workflow header, the stages (`stageSteps`), the unsaved-changes hold (`useLeaveHold`), the Amount input, Save & Next / Save & Exit (`StageActions`), where a refusal goes (`refused`) and where a section opens (`openStep`: a client-side move - every section is this app's). Addition to Drawer draws only its own form now; its behaviour is unchanged.

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
- **The launch page's Continue** opens this stage when the report is on `sales` (and Expenses on `expenses`, Wave 2c); every later section still used Flask's resume then (none does since Wave 2e). Addition to Drawer's Save & Next opens it in-app.

Known gaps of Wave 2b:

- **No autosave and no "Saved 6:02 pm"** (15.9f), as Wave 2a: the API saves only on Save & Next / Save & Exit and carries no saved time.
- **The no-draft sentence is the API's** ("...let's start with the opening entry."), which still names Flask's old stage.

### Wave 2c: the third Daily Closing stage, "Expenses" (Part 15.9 / 15.15c)

`/entity/<shortid>/<name>/petty-cash/reports/new/expense?transaction_date=` replaces Flask's Expenses page on this branch, at Flask's own address. It reads, adds, edits, deletes and moves on through the Petty Cash API's Expenses routes (Minty `petty_cash_api/routes/expenses.py`): `GET /reports/expenses`, `POST /reports/expenses/lines` (multipart, one receipt), `PATCH` and `DELETE /expense-lines/<id>`, `GET /expense-lines/<id>/receipts/<receipt id>`, `PUT /reports/expenses` and `POST /suppliers`; and the receipt reader, `POST /reports/expenses/extract` (2026-10-19, see below).

The page, top to bottom (`components/closing/Expenses.tsx`, in Stage.tsx's frame; rules in `lib/expenses.ts`):

1. **The Workflow header**, as Waves 2a/2b: Expenses is current; Drawer and Sales are done links to this app's stages. "Add each expense paid from the cash drawer, with its receipt."
2. **The entries** (15.15c), one card: "2 expenses" (h2), **Add expense** (Secondary - Save & Next stays the one Primary), then a Part 14 Record row per entry, stacked:
   - the account's name and the amount (plain text, never coloured; it wraps under the name before it is ever clipped);
   - "ParknShop · Account 429", and the description when there is one;
   - the receipt as a small File card (an icon by type, the name truncated, "View") that opens it full screen;
   - **Edit** and **Delete** (Ghost, 44 tall), named "Edit expense: General Expenses, HKD 120.50" / "Delete expense: …" for screen readers.
   - Nothing yet: "No expenses added yet." / "Add an expense when you're ready. A day with no expenses can go straight on with Save & Next." (Part 11 §11.16), with Add expense. No character: 15.D keeps Minty out of active input.
3. **The stage summary**: "Total expenses", the API's own total after every add, edit and delete, a polite live region.
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

**Edit** (2026-10-19; Flask's `pc_expenses.js` edit mode, the API's `PATCH /expense-lines/<id>`) opens the **same form** (`ExpenseForm` given the `line`; rules in `lib/expenseEdit.ts`), titled "Edit expense" with "General Expenses · HKD 120.50", prefilled - the amount (grouped), the supplier, the account (the line's own stays choosable if it is no longer switched on) and the description - with the saved receipt(s) as File cards above the capture ("Replace the receipt", "Optional. A new receipt replaces the saved one.") and **Save**:

- **Save sends only what changed** (multipart: `amount`, `remarks` - emptied clears it - `supplier_id`, `account_id`, one `receipt`, `remove_receipt_ids`); nothing changed just closes. The answer's `{line, total}` replaces the row and the total in place, "Expense saved. Total expenses …" is announced, and the focus goes back to that row's Edit.
- **A new receipt replaces all the saved ones** ("Saved receipt, replaced when you save"). A saved receipt shows **Remove** only while another would stay and no new one is picked, so the API's "not the last receipt" rule is never met head-on (its 422 is still shown if it comes).
- The same as-you-type checks, error summary and focus rules as Add; a line saved without a supplier or an account (old data) may stay without one, as the API allows.
- **Refusals** show the API's sentence at the top of the sheet, which stays open with the changes: 409 "This report isn't a draft anymore, so I can't change its expenses.", 404, 403, the 422s; no connection: "We couldn't save this expense. Check your connection, then try again." Closing with changes asks first: "These changes aren't saved yet" / **Discard them**.

**The receipt reader** (2026-10-19; Part 15.14 AI-assisted, Part 14 AI field; Flask's `static/js/expense_ai.js`, ported; `components/closing/ReceiptReader.tsx`, rules in `lib/expenseAi.ts`). Picking a receipt - in Add, and in Edit when a new one is picked, as Flask - sends a reading copy (a photo resized in the browser to 2000 px on its long edge, as Flask; Add still uploads the original) to `POST /reports/expenses/extract`, which writes nothing:

- **While it reads:** an Info inline alert under the receipt, "Minty is reading the receipt…" / "This can take a few seconds. You can start typing now if you prefer." (Flask's words; no character in an active form, 13.11). The form stays fully usable and **Add is never blocked**: an answer that arrives after Add, after Remove, after another receipt or after the sheet closed is dropped.
- **Suggestions fill EMPTY fields only** (Flask's never-overwrite rule) and only when the API says `applied` - the server's bands: **high** fills, with the source line "Suggested from the receipt." under the field (in its `aria-describedby`, with an icon; no AI colour, no "AI"); **medium** fills, "Suggested from the receipt. Check it before you go on."; **low** never fills. Each filled field has **Clear** (the value goes with its marking); changing the field makes it the person's (the marking goes). Another receipt, or Remove, takes the old suggestions' values with them; what the person typed stays. The supplier is chosen only by an id from the company's list, the account only from the accounts switched on. One polite announcement says what was filled (plus a note when the receipt's date is more than a week from the day, as Flask - spoken, never shown, never blocking).
- **A different reading is only offered:** where a field already holds something else (or a low-band reading meets an empty amount, supplier or account), a quiet note says so - "The receipt reads HKD 448.80, not HKD 44.80." ("might read" for the low band) - with **Use the amount from the receipt**; nothing moves without the press.
- **An unknown supplier name** read off the receipt is offered, never created: 'The receipt says "Kwok Transport", which is not in your supplier list.' with **Add "Kwok Transport" as a new supplier**, which opens the New supplier panel prefilled; only Add supplier creates it (and the offer is made only to someone who may add suppliers).
- **Every failure is silent** (15.14 "failed: enter manually"; Flask's "unavailable means invisible"): a refusal, no connection, a timeout or any `reason` - nothing is shown and the form is as it is without the reader. The app can't know in advance whether the reader is switched on (`EXPENSE_AI_ENABLED` is the API's, off by default): a `disabled` (or `not_configured`) answer switches it off for the rest of the browser tab's session (`sessionStorage`, with an in-memory fallback), so it is not asked again.
- **The currency is not compared**, as Flask does not: the API returns `currency` and `entity_currency`, and neither Flask's page nor this one acts on them.

**Delete** is a Part 14 Confirmation modal, Destructive (a bottom sheet on a phone): "Delete this expense?", "**General Expenses, HKD 120.50 from ParknShop, and its receipt will be deleted.** This can't be undone.", Cancel focused first, **Delete expense** in Danger. A refusal (403, 404, 409) shows its sentence inside the modal and keeps the entry. After a delete, the total is the API's and the focus goes to Add expense.

**Receipts open full screen, never in a new tab** (`components/closing/ReceiptViewer.tsx`, loaded on first open): the bytes are read with the bearer (`pettyCashBlob`, new in `lib/apiClient.ts`) or taken from the picked file, and drawn from an object URL the viewer owns and revokes - an image in `<img>`, a PDF in the browser's own viewer in an `<iframe>` (pdf.js is not a dependency here). A failed read says why in place. Its Escape is caught on `window` in the capture phase, so over the sheet one Escape closes only the viewer. It is the app's one viewer.

The rules:

- **Save & Next** sends `{transaction_date, action: "next"}` and goes on to Cash Count, which opens at Bank Deposit (`openStep(..., "deposit")`) - Flask's page in Wave 2c, this app's own Cash Count stage since Wave 2d (a client-side move). **Save & Exit** sends `action: "exit"` (Flask records nothing) and goes to the launch page.
- **No draft for the day.** Unlike Sales, Expenses' read itself is refused (409 `to: "opening"`), so the stage never shows: the person lands on Addition to Drawer, with the sentence as a warning Page banner, read once.
- **Every add, edit and delete is saved at once**, so the stage has no unsaved-changes hold of its own; the sheet asks before it discards.
- **A report that is no longer a draft** shows its entries without Add expense, Edit or Delete (Flask hid them).
- **Sales' Save & Next** and **the launch page's Continue** (a report on `expenses`) open this stage in-app; the Expenses Step links on the other stages and the launch page do too.

Wave 2a/2b files touched for this wave:

- `components/closing/Stage.tsx`: `StagePage` takes `here` and routes a read refused with `{error, to}` through `refused` (Expenses' read is the first that answers 409 `to: "opening"`); `AmountInput` takes `id`, `required`, `error` and `onBlur`.
- `lib/wizardPages.ts`: `expenses` is a ported step (`reports/new/expense`).
- `lib/apiClient.ts`: `form` (a multipart body) and `pettyCashBlob`.
- `e2e/04_sales.spec.ts`: Save & Next now lands on this app's Expenses (stubbed); `lib/__tests__/currencyInput.test.ts`: the step addresses.
- `components/dashboard/Dashboard.tsx`: a comment only (Continue already follows `isPorted`).

Against Flask's Expenses, deliberately: Flask's "View Expense Details" modal is gone - the row shows every detail, and its receipt opens full screen; the supplier list is A to Z with the add option last and the duplicate check (Flask offered "Add" for a case-different name); "Account Code" is "Account" with the code beside the name; the delete confirmation names what goes; the total is the API's, not added up in the browser; amounts are never red (Flask drew them red).

Known gaps of Wave 2c:

- **The reader's suggestions are not accepted one by one** (15.14 asks for an explicit Accept; Flask fills and marks, and Add is the confirmation) - ported as Flask has it. Acceptance is not logged for audit (Part 14 AI field's development note): the API has nowhere to record it.
- **A foreign-currency receipt is not flagged:** the reader's `currency` against `entity_currency` is ignored, as in Flask, so a USD total can be suggested into an HKD expense.
- **The reader's date note is spoken only** (Flask's choice); nothing on screen says a receipt is dated far from the day.
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
   - **Bank deposit**: "Cash on hand" as a Description row (opening cash and cash sales, less expenses - the API's figure), then **Cash taken for bank deposit** (optional), the Stage Amount input with the limit in its helper: "Optional. Up to HKD 1,300.50, the cash on hand."
   - **Cash in the drawer**: Flask's calculator, kept (15.15) and now on the page instead of in a modal - the company's notes, then its coins, each a `fieldset`; one row per denomination: its name - the code and the catalogue's `cash_name` without its symbol ("HKD 1,000" from "$1,000"; the API sends it as `name`), or its value when it has none ("HKD 1,000", "HKD 0.50"), see _Design_ - the count (`inputMode="numeric"`, digits only, labelled "Number of HKD 1,000 notes"), and the row's amount. The amount wraps under the row before it is ever clipped. Then "Drawer total", a polite live region.
   - **Cash in the safebox** (optional): an Amount input. It counts with the drawer, as Flask's formula does.
3. **Check** (the stage summary, 15.15d): **Expected in drawer** (cash on hand less the deposit as typed), **Counted** (drawer + safebox), **Difference** in words - "HKD 20.00 short", "HKD 0.01 over", "None" - each a polite live region, plain text, never coloured. A difference adds a Warning inline alert, "The count is HKD 20.00 short", and **Reason for the difference** (a Textarea; required while there is a difference, with the red `*`, sr-only "(required)" and `aria-required`; helper "So the reviewer knows what happened. 18 of 300 characters.").
4. **The actions**, as Waves 2a-2c. Enter in a count or an amount is Save & Next.

The rules (the owner's, 2026-10-15; the API refuses the same):

- **Expected = cash on hand - deposit; difference = (drawer + safebox) - expected**, to the cent, added up in cents (3 x HKD 0.10 is exactly HKD 0.30). **Any cent is a difference** (Flask ignored 0.01).
- **The deposit can't be more than the cash on hand**, said as it is typed and naming the amount allowed (the API's sentence): "The deposit can't be more than the cash on hand. Enter HKD 1,300.50 or less."
- **A count above a million** is said as typed ("The count is 1,000,001. Enter 1,000,000 or fewer.").
- **The reason**: over 300 characters is said at once; missing while there is a difference only after a refused **Save & Next** ("The count is HKD 20.00 short. Add the reason to continue."). **Save & Exit keeps a difference without one.** The reason is sent only while there is a difference (`""` otherwise), so a note never outlives the difference it explained.
- **A refused Save & Next** with one problem moves the focus to that field; with two or more the shared error summary takes the focus and links to each. Nothing is sent.
- **Save & Next** sends `{transaction_date, bank_deposit, counts: {<id>: n}, safe_box_balance, discrepancy_reason, action: "next"}` - **`bank_deposit` every time**, every denomination (an empty field as 0) - and goes on to Close (`openStep(..., "ending")`) - Flask's Ending page in Wave 2d, this app's own Close stage since Wave 2e (a client-side move). **Save & Exit** sends `action: "exit"` and goes to the launch page.
- **The API's 422** names its field (`bank_deposit`, `discrepancy_reason`, `safe_box_balance` or a denomination id): its sentence shows on that field, which takes the focus, until the field changes. A 409 without a place (`{error}`) is a Danger inline alert above the actions; no draft (409 `to: "opening"`, the read's or a save's) goes to Addition to Drawer with the sentence, read once.
- **Cash on hand below zero** is a business-rule gate (15.9e; Flask's "Fix Negative Balance" modal): the form gives way to a warning Page banner, "The cash on hand is below zero", with the sums ("Opening cash HKD 600.00 plus cash sales HKD 0.00, less expenses HKD 620.00, comes to -HKD 20.00, and cash can't be counted against less than zero. Check the expenses and the cash sales, then come back to Cash Count.") and one action, **Go to Expenses**. With the deposit limited to the cash on hand, the expected cash can only go below zero this way.
- **Unsaved changes** (by value: the deposit, any count, the safebox, the reason) hold the stage links and the back link, as Waves 2a/2b.

Addresses: `deposit` and `cash_count` are both ported steps (`lib/wizardPages.ts`'s `PORTED`, each to `reports/new/cash-count`), so the launch page's stage link, its **Continue** on a report in `deposit` or `cash_count`, and Expenses' Save & Next all open this stage in-app. Flask's own Bank Deposit address on this app, `.../reports/new/deposit?transaction_date=`, **redirects** here with the same day (`reports/new/deposit/page.tsx`, a server `redirect`) - both, so a link written either way lands.

Wave 2a-2c files touched for this wave:

- `lib/wizardPages.ts`: `deposit` and `cash_count` ported (to `reports/new/cash-count`).
- `components/closing/Expenses.tsx`, `components/closing/Stage.tsx`, `components/dashboard/Dashboard.tsx`: comments only (Save & Next and Continue already follow `isPorted`).
- `lib/__tests__/currencyInput.test.ts`: the step addresses.
- `e2e/02_dashboard.spec.ts`: Continue on a `deposit` report opens this app's Cash Count (stubbed), and a new test keeps Flask's resume for a report on Close; `e2e/05_expenses.spec.ts`: Save & Next lands on this app's Cash Count (stubbed); `e2e/04_sales.spec.ts`: a comment.

Against Flask's pages, deliberately: one stage instead of two (D15-05); the calculator is on the page, not in a modal behind a button, and the read-only "Cash Box Balance" it filled is gone (the drawer total is live); Flask's denomination label drew a 0.50 coin as "$0" (`| int`) - it reads "HKD 0.50" here; "Cash Shortage"/"Cash Surplus" in red or green became the difference in words in a Warning alert; the cash-register and safebox pictures are gone (15.D); the "Fix Negative Balance" modal with four ways back became the gate with one; "Expected Cash Count Balance" is "Expected in drawer".

Known gaps of Wave 2d:

- **No autosave and no "Saved 6:02 pm"** (15.9f), as Waves 2a-2c.
- **The gate's one action is Expenses.** A negative cash on hand can also come from a missing cash sale or a low opening; Flask offered all four stages. 15.9e asks for one action, and the stage just before is the likeliest.
- **A difference shows on arrival.** Before anything is counted, Counted is HKD 0.00 and the Check says the whole expected cash is short (with the Warning alert); nothing is red, and the reason is asked for only by Save & Next.
- **No denominations** (a company whose country has none set up): an Info inline alert says so in place of the calculator; a save is refused by the API's 409 ("...check the entity's country settings"), shown inline.
- **The no-draft sentence is the API's** ("...let's start with the opening entry."), as Wave 2b.

### Wave 2e: the fifth Daily Closing stage, "Close", and the outcome page (Part 15.9g / 15.15e / 15.12e)

`/entity/<shortid>/<name>/petty-cash/reports/new/ending?transaction_date=` replaces Flask's Ending page on this branch, at Flask's own address, and `/entity/<shortid>/<name>/petty-cash/reports/<report id>/submitted` replaces Flask's "Report submitted" page, at Flask's address shape. They read and submit through the Petty Cash API's Close routes (Minty `petty_cash_api/routes/close.py`), unchanged: `GET /reports/close`, `POST /reports/submit` and `GET /reports/<report id>/outcome`. The submit is Flask's own (`report/services/submit.py`, shared with the Jinja Close page).

**Close** (`components/closing/Close.tsx`, in Stage.tsx's frame; rules in `lib/close.ts`) is a Work Verification (15.9g): read-only, nothing typed, so no unsaved-changes hold. Top to bottom:

1. **The Workflow header**, as Waves 2a-2d: Close is current; the four stages before it are done links. "Check the day, then submit the Daily Report."
2. **The business-rule gate** (15.9e), only when the read's `problem` says the day can't be submitted now: a warning Page banner with the rule, the reason and one action, the stage that fixes it ("This day can't be submitted yet" / "Finish Sales before you submit the day." / **Go to Sales**; a date rule is **Go to Petty Cash**). A drawer below zero says it in figures, as Flask's Close did: "The drawer is below zero" / "Expected in drawer comes to -HKD 20.00. Lower the deposit or check the earlier stages before you submit." / **Go to Cash Count**.
3. **The summary**, one card, a section per stage, each a Section header (h2) with an **Edit** link (named "Edit Sales" and so on, 44 tall) back to that stage in the app:
   - **Addition to Drawer**: "Starting cash balance", "Added to the drawer".
   - **Sales**: one row per method the Sales stage shows (Settings order, catalogue names, Deliveroo left out), "Cash", **Total sales**.
   - **Expenses (n)**: "General Expenses · ParknShop" per entry, "Receipts 1 of 2 expenses" (entries that carry a receipt), **Total expenses**; "No expenses added for the day." when there are none.
   - **Cash Count**: "Cash taken for bank deposit", "Expected in drawer", "Counted in the drawer", "In the safe box", **Difference** in words ("HKD 20.00 short", "HKD 0.01 over", "None"). A difference adds a Warning inline alert in this section (15.10b): "The count is HKD 20.00 short" with "Reason: …" (or "No reason was given yet.").
4. **Closing balance**, the stage summary on a sunk surface, the API's figure.
5. **The actions** (15.2, not sticky): **Submit Daily Report** (Primary, busy "Submitting…") first and full width on a phone, Save & Exit (Ghost, a link home: every stage saved itself) under it; `[Save & Exit] [Submit Daily Report]` at the right from 640. While the gate stands, Submit is disabled with its reason under it ("Fix Sales first, then submit.", `aria-describedby`).

Every figure is the API's; nothing is added up in the browser. No KPIs or trends (D15-03): the read's `yesterday_total` and `history` are the Daily Report's. Amounts are plain text, never coloured. **Any cent is a difference** (the owner, 2026-10-15): `differenceOf` rounds on the size, so -0.005 is a cent short, never "None".

The rules:

- **Submit** sends `{transaction_date}` once - a ref guards it, so two clicks in the same tick send one request - and the button stays busy until the outcome page opens (a client-side move).
- **A refused submit** (409 `{error, to}`; nothing was written) is a Danger inline alert above the actions with the API's sentence and one link to where it is fixed ("The figures changed after the cash count. Check the cash count again, then submit." / **Go to Cash Count**); Submit comes back. A 409 `to: "submitted"` (someone submitted the day meanwhile) opens that report's outcome instead. A 422, 403 or no answer is the sentence alone ("We couldn't submit the day. Check your connection, then try again.").
- **No draft** (the read's 409 `to: "opening"`): Addition to Drawer, with the sentence as a warning Page banner, read once, as every stage.
- **A day already submitted** (the read's 409 `to: "submitted"` with `report_id`): its outcome page.
- These two, and the outcome after a submit, go **in place of** the Close page (`router.replace`), so Back from the outcome does not bounce through a day that is no longer open.

**The outcome page** (`components/closing/ReportOutcome.tsx`, rules in `lib/outcome.ts`; redrawn as the Completion state in "Daily Closing Phase 1" below): a Part 14 Outcome state (Kind = Completion), a centred 440 column. Minty (decorative), the outcome sentence as the h1 - "Today's report is submitted" when the report is the server's today, else "The report is submitted" - which takes the focus (15.12); "Tue 13 Oct 2026 · E2E Petty Cash Shop"; three facts from the server: **Cash counted** (drawer + safebox), **Difference** ("HKD 20.00 short · note added", "HKD 0.01 over", "None"), **Sent to Xero** ("Yes · 6:12 pm" on the device's clock, "Pending", "Not yet: it failed", "Not yet"). While Xero is working on it, an Info inline alert says so (15.12 partial success). Then **View report** (Primary, full width) and, centred under it, **Back to home** and **Start the next day**. A report that is not submitted (a reopened draft) says "This report isn't submitted yet" with **Go to Close**. An id the API doesn't know (another company's, or none) shows the API's sentence and Back to home.

- **View report** opens the report's Daily Report, this app's own since Wave 2f (`reportHref`; it was Flask's report summary for the day).
- ~~**Start the next day**~~ (removed in Daily Closing Phase 1, as Flask's: the launch page offers the next day itself) went to the **launch page**, which starts `next_day` itself (`requestStart` / `takeStartRequest`, Flask's `autoStartNextDay`): the same rules as its Start button - the date rules, **Before You Start** when the submitted day banked cash, the deposit correction - then Addition to Drawer. It starts only when that day is the one the launch page would start (today with nothing open, or the gate's day), not for read-only access and not under Setup Required; otherwise the page just opens. It is offered only for an earlier day's report: today's next day is tomorrow, which no rule lets start.

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

- Publish to Xero and polling while Xero publishes: in the app since Wave 2j.
- **Minty is the 2D cat** (`/cat-hole.png`), not the 3D happy pose 15.12e asks for, as everywhere.
- **The no-draft sentence is the API's** ("...let's start with the opening entry."), as Waves 2b-2d.
- **The gate's sentence is the API's** for every rule but the drawer below zero, and the API's below-zero sentence ("Hmm, it looks like your cash balance is negative...") is what a refused submit shows if the figures change between the read and the submit.

### Wave 2f: the Daily Report (Part 15.7 / 15.15f)

`/entity/<shortid>/<name>/petty-cash/reports/<report id>/summary` replaces Flask's report summary on this branch, at Flask's id address for it. It reads and acts through the Petty Cash API's report routes (Minty `petty_cash_api/routes/report.py`), unchanged: `GET /reports/<id>`, `POST /reports/<id>/reopen`, `DELETE /reports/<id>` and `POST /reports/<id>/share-link`; receipts through Expenses' `GET /expense-lines/<id>/receipts/<receipt id>`. Its order is Flask's redesigned Jinja page's (`report/ending.html`).

The page, top to bottom (`components/closing/DailyReport.tsx`, rules in `lib/report.ts`, a centred 720 column - 15.D: reports are read, not compared):

1. **The Report header** (15.1 Report): "‹ Petty Cash" back to the launch page; "Daily Report" (the h1) with the API's Status pill (`status_label` / `status_tone`: Submitted and Publishing to Xero are Info, Published to Xero Success, Publish failed Danger, Draft Neutral; a tone outside Part 13's five is logged as an error and drawn Neutral); the day; then the actions, each only while `permissions.*` says so (15.1: hidden, not disabled): **Share** (Secondary), **Publish to Xero** (Primary, while the report is not in Xero) and **More** (Part 14 Menu: "Publish to Xero again" once it is in Xero, **Edit report**, then **Delete report** last in Danger - D15-14). `[Share] [Publish to Xero] [More]` at the right from 768; on a phone the Primary is first and full width, Share and More share the row under it, and More opens as a bottom sheet.
2. **The outcome band** (`OutcomeBand`, `components/closing/ReportParts.tsx`): 15.7's three KPIs as one band on the brand/50 tint (`bg-state-selected`) with the Petty Cash module chip (`module-pettycash-wash` / `-ink`, `point_of_sale`). **Cash position** ("Counted, with the safe box") is the one hero amount in `text-display-xl`; Total sales and Total expenses ("2 expenses") are secondary figures in `text-title-l`. Amounts are primary text, never coloured, and wrap before they are ever clipped. It is one `<dl>`, so each value is read with its label. Spot art: the safe box (`public/safebox.webp`, Flask's `static/img/safebox.webp`), 96 px, `alt=""`, hidden below 640; no character (the report is a record). Phone: one column, the hero alone, the figures stacked. From 640: the figures two-up under the hero, the art at the right. From 1024: hero | figures (stacked, a divider before them) | art, in one row.
   **Against 15.7, deliberately:** "KPI summary (exactly 3)" in equal cards became one hero and two secondary figures - the owner's brief of 2026-10-19 (Minty `docs/features/visual-anchors-review.md` §1: equal tiles had no first point). Flask's `report/ending.html` has the same band.
3. **The difference as a fact** (15.7; any cent counts), unchanged, directly under the band: a Warning inline alert, "Cash was HKD 20.00 short" / "Note: Change given twice" (or "No reason was given.").
4. **"Where the money came from and went"** (`MoneyFlow`; 15.7 "Charts (if kept) use brand + neutral only"; rules in `lib/report.ts`, the same as Flask's `report_page.py` `sales_mix` / `expense_bars`), plain HTML/CSS, no chart library:
   - **Sales by method**: one stacked proportion bar and its legend (swatch, name, amount, whole %). `salesMix` takes **exactly** the rows the Sales by method list shows (`salesRows`: the Sales stage's methods, Deliveroo left out, then Cash), so bar and list agree; a row with nothing sold is left out; largest first (equal amounts keep the list's order); whole percentages by largest remainder, adding up to exactly 100; widths are the exact shares. A single method is one full bar; none: "No sales this day."
   - **Expenses by account**: bar rows (name, amount, a bar whose width is its share of the largest). `expenseBars` sums the lines per account name, "No account" for a line without one, zero totals left out, largest first, then by name; none: "No expenses this day." This is the one figure the browser adds up, and only as a display grouping of the line amounts the API sends (`lib/report.ts`'s note says so); every total is still the API's.
   - Colours: six chart tones, brand ramp + one neutral, cycled so neighbours differ, as `[data-chart-tone]` rules in `app/globals.css` (Flask's `.pc-flow [data-tone]`). The bar rows use `brand-primary` on a `surface-sunk` track. No red/green meaning.
   - Accessibility: each chart is `role="img"` with its figures as text ("Sales by method: Cash HKD 820.50, 76%; Octopus HKD 200.00, 19%; Foodpanda HKD 50.00, 5%"; "Expenses by account: General Expenses HKD 120.50; No account HKD 120.00"); the disclosures below are the table alternative (15.7).
5. **The breakdowns**, collapsed native disclosures: **Sales by method** (the Sales stage's methods in Settings order, Deliveroo left out, Cash, Total sales), **Expenses (n)** (Record rows: the account, the amount, "ParknShop · Account 429", the description; Total expenses), **Receipts (n)** (a File card per receipt, "General Expenses · HKD 120.50", opening it **full screen** in the app's one viewer, `ReceiptViewer.tsx` - never a new tab), **Cash** (starting cash, added, where it came from, cash sales, expenses, deposit, expected, counted, safe box, the difference in words).
6. **Closing balance**, the server's figure on a sunk surface.
7. **The audit facts** (Part 14 Audit meta, on the device's clock): "Submitted by Olive Tan · Tue 13 Oct 2026, 6:12 pm", then "Sent to Xero · Tue 13 Oct 2026, 6:15 pm", "Publishing to Xero", "Xero publish failed" or "Not in Xero yet".

Every figure is the API's; nothing is added up in the browser except the expenses-by-account chart's display grouping (above). Amounts are plain text, never coloured.

The actions:

- **Edit report** asks first, as Flask's page does (a Part 14 Confirmation modal, Cancel focused): "Edit this report?" / "It goes back to a draft so every stage can be changed, then you submit it again." A report that has been to Xero (`was_published`) adds a Warning: "It is already in Xero" / "Publishing it again adds new entries in Xero. The ones there now are not removed: void them in Xero by hand." **Edit report** sends `POST reopen` once (a ref guards it) and opens the first stage, Addition to Drawer, for the day (`openStep`, a client-side move).
- **Delete report** is a Destructive Confirmation modal: "Delete this report?" / "**The Daily Report for Tue 13 Oct 2026 is deleted with its expenses and receipts.** This can't be undone.", Cancel focused, **Delete report** in Danger. **The owner's rule (2026-10-15):** a report that has been to Xero MAY be deleted, but the modal warns first: "It is in Xero" / "Deleting it here does not remove its entries in Xero, and publishing this day again adds a second copy. To change the report, use Edit report instead." After `DELETE`, the launch page opens **in place of** the report (`router.replace`) and says "The Daily Report for Tue 13 Oct 2026 is deleted." as a Success Page banner, read once (`lib/flash.ts`).
- **Share** (Flask's "Share this report"): a modal - "Anyone with the link can read the Daily Report for Tue 13 Oct 2026, without signing in, until it expires." - makes the link with `POST share-link` and shows it read-only; **Copy link** copies it, closes the modal and confirms with a **toast**, "The link to the Daily Report for Tue 13 Oct 2026 is copied." (`components/ui/Toast.tsx`, minty-payment-request-web's Part 14 look: one raised card, "Success", bottom-left on a computer and bottom-centre on a phone, 5 s, paused on hover or focus - the branch's first toast). A copy the browser refuses says so (Warning) and leaves the link to copy by hand.
- **Publish to Xero** (while `permissions.publish` is true) publishes in the app since Wave 2j. Until then it linked to Flask's outcome page (`publishUrl`, now gone).

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

- **Download PDF** (15.7's header names it) and **revoking a share link** (15.7: "read-only and revocable").
- **"Edited after submission"** (15.7's Info banner "Edited by … · see history"): the read carries no edit history.

Known gaps of Wave 2f:

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
   - the meta line, "Expenses HKD 240.50 · Submitted by Olive", or "Daily Closing in progress" for a draft;
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
- **A draft** opens its Daily Closing where it was left, as the launch page's Continue does: the row's `current_section` (opening .. ending) through the app's section-to-stage mapping (`stepHref`; `deposit` and `cash_count` are both Cash Count), or Addition to Drawer when it names none. It is a plain link, so a new tab lands there too. A section this app does not know opens Addition to Drawer (`resumeHref`), as on the launch page.

The row actions (Part 14 Menu, `components/ui/MoreMenu.tsx`), each only where the API allows (15.1: hidden, not disabled):

- **Publish to Xero**, or "Publish to Xero again" once the pill says Published to Xero: with `can_publish`, never on a draft. In the app since Wave 2j.
- **Edit report** (`permissions.edit`: the latest report only, never a draft): the Daily Report's Confirmation modal (with "It is already in Xero" when it has been there). It reopens the report, then opens Addition to Drawer for the day.
- **Delete report** (`permissions.delete`), last, in Danger: the Daily Report's Destructive modal, with the owner's "It is in Xero" warning when `was_published`.
  - On success the list is read again in place, a **toast** says "The Daily Report for Tue 13 Oct 2026 is deleted.", and the focus goes to the h1.
  - A refusal shows the API's sentence inside the dialog, which stays open.

**Export CSV** reads the API's `GET /reports/export.csv?start_date=&end_date=` with the bearer (`pettyCashDownload`) and saves the file under the server's `Content-Disposition` name through a temporary `<a download>` (`saveBlob` and `filenameFromDisposition`, `@minty/shared/download`; `reports_<start>_to_<end>.csv` when the header can't be read). The button says "Exporting…" while it reads; a refusal (422 `{error}`) is its sentence inline under the dates, never a toast; a saved file is a toast, "Reports exported to <file>.". (Until 2026-10-16 it was a full-page link to Flask's `download-csv` page.)

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

### Wave 2h: Petty Cash settings, without Xero (Part 15.20 / 15.20b)

`/entity/<shortid>/<name>/settings/petty-cash` replaces the parts of Flask's Petty Cash settings that need no Xero, at Flask's own address (`settingsHref`, `lib/companyPages.ts`). It reads `GET /settings` and writes through `PUT /settings/country` and the sales-method routes (Minty `petty_cash_api/routes/settings.py`), unchanged. Its order and content are those of Flask's redesigned page (`entity/settings_entity.html`, `partials/electronic_delivery_section.html`, `static/js/petty_cash_settings.js`).

The page, top to bottom (`components/settings/PettyCashSettings.tsx`, rules in `lib/settings.ts`, a centred 720 column):

1. **The Standard header** (15.1): "‹ Petty Cash" back to the launch page, then **the settings pills** (the owner, 2026-10-19: "like the rest of the settings"), then "Petty Cash settings" (the h1). No intro text (2.9.10).
   - The pills (`components/settings/SettingsTabs.tsx`) use the same sections, order and name (`nav` "Settings sections") as minty-web's `SettingsTabs`, the payments app's `SettingsPills` and Flask's `settings_entity.html`: Users · Entity & Integration · **Petty Cash Settings** (this page, `aria-current`, not a link) · Payment Request Settings · Modules.
   - Payment Request Settings shows only when the token's `billing_enabled` is not false (`moduleClaims`).
   - minty-web's look: 44px `rounded-lg` pills that wrap, in Part 13 tokens.
   - Every other pill leaves the app through a hand-off (`@minty/shared/companyRef`'s `settingsSectionUrl` and `paymentRequestSettingsUrl`):
     - Users, Entity & Integration and Modules use `settingsSectionUrl`, through `/handoff/minty-web`;
     - Payment Request Settings uses `paymentRequestSettingsUrl`, through Flask's `/entity/<id>/settings/payment-request`, which mints the payments app's token and redirects. `noFlaskPages.test.ts` allows that path.
2. **Country & currency** (one card, its own Save): **Country** and **Currency**, native selects in Part 14 Input geometry.
   - A country alone brings its currency: choosing another country puts Currency on "The country's own currency" with "Saving sets the currency that goes with the country. Choose one here to use another." Choosing the saved country again puts the saved pair back.
   - Save sends only what changed (`{country_code}`, `{currency_id}` or both).
3. **Sales methods** (one card, its own Save): **Electronic** and **Delivery**, each a group (h3 + why) with its methods in list order (an ordered list), then **Add electronic method** / **Add delivery method** (Secondary).
   - **Add** opens a panel in place with one field, **Method** (required: the red `*`, sr-only "(required)", `aria-required`). It is an ARIA combobox over the catalogue methods not on the list (`available`, plus any removed on the page and not saved yet), narrowed as typed, A to Z, in the page's flow. A name the catalogue has (any case) is that catalogue method under its own spelling (`sale_info_id`); any other name is a new one (`name`). ↑ ↓ Enter choose; Enter with nothing highlighted is Add; Escape closes the list.
   - **Each row's More menu** (`components/ui/MoreMenu.tsx`; a bottom sheet on a phone): **Rename**, **Move up**, **Move down**, then **Remove** in Danger. Move up / Move down are the non-drag reorder, by keyboard (Enter opens the menu, ↓ Enter chooses) and by touch. After a move the focus stays on that row's More button and "AlipayHK moved to 2 of 3." is said (polite).
   - **Rename** is a Part 14 modal with **Name** (required), checked as typed.
   - A row not saved yet says "Added · not saved yet" or "Renamed from Octopus · not saved yet". Removals are listed under the lists: "Removed when you save: Visa. Reports that used them keep their amounts."
4. **Xero**, only while `xero_connected`: one sentence and **Go to Xero settings**, a full-page link to Flask's page (`settingsUrl`, `lib/flaskPages.ts`). Replaced by Wave 2k's two Xero cards.

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
- **Unsaved changes ask first** (`@minty/shared/leaveGuard`, minty-web's words). A link out of the page (the back link, the sidebar, Connect Xero in Entity & Integration) opens "Leave without saving?" with **Go Back** (focused) and **Discard changes**. A reload or a closed tab gets the browser's own prompt.

The ways in:

- **The sidebar's Settings** is this page now (`components/ui/sidebarHost.ts`; `currentOf` marks this address as current). The package draws it as a plain link, so it is a full page load.
- **The launch page's two settings links open this page at its Xero cards** (`xeroSettingsHref`, `#xero`; since 2026-10-16, before that Flask's page). Setup Required (the Xero account and contact slots not mapped) and a deposit correction's missing Deposit Bank Account / Petty Cash Account are all Xero mappings. Setup Required's "Choose your company's currency" (2026-10-22) opens it at Country & currency (`currencySettingsHref`, `#country`); the page scrolls to either anchor once its cards are drawn. Wave 1 had already removed the launch page's other settings link (Quick Actions' Entity Settings).

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
- Without Xero connected there is **no Xero card**, where Flask's mapping and account-code cards say "Xero isn't connected. Connect it in Entity & Integration". (Wave 2k: one card; since 2026-10-16 it links to minty-web's Entity & Integration.)

Not yet:

- **The "Congratulations!" modal** (`?success=true`) Flask showed after a settings save, which the faithful port listed as coming with this page. Part 14 confirms a save with a toast.

Known gaps of Wave 2h:

- **No drag to reorder**: Move up / Move down only.
- **Every Save sends one call per change**, so many changes are several round trips. Two people editing at once can stale the order (the API's 409, shown with its sentence).

### Wave 2i: editing a submitted report's details (Part 15.7)

The Daily Report lets a person change the three details of a submitted report that move no balance. This is Flask's "Edit details" (`report/ending.html?report_edit=true`), which sent people to the Cash Count and Addition to Drawer pages in a locked mode; here they are edited in place on the report. It writes through the Petty Cash API's edit routes (Minty `petty_cash_api/routes/report.py` over `report/services/report_edits.py`), unchanged: `PUT /reports/<id>/difference-reason` `{reason}`, `PUT /reports/<id>/withdrawal` `{withdrawal_type}` and `PATCH /reports/<id>/expense-lines/<line id>` (multipart). **Each answers the whole Daily Report, and the page redraws from it.**

The rules are `lib/reportEdits.ts`; the dialogs are `components/closing/ReportEdits.tsx`, loaded when first opened.

**Gating:** every edit shows only while `permissions.edit_details` is true: any submitted report that Xero is not publishing, for someone with the right. That is not only the latest, so an older report has these edits but no Edit report or Delete. A draft has none. Hidden, not disabled (15.1).

- **Edit reason** is the difference alert's Link action, only while the cash was short or over (any cent).
- **Edit where the cash came from** is a Link under the Cash breakdown's rows, only when cash was added (the row shows only then).
- **Edit** is a Link on each expense row (its accessible name names the expense and its amount), only while the read carries `options`.

The three editors:

1. **Edit the reason** (Part 14 modal; "Cash was HKD 20.00 short."): **Reason for the difference**, required (red `*`, "(required)", `aria-required`), holding the saved reason and focused, with the Cash Count stage's helper and live counter. Checked as typed:
   - over 300 characters, at once: "The reason is 301 characters. Shorten it to 300 characters or fewer.";
   - emptied while the cash was short or over, at once: "The cash was short, so the reason is still needed. Add the reason to save it." (the API's own sentence). A reason that opens empty turns red only after a refused Save.
2. **Where the cash came from** (Part 14 modal; "HKD 100.00 was added to the drawer. The amount stays as it is."): Company bank / Personal, the Addition to Drawer stage's radio cards.
3. **Edit expense** (Part 14 Drawer: 480 on a computer, a full-screen sheet on a phone; "General Expenses · HKD 120.50"), top to bottom:
   - the **Amount** as a fact ("The amount can't be changed here.");
   - the saved receipt as a File card (View opens it full screen);
   - the Expenses stage's own **receipt capture**: Replace the receipt (Take photo on a phone, Choose file, drop), optional;
   - its **Supplier picker** over the read's `options.suppliers`, with no new supplier here;
   - **Account**, a native select of `options.accounts` ("Choosing another account renames the expense to it."). The line's own account stays choosable if it is no longer switched on;
   - **Description**.

   Checked as typed:
   - a file, the moment it is picked: not a PDF, JPEG or PNG, empty, or over 10 MB (the Expenses stage's sentences). A picked file shows as a File card with View and Remove, and the saved one says "replaced when you save";
   - the description over 300 characters, at once;
   - a line saved with a supplier can't lose it (the API never clears one): emptied, at once, "The supplier is still empty. Choose a supplier from the list to save it."; a name that is not a supplier, when the field is left. A line saved with none may stay without, and then its Supplier and Account are not required;
   - a refused Save with two or more problems shows the error summary, which takes focus; one problem focuses its field.

   **The PATCH carries each field only when it changed** (`lineChanges`): `remarks` (an emptied description is a change), `supplier_id`, `account_id`, `receipt`. Closing with changes asks first, inline ("These changes aren't saved yet" / **Discard them**).

The rules, all three:

- **Save with nothing changed sends nothing** and closes, with no toast.
- **A report that has been to Xero** (`was_published`) says so first, as a Warning inside the dialog: "It will need publishing to Xero again" / "Saving takes this report out of Xero. Publish it again afterwards. The entries in Xero now are not removed: void them in Xero by hand." After the save, the API's answer is Submitted again (`mark_diverged_from_xero`), and the pill and the **Publish to Xero** Primary follow.
- **A refusal** (400, 403, 404, 409, 422, or no answer) is the API's sentence as a Danger inline alert inside the dialog, which stays open with Save back. It is never a toast and never a false success. A 401 goes back through the hand-off.
- **A save that went through** closes the dialog, redraws the page and confirms with a toast: "The reason is saved.", "Where the cash came from is saved." (Flask's words) or "The expense is saved."

Wave 2a-2h files touched for this wave:

- `lib/report.ts`: the read's `permissions.edit_details` and `options`. `lib/__tests__/report.test.ts`: the fixture carries them.
- `components/closing/ExpenseForm.tsx`: `ReceiptField` and `SupplierPicker` are exported, with optional `required` (both), `prompt` and `note` (the receipt). The Expenses stage passes none and is unchanged.
- `components/closing/DailyReport.tsx`: the three Edit links and the dialogs; the page redraws from an edit's answer.

Against Flask's page, deliberately:

- The edits are on the Daily Report itself. Flask's "Edit details" opened two Daily Closing pages in a locked mode, and the Expenses page for a line.
- A refusal is inline in the dialog, where Flask showed an error toast.
- Where the cash came from is offered only when cash was added; Flask always showed the radios.
- The Xero notice is said before the save.

Known gaps of Wave 2i:

- **No "Edited after submission" banner** (15.7): the read carries no edit history, as in Wave 2f.
- **One receipt per line here.** A replacement is one file (the API's rule), so a line saved with several receipts loses them all to the new one; the Drawer lists them as "replaced when you save".
- **No new supplier from an edit:** the read's `options` has no `create_supplier`. New suppliers are made in the Expenses stage.

### Wave 2j: Publish to Xero, in the app (Part 15.12 / 15.9h)

Publish to Xero no longer leaves for Flask's outcome page. It publishes in the app from three places, through the Petty Cash API's publish routes (Flask's `petty_cash_api/routes/report.py`: `publish_answer`, `publishing_status`; minty-petty-cash-api serves the same paths):

- `POST /reports/<id>/publish` answers **202** `{publishing_status: "publishing", message}` while Xero's worker runs in the background. A refusal is `{error}`: 400 (Xero settings incomplete, a system account on a line - the sentence names it), **400 with `reconnect: true`** (no usable Xero token), 409 (a draft, or one already publishing), 403, 404.
- `GET /reports/<id>/publishing-status` answers `{report_id, publishing_status, status_label, status_tone, xero_integrated, was_published, published_at, reasons: [{text, resolved}]}`.

The three places:

- **The Daily Report**: the Primary **Publish to Xero** while the report is not in Xero; **Publish to Xero again** under More once it is. A button now, no longer a link.
- **The outcome page**: with `can_publish`, **Publish to Xero** is the Primary (full width) and **View report** steps back to Secondary under it. Once the report is in Xero, View report leads again and **Publish to Xero again** (Secondary) is under it.
- **A report history row's** More menu: **Publish to Xero** / "again", as before - now the dialog, and the publish is watched in the row.

The flow (`components/closing/Publish.tsx`, rules in `lib/publish.ts`):

1. **It asks first** (15.9h: the consequence is external) - a Part 14 Confirmation modal, Cancel focused: "Publish to Xero?" / "The day's sales, expenses with their receipts and the bank deposit are sent to this company's Xero organisation." (Flask's words), **Publish to Xero**. Once the report is in Xero it is "Publish to Xero again?" with **Publish again**.
   - **A report that has been to Xero** (`was_published`: in Xero now, sent before an edit, or partly sent by a failed publish) adds a Warning, and the dialog becomes an `alertdialog`: "Xero gets a second copy" / "Publishing again adds new entries in Xero. The ones there now are not removed: void them in Xero by hand, or the day is counted twice."
   - Every read carries `was_published` - the outcome's too since Wave 2k (`xero.was_published`), so the dialog reads nothing first.
2. **A refused start** is the API's sentence as a Danger inline alert **inside the dialog**, which stays open with its action back. With `reconnect: true` the alert also carries **Reconnect Xero in Entity & Integration**, a full-page link through Flask's `/handoff/minty-web` to minty-web's Entity & Integration (`integrationUrl`), where Xero is connected again. Never a toast, never a false success. A ref sends the POST once.
3. **While it runs** (after the 202): the dialog closes, and the status is read at once and then every **3 s** (`POLL_MS`) until it leaves `publishing`. Each read redraws the place from the API: the Daily Report's pill and audit fact ("Publishing to Xero"), the outcome's "Sent to Xero" ("Pending"), the row's pill. An Info inline alert says "Publishing to Xero" / "This can take a few minutes. You can leave this page; Xero carries on." (15.12 partial success). Publish is not offered meanwhile.
   - A read that got no answer is tried again; a refused one (403, 404) stops with its sentence in the Danger alert; a 401 goes back through the hand-off.
   - **The cap**: after 40 reads (two minutes) it stops and says "Xero is still working on it" / "The report is submitted. Check again in a few minutes; it shows here once Xero has it." with **Check again**, which watches once more.
   - **Polling stops on unmount** (leaving the page) and when the status leaves `publishing`.
4. **When it finishes**:
   - `xero_integrated`: the pill turns **Published to Xero** (Success) and a toast says "The Daily Report for Tue 13 Oct 2026 is published to Xero."
   - Anything else (failed, a partial publish, put back): a **Danger** inline alert, "Publishing to Xero failed", listing the API's reasons - a resolved one with its icon and "· Resolved" in words; "Nothing more was sent. Check the Xero connection, then try again." when there are none - and **Try again**, which opens the confirmation again. The pill is the API's (Publish failed, Danger). In a history row the alert replaces the row's own "Why it didn't reach Xero" list while it shows.
5. **Arriving** on a Daily Report or an outcome that is `publishing` watches it the same way; one that `failed` reads its reasons once and shows the Danger alert with Try again. A history row that is `publishing` when the list loads is watched too (Wave 2k); a failed row already carries its reasons.

Every change is said in a polite live region that is always in the page ("Publishing to Xero.", "Xero is still working on it.", "Published to Xero.", "Publishing to Xero failed.").

Files touched for this wave:

- New: `lib/publish.ts`, `components/closing/Publish.tsx` (`usePublish`, `PublishDialog`, `PublishProgress`, `PublishReasons`), `lib/__tests__/publish.test.ts`, `e2e/12_publish.spec.ts`.
- `components/closing/DailyReport.tsx`; `components/closing/ReportOutcome.tsx` (with its own toast region now); `components/history/ReportHistory.tsx` (its reasons list is the shared `PublishReasons`).
- `lib/flaskPages.ts`: `publishUrl` is gone. `lib/report.ts`, `lib/history.ts`: comments. `lib/__tests__/report.test.ts`: the `publishUrl` case.
- `e2e/07_close.spec.ts`, `e2e/08_daily_report.spec.ts`, `e2e/09_report_history.spec.ts`, `e2e/11_report_edits.spec.ts`: Publish to Xero is a button or the dialog, no longer Flask's page.

Against Flask's page, deliberately:

- Publishing is offered on the Daily Report and in history as well as on the outcome page.
- A refused start stays in the dialog, where Flask closed it and showed the failure on the page. A 409 "already publishing" is a refusal, where Flask's page started polling.
- Success is a toast and the pill, where Flask's page reloaded with a flash.
- Try again asks again, where Flask's published at once.
- Two minutes of polling every 3 s, where Flask's page polled every 2 s for three minutes.

Known gaps of Wave 2j: both closed in Wave 2k (the outcome's `xero.was_published`, the rows' `publishing_status`).

### Wave 2k: Petty Cash settings' Xero cards (Part 15.20b)

The settings page's Xero parts are this app's: the **Xero account mapping** and the **Petty Cash account codes**, each a Part 15.20b card with its own Save, in the place Flask's redesigned page has them (Country & currency, the mapping, Sales methods, the codes). Content and words are Flask's (`entity/settings_entity.html`, `partials/xero_account_mapping_cards_classic.html`, `static/js/petty_cash_settings.js`). Connecting Xero is minty-web's Entity & Integration (through Flask's hand-off); no screen here opens a Flask page.

The API (Minty `petty_cash_api/routes/settings.py`, `xero_settings_answer`; minty-petty-cash-api serves the same paths):

- `GET /settings/xero` -> `{live, organisation, mapping, mapping_saved, account_codes, permissions: {edit_mapping, edit_account_codes}}`. `mapping` is `[{key, label, kind, options: [{id, name, code?}], selected}]` for the eight keys; `mapping` and `account_codes` are null unless live. **It asks Xero on the server**, so the page reads it **once**: beside `GET /settings`, never after it, and one request even when React runs the effect twice in development (a ref keeps it). The other cards draw first; the Xero cards show a skeleton until it answers.
- `PUT /settings/xero/mapping` with the eight Xero ids -> the read + `{message, first_save}`. The Discrepancy Bank Account mirrors the Petty Cash Account and is set by the API, never sent.
- `PUT /settings/xero/account-codes` `{codes}` -> the read + `{message}`.
- A new contact is `POST /suppliers` `{name}` -> `{id, name}`, the Expenses stage's route.

The cards (`components/settings/XeroCards.tsx`, rules in `lib/xeroSettings.ts`; `Card` and `CardSave` moved to `components/settings/SettingsCard.tsx` so both files draw them):

1. **Not live** (`live` false): one card, "Xero", with "Xero isn't connected for this company. Connect it in Entity & Integration, then the account mapping and the account codes can be set here." and **Connect Xero in Entity & Integration**, a full-page link through Flask's `/handoff/minty-web` to minty-web's Entity & Integration (`integrationUrl`). A 403 on the read says "Your role can't see the Xero settings. Ask an Accountant or an Admin."; any other failure is the API's sentence in that card, and the rest of the page still works.
2. **Xero account mapping**: "Xero organisation: …", then eight required pickers in Flask's labels and order, in pairs from 640 (Petty Cash Account, Deposit Bank Account; Cash Sales account code, Cash Sales contact; Director Personal Account code, Director / Responsible person; Discrepancy account code, Discrepancy contact), each with Flask's why as its helper. An account shows as "429 — General Expenses" (Part 14: the accounting value stays visible).
   - Each picker is the Part 14 Supplier picker's ARIA combobox: narrowed as typed by code or name, ↑ ↓ Enter, Escape closes the list, the count said. Its list lies **over** the page, not in its flow, so closing it on a blur never moves the Save under a click. A text typed in full (label or name, any case) is that option when the field is left.
   - A contact picker ends its list with 'Add "…" as a new contact' when no contact has the name. It opens a **New contact** panel (name checked as typed: empty after Add, over 150 at once, a contact's name at once); **Add contact** (or Enter) makes it in Xero at once, chooses it here and offers it in the other contact fields. A refusal is the API's sentence in the panel. The mapping itself still waits for Save.
   - Until a mapping is saved (`mapping_saved` false) an Info alert says "Not set up yet" / "Daily Reports can be published to Xero once these choices are saved." **The first save** (`first_save`) says what it unlocked, as a toast: "Xero account mapping saved. Daily Reports can be published to Xero now."
3. **Petty Cash account codes**: "Only the picked account codes appear when adding an expense in Petty Cash." A search (code or name), "n of m picked" (polite), and a checklist of 44 px rows with **Select all** (or "Select all shown" while searching; mixed when some are ticked). A code without a code is not offered (Flask's rule).

The checks, as typed (CLAUDE.md; Part 11 wording):

- the Deposit Bank Account the same as the Petty Cash Account, at once, on the Deposit Bank Account: "The Petty Cash Account and the Deposit Bank Account can't be the same. Choose a different one for each." (the API's sentence);
- a name that is not in the list, once the field is left: "Nobody isn't in the list. Choose the Director / Responsible person from the list.";
- empty: at once when a saved choice is emptied, otherwise only after a refused Save: "The Cash Sales account code is still empty. Choose one from the list to save.";
- a refused Save with two or more problems shows the error summary, which takes focus and links to each field; one problem focuses its field. Nothing is sent;
- **the account codes keep at least one picked**: with none, Save is disabled and says why beside it, at once: "No account code is picked. Pick at least one to save: an expense can use only the picked codes." (the API's 422 is "Pick at least one account code.").

The rules, both cards:

- **One Save per card**, disabled with its reason beside it: "No changes to save yet.", the codes' rule, or "Only Accountants and Admins can change these." without `permissions.edit_mapping` / `edit_account_codes`.
- **A cashier** sees the mapping as facts (each label and its choice, or "Not chosen yet") and the picked codes as a list - no pickers, no checkboxes - and both Saves disabled with the reason.
- **A refusal** (422 with any of its sentences, 409 not live or not synced yet, 403, or no answer) is the API's sentence as a Danger inline alert in the card; the choices stay. Never a toast, never a false success.
- **A save that went through** redraws the card from the answer and confirms with a toast ("Xero account mapping saved.", "Account codes saved."). The other Xero card keeps what is waiting on it.
- **Unsaved changes** in either card ask before the page is left, as for the other cards; Discard puts both back to the read.

Also in this wave, the two fields Wave 2j asked for:

- `GET /reports/<id>/outcome`'s `xero.was_published`: the outcome page's Publish dialog warns from it, with no `publishing-status` read first (`lib/outcome.ts`, `components/closing/ReportOutcome.tsx`; `PublishDialog`'s `wasPublished` is always known now).
- Each `GET /reports` row's `publishing_status`: a row already "publishing" when the list loads is watched (polled) like one started from the row (`watchedOnArrival`, `lib/history.ts`; `components/history/ReportHistory.tsx`).

Files touched for this wave:

- New: `lib/xeroSettings.ts`, `lib/__tests__/xeroSettings.test.ts`, `components/settings/XeroCards.tsx`, `components/settings/SettingsCard.tsx`.
- `components/settings/PettyCashSettings.tsx`: the second read, the Xero cards in place, the old Xero card gone. `e2e/10_settings.spec.ts`.
- `components/closing/Publish.tsx`, `components/closing/ReportOutcome.tsx`, `lib/outcome.ts`, `lib/history.ts`, `components/history/ReportHistory.tsx`, and their tests and stubs (`lib/__tests__/outcome.test.ts`, `lib/__tests__/history.test.ts`, `e2e/07_close.spec.ts`, `e2e/08_daily_report.spec.ts`, `e2e/09_report_history.spec.ts`, `e2e/12_publish.spec.ts`).

Against Flask's page, deliberately:

- Problems are said in the field as typed, where Flask's mapping script showed a toast on Save ("Please select: …").
- A new contact is offered from the picker's list ('Add "…" as a new contact'), where Flask had a "+ New Contact" panel per field.
- The first save is a toast that names what it unlocks; Flask's page reloaded.
- Not connected is one card, where Flask kept both cards' headings with a notice in each.

Known gaps of Wave 2k:

- **The read has no "may create contacts"** (`CONTACT_CREATE`): Add as a new contact is offered to anyone who may change the mapping, and the API's 403 is said in the panel.
- ~~The launch page's Setup Required and a deposit correction's missing accounts still link to Flask's settings page~~ - they open this app's settings at its Xero cards since 2026-10-16 ("No Flask pages").
- **Flask's "couldn't refresh these lists from Xero" note** has no field in the read (`refresh_from_xero` logs and carries on), so the page can't say the lists may be stale.

### Wave 2l: the public share page (Part 15.7, shared variant)

A shared Daily Report no longer opens Flask's `/Minty_Report/<initials>/<day>/<secret>/` page (the user's rule: Flask becomes a backend only). This app serves it at **`/share/<initials>/<day>/<secret>`** (`app/share/[...path]/page.tsx`, `components/closing/SharedReport.tsx`, rules in `lib/share.ts`). Anyone with the link reads it without signing in.

The API (the Petty Cash API, built in parallel; the specs stub it):

- `POST /reports/<id>/share-link` (bearer) answers `{url, path, expires_at}`. `path` is `<initials>/<day>/<secret>`, in Flask's form: `OV/13_Oct_2026/<32 url-safe characters>`.
- `GET /api/petty-cash/v1/public/share/<initials>/<day>/<secret>` (no auth) answers the report's figures: `company_name`, `transaction_date`, `currency_code`, `status_label` / `status_tone`, `kpis`, `sales`, `expenses.lines` (`item`, `supplier`, `remarks`, `amount`, `receipts: [{name}]`), `cash`, `closing_balance`, `submitted_at` / `submitted_by` and `expires_at`. Any of them may be left out.
- A refusal is `{error}` with **404** (no such link) or **410** (expired).

**The Share dialog** builds the link from the answer's `path` on this app's origin: `${window.location.origin}/share/${path}` (`shareLinkUrl`). It no longer reads the API's `url`. An answer with no usable path (not three url-safe parts) shows "We couldn't make the link. Check your connection, then try again." with Copy link disabled. It logs that the path was missing, never the answer.

**The page**, in this app's look (Flask's `is_shared_link` branches of `report/ending.html`):

1. A bare App bar: the Minty mark and the company. No back, no initials, no menu, no sidebar (Flask's `pc_bare`). Part 15 has no footer pattern for a public view, so there is none.
2. "Daily Report" (the h1) with the API's Status pill, and under it the day and the company ("Tue 13 Oct 2026 · Olive & Vine", as Flask's).
3. The outcome band (Wave 2f; only the KPIs that arrived - no hero when Cash position is left out), the difference as a Warning fact, Sales by method / Expenses (n) / Receipts (n) / Cash as collapsed disclosures, the closing balance, then the audit facts: "Submitted by … · <time>" and "This link works until <time>".
4. **Nothing to do.** No Share, Publish, More, Edit or Delete, and none of the detail edits. A receipt is a File card with its name and expense and no View: a shared page never opens a receipt. The page has no link at all.
5. **Only what arrived is drawn.** A missing KPI, row or section is left out, never shown as zero. Receipts shows only when a line carried `receipts`. An expense row is its description, then its supplier ("No supplier").

The read-only parts are one implementation for both pages. `KpiCards` (since 2026-10-19 the outcome band, `OutcomeBand`), `Disclosure`, `Rows`, `Row`, `ClosingBalance` and `AuditFacts` moved from `DailyReport.tsx` to `components/closing/ReportParts.tsx`. The rules are shared too: `lib/report.ts`'s `kpiCards`, `cashRowsOf` and `differenceAlertOf` take whichever figures arrived. `reportKpis`, `cashRows` and `differenceAlert` call them and return what they did before.

Refusals are an Outcome state (15.7 "shared link expired") in Part 11's words, with no link and no API text:

- **404**, or an address that is not a share link (not three url-safe parts; nothing is read): "This link doesn't work" / "It may be mistyped, or a newer link replaced it. Ask the person who shared it for a fresh link."
- **410**: "This link has expired" / "Shared links work for a limited time. Ask the person who shared it for a fresh link."
- Anything else (5xx, no answer, not JSON): "We couldn't open this report" / "Check your connection, then reload the page. If it keeps happening, ask for a fresh link." It is logged by its status alone.

Security decisions (the secret is the address's last segment):

- **Public by exactly one prefix.** `proxy.ts` lets `/share/...` through with no token and whatever cookie: no hand-off, no renewal, no company check. `/share` alone, `/shared/...`, `/sharex/...`, `/Share/...` and a `/share/../` path still go to the hand-off (`__tests__/proxy.test.ts`; `e2e/13_share.spec.ts` asks the server directly).
- **Nothing of the reader's is sent.** The read is a plain `fetch` (`readSharedReport`), not `lib/apiClient.ts`: no Authorization even with this app's token in a cookie, `credentials: "omit"`, `referrerPolicy: "no-referrer"`, `cache: "no-store"`. The sidebar host gives no viewer token on a `/share/` page (`isSharePage`), so no `/api/me/profile` read is made there either.
- **No referrer, no indexing.** The page's metadata is `<meta name="robots" content="noindex, nofollow">` and `<meta name="referrer" content="no-referrer">`. The proxy also answers `/share/...` with `Referrer-Policy: no-referrer` (it replaces the app-wide `same-origin`; checked on the dev server), `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store` (the dev server overrides that last one with its own).
- **No secret in logs or error text.** Nothing logs a URL, a path or an answer body. Refusals are this app's own sentences, never the API's.
- **The path is checked before it is sent**: exactly three segments of `[A-Za-z0-9_-]`, so nothing else reaches the API.

Files touched for this wave:

- New: `app/share/[...path]/page.tsx`, `components/closing/SharedReport.tsx`, `components/closing/ReportParts.tsx`, `lib/share.ts`, `lib/__tests__/share.test.ts`, `e2e/13_share.spec.ts`.
- `proxy.ts` and `__tests__/proxy.test.ts`; `components/closing/DailyReport.tsx` (the Share dialog's link, the parts moved out); `lib/report.ts` (the partial-figure rules); `components/ui/sidebarHost.ts` and its test; `e2e/08_daily_report.spec.ts` (Share's link is `<origin>/share/<path>`; an answer without a path).

Against Flask's page, deliberately:

- A refusal is an Outcome state on the page. Flask flashed and redirected to the company list, a sign-in page for a reader with no account.
- Reading an expired link does not delete it here: that is the API's business.
- The audit facts add until when the link works.

Known gaps of Wave 2l:

- **No "Where the money came from and went" here.** The public read's expense lines carry no account, so expenses by account cannot be drawn; the charts wait for an `account` on those lines (an API change).
- **Revoking a link** (15.7: "read-only and revocable") has no API yet.
- **Not checked against a real API.** The public route is being built in parallel; only the stubbed contract above is tested.
- **The audit facts are on the reader's device clock**, as on the Daily Report.
- In development React runs the read twice (Strict Mode); a build reads once.

### Daily Closing Phase 1 from Flask 4e004d2

Flask's Daily Closing Phase 1 (Minty `4e004d2`, 2026-10-16, merged into Minty `development` in `a3e3266`, with the any-cent rule `>= 0.005` of 2026-10-15) ported onto Waves 2d and 2e, which were built from the earlier snapshot (`1713c70`, `1d80b29`). The architecture stays this app's: `@minty/shared/ui` v0.5 primitives, Part 13 tokens only, the same reads and saves - **no API change**.

**Cash Count** (`components/closing/CashCount.tsx`, rules added to `lib/cashCount.ts`): "Three quick checks. We'll go one at a time." - three task cards, **one open at a time**:

1. **Cash taken to the bank** (optional): "In the drawer before any deposit" as a total band, the deposit (`inputMode=decimal`, "Leave it empty when no cash went to the bank."), Continue. Done, it reads "HKD 300.00 to the bank" or "None today", with **Change**.
2. **Count the drawer**: the cash-register scene and **Count notes and coins**, which opens the **Count the drawer sheet** (the Part 14 Drawer: 480 at the right, full screen on a phone) - notes, then coins, each row "face, count (`inputMode=numeric`) = line total" ("—" while empty), the live "Total in the drawer", **Save count** (Enter in a row is Save count, never the page's Save & Next). Closing the sheet keeps what was typed, but only Save count marks the count done. Done, it reads "Counted in the drawer" with **Edit**.
3. **Safe box**: the safebox scene beside "Cash in the safe box". Done, it reads its amount with **Edit**.

- Only the first task not done is open (`currentTask`); the others show their result or "Next, after ...". A typed task is done once its card is left with a valid value (a deposit above the cash on hand never finishes); the focus moves to the next open task. A **saved** stage (Cash Count completed, or any note or coin counted - `countSaved`) opens with every task done: "All three checks are done."
- **The Check appears only once the drawer is counted**: "The numbers match - Counted HKD 1,300.50 · expected HKD 1,300.50" (Success), or the Warning "The count is HKD 20.00 short." with the reason, required. Any cent counts.
- **Save & Next waits** and says why above it (`nextGate`, `StageActions`' new `gate`): "Count the drawer to continue", then "Add a reason for the difference to continue." Save & Exit never waits. A problem on a refused save opens its task, or the sheet on the row (a count's 422 included).

**Close** (`components/closing/Close.tsx`, rules in `lib/close.ts`): "One last look before today is closed." - a readiness banner ("Ready to submit / All five stages are filled in.", plus "One note for the reviewer below." with a difference; or the business-rule gate; or "The count is HKD 20.00 short / No reason was given yet." with Go to Cash Count - Submit stays on, as Flask's), then **one summary card, a row per stage**: its name, one line (Starting cash balance; "3 methods · Cash HKD 820.50"; "2 expenses · 1 receipt"; "HKD 300.00 to the bank · Counted in the drawer"), its total and **Edit**. The difference is a Warning pill inside the Cash Count row, with its reason. Then "When you submit". The per-item rows and the closing balance are gone (the stages' own; the Daily Report's). Save & Exit is Secondary.

**The outcome page** (`components/closing/ReportOutcome.tsx`, rules in `lib/outcome.ts`), the Completion state: Flask's happy Minty (`public/minty-cat.png`, 168), **"Today is closed"** for the server's today, else "The report is submitted", and "The Daily Report for Tue 13 Oct 2026 is submitted. Nice work — see you tomorrow."; three facts - **Sales**, **Expenses** (the outcome read's `total_sales` / `total_expenses`, the Daily Report's `kpis` figures - one call), **Cash counted** with the difference as a Warning pill; one quiet Xero line (with `can_publish`): "Not sent to Xero yet" + **Send to Xero**, or "Sent to Xero · 6:12 pm" + **Publish again** - the existing publish flow (`PublishDialog`, `usePublish`), hidden while Xero works on it; then **View report** (Secondary) and **Back to home** (Primary). No "Start the next day" (`requestStart`/`takeStartRequest` and the launch page's arrival effect are gone). No confetti.

**The subscription notice on the launch page** (`components/dashboard/SubscriptionNoticeModal.tsx`, `lib/subscriptionNotice.ts`; Flask's `subscriptionNoticeModal` in `petty_cash/launch.html`, minty-payment-request-web's `SubscriptionNoticeModal`): `GET /api/entities/<id>/subscription-notice` on minty-subscription-api (`SUBSCRIPTION_API_URL`, `subscriptionFetch`, a 401 only rejects). With items, the Part 14 Modal: "Action needed" (critical) or "Your subscription", an inline alert per item in its tone, for anyone but the payer "Billing for this company is managed by Olive (olive@…). Only they can change its subscription.", then Dismiss and, for the payer only, **Go to subscription settings** - minty-web's Module page through `/handoff/minty-web` (`subscriptionSettingsUrl`, `lib/hub.ts`), never a Flask page. Once per company per sign-in (the token's `sid`; once per tab without one). It sits over Setup Required. A failed read shows nothing and logs why (`console.warn`, status only).

Against Flask, deliberately:

- Change / Edit name their task in `aria-label` ("Change the cash taken to the bank"), not a visually hidden span: the accessible name is the same.
- A refused save's count problem opens the sheet on its row (Flask's count inputs stay in the page form).
- The deposit's over-limit sentence is the app's (the API's), as since Wave 2d.

Files: `components/closing/CashCount.tsx`, `Close.tsx`, `ReportOutcome.tsx`, `Stage.tsx` (`StageActions`' gate); `components/dashboard/Dashboard.tsx`, new `SubscriptionNoticeModal.tsx`; `lib/cashCount.ts`, `close.ts`, `outcome.ts`, `hub.ts`, new `subscriptionNotice.ts`; `public/cash-register.webp`, `safebox.webp`, `minty-cat.png` (Flask's `static/img/cash_reg.webp`, `safebox.webp`, `minty_cat.png`). Tests: `lib/__tests__/cashCount`, `close`, `outcome`, `hub`, new `subscriptionNotice`; new component tests `components/closing/__tests__/CashCount`, `Close`, `ReportOutcome` and `components/dashboard/__tests__/SubscriptionNoticeModal`; e2e `02_dashboard`, `06_cash_count`, `07_close`, `12_publish`.

Known gaps:

- ~~**The outcome read has no totals.**~~ Resolved 2026-10-19: `GET /reports/<id>/outcome` carries `total_sales` and `total_expenses` (Minty `report_outcome` and its Django twin, one helper `close.py::report_totals` shared with the Daily Report's `kpis`), so the page makes one call; the parallel `GET /reports/<id>` and its failure path are gone.
- **The subscription API's CORS** must allow this app's origin: its default `CORS_ALLOWED_ORIGINS` is minty-web, the payments app and `PETTY_CASH_PUBLIC_URL` (Flask), so on a stack without this app's origin added the read fails and no notice shows (logged).
- Not checked in a browser at 360 / 768 / 1440 in this wave's change set; the e2e specs above cover both viewports.

## Not here yet

The Daily Closing's five stages and its outcome page are this app's since Wave 2e, the Daily Report since Wave 2f (its detail edits since Wave 2i), the report history since Wave 2g, Petty Cash settings since Wave 2h (its Xero cards since Wave 2k), Publish to Xero since Wave 2j, and the public share page since Wave 2l. Connecting to Xero stays Flask's.

- **PR previews and the Vercel project** belong to the infra step (Step 5), which is being re-planned. That is why there is no `preview.yml` yet.
