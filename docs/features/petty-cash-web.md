# minty-petty-cash-web - the app, its sign-in and its backends

Petty Cash's own front end (Next.js 16, Tailwind v4, port **3010**). It is replacing the Petty Cash pages in Minty (the Flask app) and redesigning them to the owner's guidelines (Parts 13-15, `Minty/docs/design/`).

- `main` is the Flask look and production (`pettycash.dailyminty.com`, from the Step 5 apply).
- `development` is the Part 15 redesign (`dev-pettycash.` and previews). The two are separate tracks: never fast-forward one into the other.
- Flask's own Petty Cash dashboard and report history hand over to this app wherever Flask has `PETTY_CASH_WEB_URL` set (Minty `blueprints/entity/routes/list.py::report_dashboard`, `blueprints/report/routes/history.py`).

## Addresses

One company's Petty Cash lives at `/entity/<shortid>/<name>/petty-cash/...`. This is the address form every Minty app shares (`@minty/shared/companyRef`, Flask's `blueprints/shared/entity_ref.py`).

- The first 8 hex characters decide the company.
- The name is only for reading.

`/` sends a signed-in person to their company's Petty Cash.

## Old links after the host switch

At the hosting switch (Step 5), `pettycash.dailyminty.com` stops being Flask and becomes this app, and Flask moves to `accounts-api.dailyminty.com`. The owner decided (2026-10-19) that old `pettycash.` links are mapped, not left to 404. The rules are in `lib/oldLinks.ts`. `proxy.ts` answers them **before the gate**, so they work the same with and without a token (someone opening an old share link is not signed in). No path is ever logged, because a share link carries its secret.

