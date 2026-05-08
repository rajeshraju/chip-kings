# Chip Kings

Poker settlement calculator with saved games, reconciliations, a running pot ledger, and a view-restricted archive. Next.js + Tailwind, deployed on Vercel with Vercel Blob for persistent storage.

## Features

- **Settlement calculator** (public) — add players, chips taken/left, winnings/losses, and expenses
- **Game dates** — games persist an explicit `gameDate` so editing historical games does not depend on UTC timestamp parsing
- **POT handling** — dedicated POT row with auto-aggregated player expenses and a running per-player pot ledger
- **Reports** (auth-gated) — save games to a persistent archive; view, edit, delete, import/export JSON, and export PDFs
- **Reconciliations** — combine saved games into settlement instructions; track paid rows and update pot balances for payments from/to POT
- **YTD / Payments / Pot views** — period summaries, outstanding payment tracking, and pot ledger reporting
- **Role-based auth** — admin / editor / viewer roles; first admin seeded from env vars
- **Admin panel** (`/admin`) — manage users, players, game defaults, initial pot balances, browser cache, and reset data files
- **Dark / light theme** — header toggle, persisted in browser storage
- **Mobile-first** — 44px touch targets, iOS-safe inputs

## Getting started

```bash
npm install
cp .env.local.example .env.local
# Generate a password hash and copy it into .env.local
npm run hash -- "your-password"
# Generate a JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The calculator is public. Visit `/login` and then `/reports` to access the archive. First-time use: the admin account is seeded from the `AUTH_USERNAME` / `AUTH_PASSWORD_HASH` env vars on first login; after that, manage users at `/admin`.

## Roles

| Role | Calculator | Save games | View reports | Edit/delete reports | Admin settings |
| --- | --- | --- | --- | --- | --- |
| **admin** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **editor** | ✓ | ✓ | ✓ | ✓ | — |
| **viewer** | ✓ | — | ✓ | — | — |

The calculator itself is public (anyone can run numbers locally). Roles only gate report persistence and user management.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `AUTH_USERNAME` | yes | Username for the seeded admin account (bootstrap only) |
| `AUTH_PASSWORD_HASH` | yes | bcrypt hash of the admin password (`npm run hash -- <pw>`) |
| `AUTH_JWT_SECRET` | yes | 32+ char random string used to sign session cookies |
| `BLOB_READ_WRITE_TOKEN` | prod | Auto-populated when you attach Vercel Blob to the project |

After the first admin user is created in the user store, `AUTH_USERNAME` / `AUTH_PASSWORD_HASH` are only used if the user store is empty (seed bootstrap). Day-to-day credentials live in the user store.

> **Heads up — `$` escaping in `.env.local`:** bcrypt hashes contain `$` characters which Next.js's dotenv loader treats as variable references. In `.env.local`, escape each `$` with a backslash (e.g. `\$2a\$10\$…`). On Vercel's env var UI, paste the raw value with no escaping.

## Deployment (Vercel)

1. Push this repo to GitHub / GitLab / Bitbucket.
2. On [vercel.com](https://vercel.com), **Add New → Project** and import the repo. Next.js is auto-detected.
3. **Storage** tab → **Create Database** → **Blob**. Attach to this project. This populates `BLOB_READ_WRITE_TOKEN` automatically.
4. **Settings → Environment Variables** → add `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `AUTH_JWT_SECRET`.
5. Redeploy. The archive at `/reports` is now gated; the calculator at `/` remains public.

## Architecture

