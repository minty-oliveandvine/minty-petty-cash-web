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

## Not here yet

- **The other pages.** The report wizard, history, the report summary, settings and Xero publish are next, in that order.
- **PR previews and the Vercel project** belong to the infra step (Step 5), which is being re-planned. That is why there is no `preview.yml` yet.
