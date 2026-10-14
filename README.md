# minty-petty-cash-web

Petty Cash's front end: the daily closing, the reports and the cash of a company. It is a Next.js 16 app with Tailwind v4, built on `@minty/shared` (tokens, sidebar, primitives).

```
cp .env.example .env.local
npm install
npm run dev          # http://localhost:3010
```

You enter the app through Minty: open a company's Petty Cash there, or go straight to `/` and Flask's `/handoff/petty-cash-web` signs you in.

| | |
|---|---|
| `npm run lint` / `npm run typecheck` / `npm test` | the per-commit gate (CI runs these and a build) |
| `npm run test:e2e` | Playwright, desktop and a 360 px phone, against local Flask (`e2e/README.md`) |

How it signs in, which backends it calls and what it holds: `docs/features/petty-cash-web.md`. The workspace rules are in `C:\Github\CLAUDE.md`.