```
app/
  page.tsx               Calculator (public; role passed if signed in)
  login/page.tsx         Login form
  reports/page.tsx       Reports, payments, pot ledger (gated; any role can read)
  ytd/page.tsx           Year / quarter / month summaries (gated)
  admin/page.tsx         Users, players, settings, cache, resets (admin only)
  api/auth/…             login, logout, me
  api/reports/…          list/create/update/delete games; import JSON
  api/reconciliations/…  create/edit/complete/undo reconciliations
  api/players/…          Player roster CRUD
  api/settings/…         Game defaults
  api/admin/…            Admin reset + pot initialization
  api/users/…            Admin-only user CRUD
components/
  Calculator.tsx         Interactive calculator (client; hides save for viewers)
  ReportsView.tsx        Saved/archived games + reconciliation UI
  PaymentsView.tsx       Outstanding/paid payment tracking
  PotView.tsx            Running pot ledger
  YtdView.tsx            Period summaries
  UsersManager.tsx       Admin user management
  PlayersManager.tsx     Admin player roster
  SettingsManager.tsx    Defaults, pot initialization, cache, resets
  LoginForm.tsx          Client-side login form
  Nav.tsx, ThemeToggle.tsx, Toaster.tsx, PlayerRow.tsx, ResultsView.tsx
lib/
  calc.ts                Settlement algorithm (pure)
  dates.ts               App timezone-safe date formatting / game-date helpers
  session.ts             JWT helpers (Edge-safe, no bcrypt)
  auth.ts                bcrypt + cookie + role guards (Node runtime)
  users.ts               User store (local FS / Vercel Blob)
  players.ts             Player roster store (local FS / Vercel Blob)
  storage.ts             Games store (local FS / Vercel Blob)
  reconciliations.ts     Reconciliation store (local FS / Vercel Blob)
  pot.ts                 Pot ledger store (local FS / Vercel Blob)
  settings.ts            Admin settings store (local FS / Vercel Blob)
  types.ts               Shared types incl. Role + ROLE_PERMISSIONS
middleware.ts            Edge middleware: guards /reports/*, /ytd/*, /admin/*
public/
  legacy.html            The original single-file app, preserved at /legacy.html
```

### Auth

- Login hits `/api/auth/login`, which bcrypt-compares against the stored user (seeding the first admin from env vars if the user store is empty).
- On success, a `jose`-signed JWT is set as an httpOnly cookie (`ck_session`, SameSite=Lax, Secure in prod, 7-day TTL). The payload carries `userId`, `username`, and `role`.
- `middleware.ts` (Edge) verifies the JWT on `/reports/*`, `/ytd/*`, and `/admin/*` and redirects unauth users to `/login?next=…`. `/admin/*` also requires `role === "admin"`.
- API routes re-verify in the Node runtime via `getSession()`, which re-reads the user from the store on each request (so deletions / role changes take effect immediately, without waiting for the JWT to expire).
- `requireCanWrite()` and `requireAdmin()` helpers gate write / admin API routes with a typed `AuthError`.

### Storage

Store modules pick a backend based on whether `BLOB_READ_WRITE_TOKEN` is set:

- **Unset (local dev / self-host):** JSON files under `data/` on local disk.
- **Set (Vercel production):** single JSON blobs on Vercel Blob.

Current stores:

| Module | Local file | Blob path |
| --- | --- | --- |
| `lib/storage.ts` | `data/games.json` | `games/games.json` |
| `lib/reconciliations.ts` | `data/reconciliations.json` | `reconciliations/reconciliations.json` |
| `lib/pot.ts` | `data/pot.json` | `pot/pot.json` |
| `lib/players.ts` | `data/players.json` | `players/players.json` |
| `lib/settings.ts` | `data/settings.json` | `settings/settings.json` |
| `lib/users.ts` | `data/users.json` | `users/users.json` |

Writes are whole-file rewrites, fine for hundreds of games / dozens of users. Swap the module for a real DB if you outgrow it.

`lib/storage.ts` still has a one-time legacy read fallback for `data/reports.json` / `reports/reports.json`, but new writes go to `games.json` / `games/games.json`.

### Admin Settings

The Settings tab in `/admin` includes:

- **Game defaults:** initial chips taken and chip increment step.
- **Initialize pot balances:** wholesale replace the pot ledger from current roster values.
- **Clear cache:** clears only browser-local Chip Kings state on the current device, including drafts, view preferences, theme preference, legacy paid-checkbox caches, session storage, and Cache Storage. It does not delete server data.
- **Reset data:** admin-only destructive reset for games, reconciliations, or pot ledger data files.

### Game Dates

Reports persist both `createdAt` (when the record was saved) and optional `gameDate` (`YYYY-MM-DD`, when the game was played). The calculator uses `gameDate` when editing; older records without `gameDate` infer the date from titles like `May 3 @ Rajesh` before falling back to the app timezone date.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run hash -- <pw>` | Print a bcrypt hash of `<pw>` for `AUTH_PASSWORD_HASH` |

## Tech

Next.js 14 (App Router), React 18, TypeScript, Tailwind, `jose`, `bcryptjs`, `@vercel/blob`.
Fonts: Inter, Space Grotesk, JetBrains Mono.