| Old path on `pettycash.`                                                                                                                                                                                                                                                                                                                         | Goes to                                                      | How                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------- |
| `/Minty_Report/<initials>/<date>/<secret>/` (with or without the slash)                                                                                                                                                                                                                                                                          | `/share/<initials>/<date>/<secret>`                          | 308, query dropped, `no-referrer` / `no-store` |
| The same with a malformed secret, two parts or more than three                                                                                                                                                                                                                                                                                   | Next's 404                                                   |                                                |
| `/entity/<shortid>/<name>/petty-cash`, `.../reports`, `.../reports/new/<step>`, `.../reports/<id>/summary`, `.../reports/<id>/submitted`, `/entity/<shortid>/<name>/settings/petty-cash`                                                                                                                                                         | unchanged: these are this app's pages                        | the gate                                       |
| `/entity/<shortid>/<name>` (Flask's way into the dashboard)                                                                                                                                                                                                                                                                                      | `.../petty-cash`                                             | 308, query kept                                |
| `/entity/<co>/reports[/...]` (before the module prefix)                                                                                                                                                                                                                                                                                          | `/entity/<co>/petty-cash/reports[/...]`, then the rows below | 308                                            |
| `.../petty-cash/reports/<id>/<step>` (a submitted report's step views)                                                                                                                                                                                                                                                                           | `.../petty-cash/reports/<id>/summary`                        | 308                                            |
| `.../petty-cash/reports/resume`, `.../reports/summary`, `.../reports/new/submitted`                                                                                                                                                                                                                                                              | `.../petty-cash` (the dashboard; Continue Report resumes)    | 308                                            |
| `.../petty-cash/reports/download-csv`                                                                                                                                                                                                                                                                                                            | `.../petty-cash/reports` (Export CSV is there)               | 308, query kept                                |
| `/entity/<co>/ending[/<id>]`, `/entity/<co>/report/opening` (Flask's oldest forms)                                                                                                                                                                                                                                                               | the dashboard, the report's view, `.../reports/new/opening`  | 308                                            |
| `/entity/<full uuid>/...` for any Petty Cash path above, `/entity/settings/entity/<uuid>`                                                                                                                                                                                                                                                        | the readable `/entity/<shortid>/<name>/...`                  | see below                                      |
| `/entity/<co>/settings/users`, `/settings/integration`, `/settings/modules`                                                                                                                                                                                                                                                                      | minty-web's same page                                        | Flask's `/handoff/minty-web`                   |
| `/entity/<co>/settings/xero`, `/entity/<co>/xero-not-connected`, `/invitation/xero-not-connected/<uuid>`                                                                                                                                                                                                                                         | minty-web's Entity & Integration                             | the same                                       |
| `/entity/<co>/modules`                                                                                                                                                                                                                                                                                                                           | minty-web's module choice, `/entity/<co>`                    | the same                                       |
| `/entity/settings/users/<uuid>`, `/entity/settings/module/<uuid>`                                                                                                                                                                                                                                                                                | minty-web's Users, Modules                                   | the same, scoped to the uuid                   |
| `/profile`                                                                                                                                                                                                                                                                                                                                       | minty-web's My Profile                                       | the same                                       |
| `/subscription[/...]`                                                                                                                                                                                                                                                                                                                            | minty-web's Subscriptions                                    | the same                                       |
| `/entity`, `/entities[/...]`, `/entity/create`, `/entity/success`, `/login`, `/register`, `/index`, `/reset_password[/<token>]`, `/no-permission`, `/admin[/...]`, `/admin_dashboard`, `/find_user`, `/create`, `/report/...`, `/payment-request[/...]`, `/payment_request[/...]`                                                                | minty-web's entity list                                      | the same                                       |
| Flask's backend paths: `/handoff/*`, `/api/*`, `/minty/api/*`, `/auth/*`, `/callback`, `/logout`, `/xero_auth`, `/xero_connect`, `/xero_reconnect`, `/invitation/accept/<token>`, and the payments hand-offs `/entity/<co>/payment-request`, `/entity/<co>/settings/payment-request`, `/entity/<uuid>/bills`, `/entity/settings/payments/<uuid>` | the same path on `ACCOUNTS_API_URL`                          | 308, query kept                                |
| Anything else                                                                                                                                                                                                                                                                                                                                    | Next's 404 (after the gate, as before)                       |                                                |

`<co>` is `<shortid>/<name>` or a full uuid. A step is one of `opening`, `sale`, `expense`, `deposit`, `cash-count`, `ending`.

- **A full company uuid** (Flask accepted one in place of `<shortid>/<name>` and redirected to the readable form). The readable address needs the company's name, and this app does no lookup: the only name it holds is the token's cookie. So, with that company's token, it is a 307 straight to `/entity/<shortid>/<name>/...`. Without one, or with another company's token, it goes through Flask's `/handoff/petty-cash-web` for that uuid with the uuid address as `next`. That comes back with the token, and the next request is the 307. minty-web's pages take a full id themselves, so a hub target becomes `/entity/<uuid>/company/...`, which minty-web corrects to the company's name.
- **Backend paths are not page links.** An old OAuth or API caller still reaches Flask: Xero's registered `https://pettycash.dailyminty.com/callback`, sign-in and invitation emails already sent, and API clients. `flaskBackendUrl` in `lib/handoff.ts` builds the address and re-checks the path against `isFlaskBackendPath`, so it can never build a Flask page. The `no_flask_pages` guard allows exactly that one line, and says why. The proxy also runs on `/api/:path*` for this (this app has no API routes).
- **Hub trips** go through `toFlask`, so a preview set starts them with a meta refresh and names its origin as `return_origin`, like every other trip to Flask.
- **A trailing slash** is removed by Next first (its own 308), then the proxy redirects. That first hop is Next's own, so it does not carry the share headers.

## Sign-in: Flask mints, this app never refreshes

Flask is the only thing that mints tokens. This app has no login and no refresh, the same model as minty-web.

1. Flask's login-gated `GET /handoff/petty-cash-web?next=<path>&entity_id=<company>` (Minty `blueprints/entity/routes/modules.py`) mints a 30-minute module token for **one** company. It does so only if the person belongs to that company, the company is past onboarding and Petty Cash is on for it.
2. Flask sends the browser to `/landing?token=…&next=…&entity_id=…&entity_name=…`.
3. `/landing` stores the token in the `petty_cash_token`, `petty_cash_entity_id` and `petty_cash_entity_name` cookies (`lib/auth.ts`). Their names are this app's own, because every localhost port shares one cookie jar. The cookies live exactly as long as the token's `exp`.
4. `proxy.ts` (Next 16's middleware) gates every page:
   - **No cookie:** back through the hand-off, naming the company from the address. Flask accepts a uuid or `<shortid>/<name>`.
   - **A cookie for another company than the address names:** the same. The token is for one company.
   - **Under 5 minutes left:** renewed on the way to the next page, never in the middle of a form.
   - **Before the gate:** an old `pettycash.` link is redirected (see _Old links after the host switch_).
   - **Open without a token:** `/landing`, and exactly `/share/...` (the public share page, below). `__tests__/proxy.test.ts` checks that nothing else became public: `/share` alone, `/sharex/...`, a company page with `/share/` inside it and a `/share/../` climb all still go to the hand-off.
5. **A 401 from any API call:** back through the hand-off, once (`lib/handoff.ts`).

## Backends (`lib/env.ts`, `lib/apiClient.ts`)

The variable names follow the owner's 2026-10-14 decision: Flask is becoming `accounts-api`, and Petty Cash gets its own API.

| Variable                  | What                                                               | Default (decided ports) | Today on a workstation |
| ------------------------- | ------------------------------------------------------------------ | ----------------------- | ---------------------- |
| `ACCOUNTS_API_URL`        | Flask: the hand-off, `/api/me/profile`, logout                     | `http://localhost:8000` | same                   |
| `PETTY_CASH_API_URL`      | Petty Cash's API (Django `minty-petty-cash-api`): `pettyCashFetch` | `http://localhost:8010` | same                   |
| `SUBSCRIPTION_API_URL`    | the sidebar's Subscriptions                                        | `http://localhost:8001` | same                   |
| `PAYMENT_REQUEST_WEB_URL` | the sidebar's Bills (fallback)                                     | `http://localhost:3020` | same                   |

- **Inlined at build time.** Every variable is listed under `next.config.ts`'s `env`.
- **The Petty Cash API is Django's** (`minty-petty-cash-api`, `pettycash-api.` in production), at `/api/petty-cash/v1/companies/<id>/...`. Flask still has a copy (`blueprints/petty_cash_api`) at the same paths, but deployments point `PETTY_CASH_API_URL` at Django: Flask's copy sends no `Expose-Headers`, so a CSV download would lose its file name.
- **The company is only in the path.** Flask checks it against membership on every call, and the door fails closed.
- **One header pair.** Every call sends `Authorization` and nothing else (Flask's CORS allows `Authorization` and `Content-Type`).
- **The one call without a bearer:** `pettyCashPublicFetch`, the share page's read of `/api/petty-cash/v1/public/...` (and only there). It sends no `Authorization` even when the person is signed in, no cookies (`credentials: "omit"`), no referrer and nothing cached, and a 401 is a plain refusal, never a hand-off.
- **Errors.** A refusal is `{"error": "<sentence>"}`, and the screen shows the sentence as it stands. A fetch that never got an answer says "We couldn't reach Petty Cash. Check your connection, then reload the page." It is never the browser's error text.

## The sidebar

**On `development`, `@minty/shared` is pinned at `v0.5`**, moved from `v0.1` on 2026-10-19 at the owner's request (every app on the latest shared sidebar; v0.5 is v0.4 plus the `pettycash` preview label and a closed sidebar that casts no shadow). Only the menu takes the Minty v2 look; every page keeps Flask's. What that rests on:

- `app/globals.css` imports `@minty/shared/tokens.css`, because the sidebar draws in its names (without it the menu draws in Tailwind's defaults, transparent). The v0.1-only colours (`--avatar-bg`, `--avatar-fg`, `--primary`) are gone.
- tokens.css makes `rounded-sm/md/lg/xl` Part 13's 4/8/12/16 px. The ported pages draw only with the `flask-*` radii (`app/styles/flask-theme.css`), so their corners did not move, and `app/__tests__/packagedStyles.test.ts` fails on a plain `rounded-md`..`4xl` in this app's source and on any local `--radius-*`, `--text-*` or tokens.css colour name.
- **The preview label is `pettycash`** (2026-10-19, Step 5): a branch preview of this app is `pr-<slug>-pettycash.dailyminty.com`, matching its production host `pettycash.dailyminty.com`. The package says the same from v0.5. Flask's `PREVIEW_ORIGIN_REGEX` / `preview_origin.py`, minty-infra and the `.github` repo's `vercel-preview-set.yml` must say it too, or a preview set's Flask round trip does not come back to this app's preview. The repo name `minty-petty-cash-web` and the sidebar's app id are unchanged.
- `lib/previewSibling.ts` is still a local copy, identical in code to the package's `@minty/shared/previewSibling`; switching the imports to the package is a separate change.

`port/prw-look` pins `v0.3`.

`@minty/shared/sidebar`, with this app's host in `components/ui/sidebarHost.ts`. That file is the only app-specific part.

- **This app's own pages:** Dashboard, Reports and Settings.
- **minty-web's pages, through Flask's `/handoff/minty-web`:** the entity list and Subscriptions.
- **Through Flask's `/entity/<id>/payment-request`** (a hand-off that mints the payments app's token, not a page): Bills.
- **My Profile is the sidebar's sheet, over the page** (the owner, 2026-10-20): the shared panel `@minty/shared/profile` (v0.6), wired in `components/ui/SidebarShell.tsx` with this app's Flask calls (`lib/profileApi.ts`, `GET`/`PATCH /api/me/profile` with `?entity=`) its toast, and the packaged Subscriptions Overview (`lib/subscriptionsApi.ts`: subscription-api's `GET /api/me/subscriptions`, every page; Manage Subscription goes to minty-web's portal through the hand-off). No PASSWORD row (Minty holds no password). Its five `public/profile/` files are asserted against `PROFILE_ASSETS` (`app/__tests__/packagedAssets.test.ts`). `links.profile()` (minty-web's page through the hand-off) is only the no-sidebar fallback.

## Design

- **Tokens:** `@minty/shared/tokens.css`, Part 13. Screens bind only to semantic utilities, and `__tests__/no_raw_colours.test.ts` fails on a hex or a palette colour.
- **Icons:** Material Symbols **Rounded**.
- **Amounts:** `lib/money.ts` `formatMoney` (the shared `@minty/shared/money` formatter since 2026-10-23, plus the no-currency note) writes the currency code, a non-breaking space (`\u00a0`, so a line never splits the code from the amount), then the amount ("HKD 1,234.50"; Flask ran them together, owner 2026-10-21; the denomination labels do the same). The owner's rules of 2026-10-21: **never a "$"** - with no currency an amount reads "12.00 (No currency selected)" (`NO_CURRENCY_NOTE`), a denomination just its figure, the money fields show no code and the summary's heading says "(No currency selected)" (Flask fell back to "$"); **extra decimals are cut, not rounded** ("HKD 1.23" for 1.239; float noise such as 0.3 - 0.1 is not cut, because the figure is first taken to 15 significant digits); **the sign leads** below zero ("-HKD 12.50"); and a non-number shows nothing. The Fix modals' figures go through `formatMoney` too. `lib/ending.ts`'s `plain` (the summary's figures without a code) still rounds, as Flask's `"{:,.2f}"` did. The API's own sentences use the same format.
- **Fonts:** Inter through `next/font`. No Jakarta, because the mark is an image.
- **Link previews (owner, 2026-10-23):** any link to this app, the public share page `/share/...` included, previews in a chat app with one card - the flat Minty cat mark (`Minty/static/img/new_logo.png`) centred on a white 1200x630 PNG: `app/opengraph-image.png` and `app/twitter-image.png` (alt "Minty"), plus `openGraph`/`twitter` in `app/layout.tsx`. The same file is in minty-web, minty-payment-request-web and minty-onboarding-web; `app/__tests__/linkPreview.test.ts` pins its size and sha256, so a new card goes into all four with the new hash. The share page's preview never names the company or shows report data.
- **The `@source` line.** `app/__tests__/packagedStyles.test.ts` guards the `@source` line that makes Tailwind scan the package.

## Tests

| Command            | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`         | Vitest. Covers the proxy, the old `pettycash.` links (`lib/oldLinks.ts`: each kind, with and without a token), the preview label, auth, the hand-offs, the API client (a download and its `Content-Disposition` name included), company addresses (a report's own pages included), the sidebar host, the dashboard's and the wizard steps' rules, the submitted report's (`lib/report.ts`, Edit Details' among them: the reason's and a description's live checks, a receipt's check before it is sent, and what a line's edit sends - only what changed, never an empty supplier or account), publishing to Xero (`lib/publish.ts`: the start, a read every two seconds until the status leaves `publishing`, the 90-read cap, nothing asked after a cancel, how a status ends it - published, partial with its open reasons, failed - a refused start's sentence and `reconnect`, the bar), report history's (`lib/history.ts`: the filters in the address, Flask's pager, the CSV export's query and file name, a row's badge, time and figures, the range calendar's picks), settings' (`lib/settings.ts`: the address, the other tabs' hand-offs, the pickers' filter, what the country Save sends, the catalogue, a method name's live checks, a shared method's rename sentence, Move up / down, view-only), the Xero cards' (`lib/xeroSettings.ts`: Flask's groups and order, an account's "Name - Code", the pickers' filters, the other bank never offered, a contact offered as new, an empty field said only after a refused save and the two banks being one said at once, the fields an API sentence names, the eight keys sent, a new contact in every contact list; the codes' label, search, Select all's three states, at least one ticked, what changed and what is sent), the share link and the public share page (`lib/share.ts`: `<origin>/share/<path>` from the API's path, the path's three parts and its 32-character secret, the catch-all unescaped once, Flask's two refusal sentences by status, the public read trimmed to what the page draws, the badge; `pettyCashPublicFetch` sending no bearer, cookie or referrer and never handing off), the flash and the next-day hand-over, and the four guards (styles, assets, raw colours, no Flask pages). |
| `npm run test:e2e` | Playwright on a 1440 px desktop and a 360 px phone, against local Flask (`e2e/README.md`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

`npm run lint` and `npm run typecheck` complete the gate. CI runs everything but e2e (`.github/workflows/ci.yml`, the shared `next-web.yml@v1`).

## Ported so far (`development`)

`development` is a **pixel-faithful port** of Flask's Petty Cash pages (the user, 2026-10-14):

- Flask's look, kept exactly: its phone card, colours, type, spacing, buttons, modals and toasts.
- The same sections, steps, wording, rules and destinations.

The same pages drawn in minty-payment-request-web's design are on the **`port/prw-look`** branch. The Part 15 redesign comes later, on its own branch.

**How the look is kept exact.** Flask draws with Tailwind v3 (from a CDN) and hex values. This app uses Tailwind v4 and `@minty/shared`'s Part 13 tokens, where the scales differ: `rounded-lg` is 12px, the greys are oklch, and the shadows were renamed. So every value Flask uses is declared once, as `flask-*` theme tokens, in `app/styles/flask-theme.css`, and the ported pages draw only with those. No hex appears in a class, so `__tests__/no_raw_colours.test.ts` still holds. The phone card's widths are Flask's: full width, then 640, 768 and 1024 px.

**Order.** Dashboard, then the report wizard, history, settings and Xero publish, all ported now.

**No Flask pages** (the user, 2026-10-16: "The frontend/HTML in flask will not be used. flask will be an exclusive backend. its frontend must be deleted."). No screen here sends a person to a Flask page. Flask is reached only as a backend, and every Flask address this app builds is in `lib/handoff.ts` (plus the JSON calls in `lib/apiClient.ts`):

- `/handoff/petty-cash-web` - this app's own token (`handoffUrl`);
- `/handoff/minty-web?next=<minty-web path>&entity_id=` - minty-web's pages: the entity list, Subscriptions, My Profile, and the settings tabs Users, Entity & Integration and Modules (`hubUrl`);
- `/entity/<id>/payment-request` and `/entity/<id>/settings/payment-request` - hand-offs that mint the payments app's token and redirect to its home or its settings page (`paymentsUrl`);
- `/logout` (`logoutUrl`);
- an old caller's backend path, passed on unchanged after the host switch (`flaskBackendUrl`, re-checked against `isFlaskBackendPath`; see _Old links after the host switch_).

`__tests__/no_flask_pages.test.ts` fails on any other Flask address in the source. The person is already signed in to Flask, because this app's token came from Flask's login-gated hand-off, so each hand-off is a silent round trip.

### Dashboard: `/entity/<shortid>/<name>/petty-cash`

This is Flask's `entity/entity_dashboard_v2.html`, built from `components/dashboard/` and `components/flask/`. Its rules live in `lib/dashboard.ts`, and it makes one read, `GET /home`.

The page is the same in every element:

- Flask's header: the back chevron, the company's initials, the person's initials and the ≡. The two buttons open the shared sidebar.
- The warning banner, "Today's report is submitted", and Report in Progress / Current balance.
- "Pick up where you left off" with Flask's six-pill stepper. Its labels are 7.6px on a phone, as Flask draws them, which is below the workspace's 12px minimum, deliberately.
- **Continue Report** opens the draft at its own wizard step in this app, by `GET /home`'s `draft.current_section` (Opening when it has none - `sectionStep` in `lib/wizardPages.ts`, the rule history's draft rows use). Flask's went through its resume page.
- Start New Report / View Report.
- Quick Actions.
- The Report Calendar and its legend.
- "Before You Start", "Deposit to Bank" and the non-dismissable "Setup Required".
- The top-right toasts.

Behaviour is Flask's, minus its bugs:

- **One "today".** It is always the server's Hong Kong date. Flask mixed the browser's date, UTC and Hong Kong time.
- **The date rules always run.** Starting a report checks them every time; Flask skipped them after a calendar click.
- **The first report starts on onboarding's start date.** `GET /home`'s `start_date` (`entity_pettycash_settings.start_date`) is the calendar's floor before any report: days before it are shut and the "onboarding date" message names it. With no report and no draft, the calendar opens on its month with it picked, so Start New Report opens Opening on it (once it has come). Flask's floor was the earliest draft, which onboarding no longer seeds; `draft_date` stays the fallback for companies onboarded before the start date existed.
- **After a skipped day the calendar opens on it** (owner, 2026-10-23; `main` only). When yesterday has no report although earlier days do, and no draft is open, the day after the last submitted report - the only day Start New Report accepts - is picked on arrival (`catchUpDay`, `development`'s `gateDay` plus the draft rule), so Start New Report opens it instead of refusing today. The day keeps its red "not submitted" look and the summary names it; tapping today still says "The previous report needs finishing before today's…". `development` has no calendar: its "Finish <day> first" banner does the same job.
- **No report without a currency** (owner, 2026-10-21). While `GET /home`'s `currency_code` is null, "Setup Required" lists "Choose your company's currency" first, as a link to Petty Cash Settings (whose first card is Country & currency), ahead of any missing Xero setting (`setupMissing` in `lib/dashboard.ts`), and Start New Report is refused with the API's sentence ("No currency is selected for this company. Choose one in Petty Cash Settings to start a report.", `startProblem`). The API refuses Opening's save the same way (409, `to: "dashboard"`), which Opening already answers by going to the dashboard and showing the sentence there. Flask let a report start and counted it in "$".
- **The right day is corrected.** The deposit correction targets the day shown in the dialog.
- **The amount field accepts small amounts.** "0.50" can be typed; Flask turned a zero into "-".
- **An empty amount is refused** (owner, 2026-10-26). "Deposit to Bank" says "The deposit amount is still empty. Add the amount to continue." and sends nothing; Flask read an empty field as 0 and reversed the deposit in Xero. A 0 typed on purpose still goes through.
- **Removed:**
  - Flask's always-hidden bank and date fields, and the live Xero read behind them;
  - the "1 user" count, which never counted;
  - the heading overwrite that happened in draft mode.

- **View Report opens the report's own view in this app** (by the day's `id` in `published`), no longer Flask's summary.
- **"Continue to next day report" starts the day here.** The Submitted page leaves the next day for the dashboard (Flask's `autoStartNextDay`, `takeNextDay` in `lib/flash.ts`). The dashboard selects it and runs Start New Report for it, date rules and deposit check included.

- **Every settings link opens this app's settings page** (Entity Settings, Setup Required's Set Up Settings, Before You Start's "Settings → Petty Cash"), whose Country & currency and Xero account mapping cards are what Setup Required is about, and the Xero card what the deposit check is about.

Not ported yet:

- **The subscription notice.**
- **The "Congratulations!" modal.** Flask shows it after the first Xero mapping save (its `?success=true`). This app's first save lands on the dashboard with "Xero account mapping saved." as a toast instead.

### Report wizard, Opening: `/entity/<shortid>/<name>/petty-cash/reports/new/opening?transaction_date=`

This is Flask's `report/opening.html`, at Flask's own address for it. It is built from `components/report/OpeningStep.tsx` and `ReportChrome.tsx` (the report header badge and the "Saving..." overlay), and reads and saves through `GET`/`PUT /reports/opening`.

What it keeps from Flask:

- **The report header:** the "14 OCT" date pill, the initials and the Draft badge.
- **The stepper.** The page is the current step; links follow the draft, and unsaved changes hold them back with Flask's toast.
- **The balances:** the illustration, then Starting Cash Balance, Cash Till Balance and Safebox.
- **"Addition to Cash Drawer".** Every money field here uses `@minty/shared/amountInput` (owner, 2026-10-26): the commas appear as you type, the caret stays on its digit, and leaving the field pads the places ("1,234.5" → "1,234.50"). A 12th whole digit, a third place or a letter is refused, not cut. `lib/currencyInput.ts` keeps only `parseMoney` (an empty field is 0).
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
- **The money fields** (`@minty/shared/amountInput`). A zero shows as an empty field with the "0.00" placeholder.
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
  - "Expense Amount" (`@minty/shared/amountInput`), and "Description".
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
- **Lengths are checked as they are typed** (CLAUDE.md), in the API's words, under the field: a Description over 300 characters ("Keep the description to 300 characters or fewer.", `remarksProblem`) holds Add back and moves to the field; a New Contact name over 150 ("Keep the supplier's name to 150 characters or fewer.", `newContactProblem` in `lib/expenses.ts`) holds Create back. Flask said nothing and the server refused.
- **Every name is text.** Flask writes supplier and account names into its dropdowns as HTML; React escapes them.
- **Left out:** editing a saved line (Flask's page has no way into it), the dead "submit all" path, the receipt reader (`expense_ai.js`, behind a flag), and the read-only view of a submitted report.
- **Known, as in Flask:** Save & Next or Save & Exit with the add card still open leaves the typed expense unsaved, without a warning. Typing does not clear an open toast, which Flask does.

### Report wizard, Bank Deposit: `/entity/<shortid>/<name>/petty-cash/reports/new/deposit?transaction_date=`

This is Flask's `report/deposit.html`, at Flask's own address for it. It is built from `components/report/DepositStep.tsx`, with the arithmetic and the rules in `lib/cash.ts`, and reads and saves through `GET`/`PUT /reports/deposit` (Minty `petty_cash_api/routes/cash.py`, over the service the Jinja page shares, `report/services/cash.py`).

What it keeps from Flask:

- **The report header and the stepper**, with the same unsaved-changes hold and toast.
- **"Deposit to Bank"**, then one card: the illustration, "Current Balance:" (the cash on hand before the deposit) and "Deposit Amount" (the currency code inside, "0.00", the shared money field). A saved deposit comes back grouped.
- **Save & Next** (to Cash Count, in this app) and **Save & Exit**.
- **"Fix Negative Balance"** when the cash on hand is already below zero: Flask's sentence, the figure in brackets (shrunk to one line, as Flask's `fitBalanceText` does) and Opening / Sales / Expenses with their cash in or out. It cannot be dismissed, and like Flask's it covers the whole window. Its frame is shared with Opening's (`ReportChrome.tsx`).

Where the app differs:

- **The limit is the owner's rule (2026-10-15).** A deposit above the cash on hand is said under the field as it is typed: "The deposit can't be more than the cash on hand. Enter HKD 155.00 or less." Save does nothing until it is fixed, and the API refuses it anyway (422 on `bank_deposit`, whose sentence shows on the field). Flask accepted it and only stopped at Cash Count.
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
- **"Use Calculator":** a row per denomination in the company's order (its label, "X", the count - grouped as it is typed, whole numbers, at most 7 digits - and the row's total), "Total Cash Till Balance" and Save, which copies the counts in. Its backdrop covers the whole window and an outside click closes it.
- **Save & Next** (to Ending, in this app) and **Save & Exit**; Flask's toasts ("Please enter description", the unsaved-changes one).
- **"Fix Negative Balance"** when the expected cash is below zero, with Flask's own sentence for this page ("Cash balance cannot be negative, let's go back to") and Opening / Sales / Expenses / Deposit.

Where the app differs (Flask's bugs, and the owner's rules of 2026-10-15):

- **Any difference counts, one cent included.** Flask's page needed more than 0.01; the difference is rounded to the cent as the service rounds it.
- **The difference shown is the one saved.** It is worked out from the counts the calculator applied, plus the safebox. Flask's alert read the calculator's rows while they were still being typed, its Total Cash Count read the applied total, and the server saved a third figure.
- **The calculator's total works.** Flask's Save stripped only "$", so with "HKD" the cash box showed HKD0.00.
- **Each denomination is labelled by the currency code, a space and its `cash_info.cash_name` without the symbol** ("HKD 1,000", "HKD 5" from "$1,000", "$5"; the API sends it as `name`). Flask built "HKD1000" from the face value. Without a name the label falls back to the face value, with coins under 1 named by their value ("HKD 0.50", never Flask's "HKD0").
- **Totals stay on one line.** At a phone's width the Total Cash Count and Total Cash Till Balance figures and the shortage or surplus amount never split mid-number; the label beside a total wraps instead.
- **Counts are whole numbers.** The field takes digits only (a text field with the numeric keypad, not Flask's number field, which took "1.5" and "e"); a count above 1,000,000, the API's limit, is said in its row and Save does not apply it.
- **Escape closes the calculator** (Flask's didn't), and the X is a 44px target.
- **A reason is needed on Save & Next, not on Save & Exit** - now also refused by the API (422 on `discrepancy_reason`). Besides Flask's toast and red box, the sentence under the box says how much and what to do ("The count is HKD 0.01 short. Add the reason to continue."), and "Discrepancy Details" carries the red `*` while a reason is needed. A reason over 300 characters is said as it is typed.
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
- **The link is this app's own page:** `<origin>/share/<path>`, built from the answer's `path` (`<initials>/<date>/<secret>`, `shareUrl` in `lib/share.ts`) on the page's own origin, so a branch preview set shares its own page. The answer's `url` (Flask's old `/Minty_Report/...` page) is not used. An answer without a usable path shows no link: the modal closes with "Something went wrong on our side. Please try again."
- **Publish to Xero** ("Republish to Xero" once it is in Xero), only with `can_publish`. Publishing is described below ("Publish to Xero").
- **Back to Dashboard** ("Redirecting to Dashboard...") and **Continue to next day report** ("Starting next day report..."). The second leaves `next_day` for the dashboard to start, as Flask's `autoStartNextDay` did.

Where the app differs:

- **A refused share says the API's sentence** and closes the modal (a draft: "A draft can't be shared. Submit the day first.").
- **A report reopened since** (`submitted: false`) has nothing submitted to show, so the page opens that day's Ending step instead of saying "Submitted".
- **Content taller than the screen scrolls from its top** (a short phone, text at 200%); Flask's centring cut it off above.

### A submitted report: `/entity/<shortid>/<name>/petty-cash/reports/<report id>/summary`

This is the submitted-report mode of Flask's ORIGINAL `report/ending.html` (Minty `1c25b35^1`, `report/services/ending.py`), at Flask's id address for it. Flask also serves `/reports/summary?transaction_date=`; this app uses the id form. It is built from `components/report/ReportView.tsx`, the summary of `ReportSummary.tsx` (the Ending step's own cards), `ReportActions.tsx` (Share and Delete) and `ReportEdits.tsx` (Edit Details), with its rules in `lib/report.ts`, and reads `GET /reports/<id>` (Minty `petty_cash_api/routes/report.py`). The dashboard's View Report opens it.

What it keeps from Flask:

- **The report header:** the date pill, the initials and the Submitted / Published badge. The chevron goes to the dashboard.
- **The summary**, as on Ending: "Summary" with the currency, Total Sales (against yesterday, the three totals, Show more for each method), Sales History (30 days, the day in red), Total Expenses (the donut and every account), Cash Balance (the till and the safebox), and the shortage or surplus box with its reason. No "Draft report" callout.
- **Share**, then **Delete Report** (red), **Edit Report** (olive) and **Close** (teal). Each shows only when the API's `permissions` allow it (`share`, `delete`, `edit`; Close always), so an older report shows Share and Close, as Flask's did.
- **Edit Report:** `POST /reports/<id>/reopen`, with Flask's toasts ("Converting report to draft...", "Back to draft — opening it for you now."), then this app's Opening step for the day. For a report that has been to Xero, Flask's confirm comes first.
- **Delete Report:** Flask's "Delete Report" modal (Cancel / Delete), "Deleting report...", `DELETE /reports/<id>`, then the dashboard with "That report's deleted.".
- **A report that has been to Xero may be deleted, with a warning first** (the owner, 2026-10-15). The modal adds "It is in Xero": "Deleting it here does not remove its entries in Xero, and publishing this day again adds a second copy. To change the report, use Edit report instead." These are Flask's own modal's words, drawn as Flask's amber warning above the red one. The API's `was_published` decides it.
- **Share:** Flask's Share Report modal, as on the Submitted page.
- **Edit Details** (olive, under Edit Report): Flask's constrained `report_edit` mode, which changes the three details that move no balance. It shows only with the API's `permissions.edit_details` (any submitted report not being published - not only the latest). In the mode the button reads **Done editing** and Close hides, as in Flask. Each edit is one call that answers the whole Daily Report, and the page is drawn again from it - so after an edit to a report in Xero the badge reads Submitted again (Flask takes the report out of Xero on any edit). Flask's success toasts, word for word, only after the API says yes:
  - **The difference reason**, in the shortage or surplus box: cash_count.html's box and "Save changes", `PUT /reports/<id>/difference-reason` `{reason}`, "Your discrepancy reason is saved.".
  - **Addition to Cash Drawer:** the amount (never editable), then opening.html's "Withdrawal from:" Company Bank / Personal (Personal when none was saved, as Flask checked it) and "Save changes", `PUT /reports/<id>/withdrawal` `{withdrawal_type}`, "Your withdrawal source is saved.". Only when the day had an addition.
  - **An expense line:** an "Expenses" card lists the lines as the Expenses step does (no bin); a tap opens Expense Details with expense.html's editor in place of the grey box - Description, Supplier and Account Code (Flask's selects, from the read's `options`), Receipt/Document ("Click to change files", one file) and "Save changes". The receipt and Amount Paid stay as they are; the amount is never a field. `PATCH /reports/<id>/expense-lines/<line id>`, multipart, with **only the fields that changed** (`remarks`, `supplier_id`, `account_id`, `receipt`); a new account renames the line on the server. "Expense updated successfully!" and the editor closes. Escape or a click outside keeps an editor with changes open with Flask's "You have unsaved changes. Please save your changes first."; Close discards them, as Flask's did.
  - **Checked as it is typed** (CLAUDE.md): a reason or a description over 300 characters ("Keep the reason / description to 300 characters or fewer."), a reason emptied while the cash was short or over ("The cash was short, so the reason is still needed. Add the reason to save it."), and a receipt that is not one PDF, JPEG or PNG of 10 MB at most (the Expenses step's sentences), refused before anything is sent.
  - **A refusal (400, 403, 404, 409, 422) is said under its field** in the API's words and nothing changes; a line's refusal goes under the field its sentence names (supplier, account, description, receipt), anything else under Save changes.

Where the app differs:

- **Every refusal keeps the page and says the API's sentence** (400 not the latest, 403, 404, 409 while publishing or a draft). Flask's delete went to the dashboard as if it had worked ("Failed, Redirecting to Dashboard...").
- **Close goes to report history**, as Flask's did.
- **A draft opens its Ending step:** a draft's summary is the wizard's.
- **No stepper.** Flask drew the six steps, all done, each leading to that step's read-only view of the submitted report. Those views are not ported (the steps here open only a draft); Edit Report is the way back into the wizard.
- **Edit Details, where it differs from Flask:**
  - It is on the report's own view. Flask's mode lived on the step pages (Opening, Expenses, Cash Count, reached through the stepper with `?report_edit=true`), and only older reports offered it.
  - "Done editing" stays on the page; Flask's went to report history.
  - The withdrawal shows only when there was an addition; Flask's Opening always drew the radios.
  - Save changes with nothing changed says "Nothing has changed yet. Change a detail to save it." and sends nothing; Flask sent every field each time.
  - The selects offer no empty choice: the API cannot clear a supplier or an account. A line's own supplier or account stays in its list even when it is no longer among the options.
  - There is no Xero warning before editing, as in Flask (its warning was on Edit Report only).
- **Known, shared with every report page:** at 360px the header's centred group (date, initials, badge) runs about 6px under the person's initials with a four-letter company acronym and the longer Submitted / Published badge. Flask's header has the same geometry; `PhoneCard` needs a narrower centre to fix it.

### The public share page: `/share/<initials>/<date>/<secret>`

A shared Daily Report, read by someone outside the company. This is Flask's ORIGINAL `report/ending.html` as a share link drew it (its `is_shared_link` branches, Minty `1c25b35^1`), which Flask served at `/Minty_Report/<initials>/<date>/<secret>/`. Flask is a backend only now, so this app serves it. It is built from `app/share/[...path]/page.tsx` and `components/report/SharedReport.tsx`, with its rules in `lib/share.ts`, and reads `GET {PETTY_CASH_API_URL}/api/petty-cash/v1/public/share/<initials>/<date>/<secret>` with no bearer (`pettyCashPublicFetch`). The Share modal on the Submitted page and on a report's view hands out its address.

What it keeps from Flask:

- **The header with only its middle:** the date pill, the company and the badge (Published, Publish failed or Submitted, from the read's `status_tone` / `status_label`). Flask's empty boxes stand where the chevron and the person's buttons were. There is no stepper.
- **The summary:** the submitted view's own cards (`ReportSummary`): Total Sales, Sales History, Total Expenses, Cash Balance and the shortage or surplus box with its reason. Show more works on each.
- **Nothing to do:** no Share, Delete, Edit Report, Edit Details or Close, no receipt to view, no sidebar and no link of any kind. `components/ui/SidebarShell.tsx` leaves the sidebar out of the page, so even the closed drawer's links are not in it, and `PhoneCard`'s `publicView` reads nothing about the person.
- **Flask's refusals, word for word:** a 404 (and a 400) says "This link doesn't work anymore. Could you ask for a fresh one?", and a 410 says "This link has expired. Could you ask for a fresh one?". Flask flashed them on the company list. Here, with no company list to land on, the sentence stands on the page.

Where the app differs:

- **The company's name, not its initials,** beside the day. The reader is outside the company, so initials would mean nothing to them. A long name is cut with "..." at a phone's width, and the full name is its tooltip. The tab reads Flask's "Report Summary - <company>".
- **An address that is not a share path is refused without asking the API:** the old two-part form, a secret that is not Flask's 32 url-safe characters, an empty or dot part. It gets the 404 sentence.
- **Only what arrives is drawn.** With no `history` the Sales History card is left out. With no `yesterday_total`, no lines or no difference, the cards show Flask's own "none" for each. An answer that is not a report (no day, no sales total, no cash count) gets the house sentence.
- **Any other failure** says the house sentence, and no answer at all says "We couldn't reach Petty Cash. Check your connection, then reload the page."

**The secret is in the address,** so:

- the page carries `<meta name="robots" content="noindex, nofollow">` and `<meta name="referrer" content="no-referrer">`, and the read itself is sent with `referrerPolicy: "no-referrer"`;
- a refusal is chosen by its status alone: neither the API's text nor the address ever reaches the screen, a toast or the console;
- the page logs nothing and the app has no analytics.

The dev server's own request log, and a host's access log, still record the path, as they record every address.

### Report history: `/entity/<shortid>/<name>/petty-cash/reports?start_date=&end_date=&page=`

This is Flask's ORIGINAL `report_history/report_history.html` (Minty `1c25b35^1`, route `report/routes/history.py`), at Flask's own address for it. It is built from `components/history/ReportHistory.tsx` and `RangeCalendar.tsx`, with its rules in `lib/history.ts`, and reads `GET /reports` (Minty `petty_cash_api/routes/history.py`) with the address's dates and page only: ten a page and no status, as the original offers. The dashboard's View History, the sidebar's Reports and a report view's Close open it.

What it keeps from Flask:

- **The header:** the chevron (to the dashboard), the company's initials, the person's initials and the ≡.
- **The date filter**, fixed under the header: Start Date and End Date ("DD/MMM/YYYY", read-only) open Flask's range calendar - one month on a phone, two side by side from 640px across both fields; a click picks the start, the next the end (in order), the next starts again; one day picked is that day at both ends; the range in teal, the days between in pale teal, today ringed. Its footer: **Clear** (back to every report) and **Search Report** ("Please choose or enter a valid date range" / "Start date cannot be after end date"). Enter in a field searches too. A page with dates says Flask's "Filter applied".
- **CSV**: `GET /reports/export.csv?start_date=&end_date=` with the bearer (`pettyCashDownload` in `lib/apiClient.ts`, `csvQuery` in `lib/history.ts`), for the dates in the fields; greyed until both are chosen, the start on or before the end (Flask's gate). "Exporting..." while it runs, then the file is saved under the name its `Content-Disposition` gives (a blob on a temporary `<a download>`) and "Your CSV export is on its way!"; a refusal (422 `{error}`) shows its sentence as a toast and saves nothing. Cross-origin, the browser shows `Content-Disposition` only when the API lists it in `Access-Control-Expose-Headers`; without it the file falls back to the API's own pattern, `reports_<start>_to_<end>.csv` (`csvFileName`).
- **"Report Results":** a card per day, newest first - the date and the weekday in its circle (yellow on a weekend), Sales (green) and Expenses (red) as Flask's `amount()` writes them ("-" for nothing, smaller as the figure grows; with no currency the figure alone sets the size and "(No currency selected)" wraps under it), the badge (Published, Publish failed, Draft, Submitted - a publish under way reads Submitted, as the original drew it), the time in Hong Kong by Flask's rule (when it went to Xero; else when it was submitted; for a draft, when the day was started, which is also the fallback when either time is missing - the API's `created_at`) and "by <first name>".
- **A failed publish's reasons:** the badge's ⓘ and Flask's dark "Publish issues:" box, a cross per open reason and a resolved one struck through in green, on hover as in Flask.
- **The ⋮ menu**, one open at a time: **Edit** and **Delete** (only the latest report, never a draft - the API's `permissions`), **View**, and **Publish** / **Republish** (with `can_publish`; greyed on a draft, "Please finish the report before publishing"). The chevron is View too.
- **Flask's pager** when there is more than a page: "Showing 11 to 20 of 23 reports" ("11-20/23" on a phone), Previous, the first two and last two pages and those beside the current one with "..." between, Next.
- **The filters and the page live in the address**, so Back and a reload keep them.

Where the app differs:

- **View** opens the report's view in this app. A draft opens its own wizard step here, by the row's `current_section` (Opening when it has none, Flask's `resume_report` rule; `draftStep` in `lib/history.ts`, which reads `sectionStep` in `lib/wizardPages.ts`); Flask's went through its resume page.
- **Edit** is the report view's (`useEditReport` in `ReportActions.tsx`): Flask's confirm for a report that has been to Xero, `POST /reports/<id>/reopen`, then this app's Opening.
- **Delete** is the report view's modal, with the owner's "It is in Xero" warning when `was_published`; `DELETE /reports/<id>`, then the list is read again in place with Flask's "That report is deleted." (Flask reloaded the page). A refusal says the API's sentence and keeps the list.
- **Publish / Republish** is this app's (below, "Publish to Xero"); afterwards the list is read again in place, where Flask reloaded the page.
- **The empty state shows.** Flask's "No reports found" was in the page but never revealed.
- **Refusals:** a bad filter in the address (the API's 422) says its sentence; any other failure says so with **Try again**.
- **The calendar is drawn here**, as Flask themed Flatpickr (this app carries no Flatpickr): its month and year are text, not Flatpickr's month dropdown and year field, and there is no hover preview of a range. Clear and Search Report are 44px on a phone.
- **A tap shows a failed publish's reasons:** Tailwind v4 applies hover only where there is one, so on a phone the badge is a button that opens and closes them (and keyboard focus shows them).
- **Layout, at a phone's width** (the only layout change): below 640px Sales sits over Expenses - side by side, Flask's row ran past its card with a "Publish failed" badge or a six-figure amount. The amount columns keep Flask's widths as minimums, so a long figure widens its column instead of running into the next one; the page numbers wrap on the 640px card, where Flask's ran off its edge. The ⋮, the chevron and the page links reach 44px for a finger without moving Flask's layout.
- **Flask's own sizes below the workspace rules, kept:** the 8-10px dates, figures and times on a phone, the 9px badge and the calendar's 42px days.
- **"Edit" on an older report is not in the menu.** Flask's opened the summary's "Edit Details" mode; here it is View, then Edit Details on the report's view.

### Publish to Xero: the Submitted page and report history

This is the publishing of Flask's ORIGINAL `report/submitted.html` and `report_history/report_history.html` (Minty `1c25b35^1`), on the two pages that offered it. It is built from `components/report/Publish.tsx` (the confirm, the overlay, the reconnect dialog and `usePublish`), with the polling and its outcomes in `lib/publish.ts`. It starts with `POST /reports/<id>/publish` (202) and asks `GET /reports/<id>/publishing-status` (Minty `petty_cash_api/routes/report.py`, `xero/services/publish_start.py`).

What it keeps from Flask:

- **The republish confirm, each page's own words**, Flask's "Republish Report" with Cancel / Confirm:
  - **Submitted page:** for a report in Xero ("Republish to Xero"), and for one edited after a publish (it reads "Publish to Xero"), as the outcome's `xero.was_published` says (Flask's `was_previously_published`, decided by the API): "This report was previously published. This action may create duplicate entries in Xero." and "Do you wish to continue?".
  - **Report history:** Republish (a report in Xero, or a failed publish) always asks "Still want to go ahead?", and adds "I've already published this report — republishing may create duplicates in Xero." only for a report fully in Xero (a partly published one is re-sent selectively). Publish asks, with that warning, for a report edited after a publish (`was_published`).
  - A report never in Xero publishes at once.
- **The full-screen overlay:** the spinner, "Publishing to Xero..." ("Republishing to Xero..." after the confirm), the bar and its percentage (5% "Initiating...", 10% "Sending request to Xero...", 15%, then a step towards 85% at each read) and "Please do not close or navigate away.".
- **The polling:** every 2 seconds until the status is no longer `publishing`, at most 90 times (three minutes) - Flask's interval and cap. A dropped connection or a server error keeps asking, as Flask's did.
- **The outcome**, after the bar shows full for 600 ms ("Published successfully!" / "Partially published"), as Flask's toast:
  - published: "Report Successfully Published" / "Report Successfully Republished" on the Submitted page, which is then read again, so it says "Report Published to Xero / Successfully!" and offers Republish; "Report published to Xero successfully!" on history;
  - failed with open reasons: "Xero publish is done partially due to <the reasons, joined by ;>" (a warning);
  - failed with none: "Publishing to Xero failed. Please try again.".
- **A refused start says the API's sentence** (settings incomplete, a system account on a line, a draft, already publishing, no right, no report) as Flask's toast: a warning for a 409 on the Submitted page, an error everywhere else. Nothing is polled.

Where the app differs:

- **Xero must be connected again** (`reconnect: true`): the sentence comes in a "Reconnect Xero" dialog with Close and **Reconnect Xero in Entity & Integration**, a full-page link to minty-web's Entity & Integration tab through Flask's `/handoff/minty-web` (`settingsTabUrl` in `lib/settings.ts`), where connecting happens. Flask only toasted it.
- **After the cap** the overlay says "Still publishing to Xero" with Flask's "Publishing is taking longer than expected. Please check again later." and offers **Check again** (it watches the same publish for another round and never starts a second one) and Close. Flask hid the overlay behind the toast.
- **Nothing is left polling.** Leaving the page, in the app or not, stops the reads; Flask's interval ran until the page unloaded.
- **Each read waits for the last answer**, then two seconds, so a slow answer never stacks reads.
- **A failed or put-back answer ends it.** A status back at `unpublished` ends it as failed (Flask kept asking until its cap); a refused read (403, 404) ends it with the API's sentence.
- **The Submitted page says a partial publish's reasons too.** Flask's Submitted page said only "Publishing to Xero failed"; history's toast, with the reasons, is used on both.
- **No reload.** The Submitted page reads its outcome again and history its list; Flask reloaded the page and showed the toast from `sessionStorage`.
- **A submitted report's own view has no publish**, as Flask's `ending.html` had none.

### Petty Cash Settings: `/entity/<shortid>/<name>/settings/petty-cash`

This is Flask's ORIGINAL `entity/settings_entity.html`, with `partials/electronic_delivery_section.html`, `partials/xero_account_mapping_cards_classic.html`, `partials/xero_mapping_classic_script_fragment.html` and `static/js/petty_cash_settings.js` (Minty `1c25b35^1`), at Flask's own address for it. It is built from `components/settings/PettyCashSettings.tsx` (the page and Country & currency), `SalesMethodsCard.tsx` (Electronic and Delivery), `XeroCards.tsx` (Xero account mapping and Petty Cash Account Code) and `SettingsParts.tsx` (the card, the picker, the confirm dialog, the busy overlay), with its rules in `lib/settings.ts` and `lib/xeroSettings.ts`. It reads `GET /settings` and `GET /settings/xero`, and writes through `PUT /settings/country`, `POST`/`PUT`/`DELETE /sales-methods...`, `PUT /settings/xero/mapping`, `PUT /settings/xero/account-codes` and `POST /suppliers` (Minty `petty_cash_api/routes/settings.py`). The dashboard's Entity Settings, its two modals' settings links and the sidebar's Settings open it.

Flask drew this page in minty-web's look (Tailwind v4 values written out in `settings_page.css`), not in the phone card, so its greys and reds have their own `flask-set-*` tokens in `app/styles/flask-theme.css`.

What it keeps from Flask:

- **The header:** ‹ Back and "Settings", the company's icon and name, the person's initials (My Profile) and the ≡ (the shared sidebar).
- **The settings tabs:** Users, Entity & Integration, **Petty Cash Settings** (this page), Payment Request Settings (when the token says Payments is on) and Modules. Users, Entity & Integration and Modules are minty-web's pages (`/entity/<shortid>/<name>/settings/<tab>`) through Flask's `/handoff/minty-web`; Payment Request Settings is the payments app's own settings page through Flask's `/entity/<id>/settings/payment-request` hand-off, which mints that app's token (`settingsTabUrl` in `lib/settings.ts`).
- **The view-only notice** ("You have view-only access to these settings…") when the person may change nothing. A card they cannot change is grey and its controls are off, as in Flask.
- **Country & currency:** "Select Country" and "Select Currency", Flask's searchable pickers (focus lists everything, typing filters, "No matches", ↑/↓/Enter/Escape, leaving the box puts the choice back), then **Save Changes** ("Saving…" and Flask's busy overlay, "Saving changes…").
- **Electronic and Delivery**, a card each: the methods in order; the name to click for a rename (Enter or leaving the box saves, Escape puts it back); the ⋮ with Move up, Move down and Delete; **Add New Method** with the catalogue picker ("No matching payment method found", "+ Other (type a new name)" opening the Name box) and Cancel / Add.
- **Delete asks first**, in Flask's minty-web dialog: "Delete Electronic Method", 'Are you sure you want to delete "<name>"? This action cannot be undone.', Go back / Delete.
- **Xero account mapping:** Flask's five groups in its order - Petty Cash Account, Deposit Bank Account, Cash Sales (account code, contact), Director Personal Account (account code, Director or Responsible person) and Discrepancy - Other Expense (account code, contact) - each picker under Flask's line ("Select Petty Cash bank account from Xero", ...), showing the saved choice as Flask did ("Petty Cash - 090", a contact by name). The pickers are Flask's searchable ones: an account by name or code, each row the name with its code under it, the bank chosen for the other bank field never offered. The Discrepancy Bank Account is not shown: it mirrors the Petty Cash Account and the API sets it. Then **Save Changes**.
- **A new contact** from any contact picker: "+ Add '<name>' as a new contact" (or "No Xero contact found" and "+ Add as a new contact"), Flask's New Contact box with the name in it, Cancel / **Create** ("Creating contact…", `POST /suppliers`, "That contact's added!"), and the new contact chosen - and offered in the other contact pickers.
- **Petty Cash Account Code** (after Delivery, as in Flask): the search ("Search account code"), "Select all" for the rows shown (mixed when some are ticked), each row "<code> - <name>" with Flask's tick, "No codes match your search.", "No account codes yet - ...", then **Save Changes**. At least one stays ticked: unticking the last says "Pick at least one account code." beside Save at once and Save goes off; the API refuses it too.
- **Xero isn't connected** (`live` false: never connected, disconnected or a dead token): both Xero cards keep their heading and show Flask's notice, "Xero isn't connected. Connect it in Entity & Integration to set these up.", its link a full-page one to minty-web's Entity & Integration, where Xero is connected, through Flask's `/handoff/minty-web` (`settingsTabUrl`).
- Each card folds under its heading.

Where the app differs:

- **The Xero cards save on their own.** Flask's one Save Changes saved the mapping and the ticks with everything else; here each Xero card has its own Save Changes (`PUT /settings/xero/mapping`, `PUT /settings/xero/account-codes`), on only once something changed. The answer is drawn and its sentence shown ("Xero account mapping saved.", "Account codes saved."). A refusal says the API's sentence as Flask's error toast and keeps the choices; a 422 also marks the fields it names in red ("Choose the <label>.", "Choose the <label> from the list.", the two banks being one). A 409 (not live, or not synced from Xero yet) says why.
- **The first mapping save goes to the dashboard** (`first_save` in the answer), as Flask's did, with its sentence as the toast there.
- **The Xero read is asked once per page load** (it asks Xero on the server), apart from the other cards: they show at once, the Xero cards show Flask's skeleton until it answers, and a failed read says the API's sentence in both cards with Try again (none for a 403).
- **The mapping's own rules as it is filled in** (CLAUDE.md): nothing is red on open; a Save refused for empty fields says "Choose the <label>." under each, focusing the one field, or, with two or more, a summary at the top of the card that takes focus and links to each. The two banks being one is said at once. Flask toasted "Please select: ...". The pickers carry `aria-required` and a screen-reader "(required)"; Flask's mapping drew no red asterisks, so neither does this card.
- **A cashier sees the Xero cards read-only:** the choices and ticks, the pickers and ticks off, no Save (Flask showed a greyed one), no "+ Add" offer; the code search still works.
- **Left out:** Flask's "I couldn't refresh these lists from Xero just now" note (the API does not say when its refresh failed) and the account number under a bank (the API sends a bank's Xero code, not its masked number).
- **Each change is saved at once.** Flask held every change for one Save Changes at the bottom. The API takes one change a call, so an add, a rename, a move or a delete goes as it is made, the list is drawn from the API's answer, and its sentence shows as Flask's success toast ("Octopus added.", "Name saved.", "Order saved.", "Method removed. Reports that used it keep their amounts."). A refusal (403, 404, 409, 422) shows the API's sentence and keeps what was there. Save Changes sits in the Country & currency card, because that card is all it saves.
- **The country goes alone.** A changed country is sent without the currency, so it brings its own (the API's rule); a currency picked by hand goes too. Flask posted both, so a new country kept the old currency.
- **A name's own rules as it is typed** (CLAUDE.md): over the API's limit - 74 characters for a new method (its value name adds "_sales" within 80), 80 for a rename ("That name is too long. Keep it to 74 characters or fewer.", `ADD_NAME_MAX` / `RENAME_NAME_MAX`) - or already on that list in any case ("visa is already on the list."), said under the Name or rename box. An Add with no name says "The method's name is still empty. Type a name to add it." under the box. Flask only toasted, and checked names across both lists; the API checks one type's list, and so does the page.
- **A shared method says so at once.** A method another company has too (`shared` in the read) cannot be renamed (the API's 409), so clicking its name opens no box and says under it: "Other companies use Visa too, so it can't be renamed here. Delete it and add a new method instead." Flask let the person type, then refused on Save.
- **Back goes to the dashboard.** Flask's went back to whatever page came before the settings area.
- **A person who may not see the sales methods** (no `view_sales_methods`) is told so in each card.
- **Left out:** Flask's "Leave without saving?" guard (only the two pickers can hold an unsaved change now) and its reveal of a collapsed card on a refused save.

## Not here yet

- **Connecting Xero** stays on Entity & Integration (Flask's address, which hands over to the app that holds it).
- **PR previews and the Vercel project** belong to the infra step (Step 5), which is being re-planned. That is why there is no `preview.yml` yet.
