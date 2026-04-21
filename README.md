# Chip Kings

Poker settlement calculator with a view-restricted reports archive. Next.js + Tailwind, deployed on Vercel with Vercel Blob for persistent report storage.

## Features

- **Settlement calculator** (public) — add players, winnings/losses, and expenses; get the minimum set of payments
- **POT handling** — dedicated POT row with auto-aggregated player expenses
- **Reports** (auth-gated) — save calculated games to a persistent archive; view, delete, and export as JSON
- **Role-based auth** — admin / editor / viewer roles; first admin seeded from env vars
- **Admin panel** (`/admin`) — create users, reset passwords, change roles
- **Dark / light theme** — header toggle, persisted in localStorage
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

| Role | Calculator | Save reports | View reports | Delete reports | Manage users |
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
  reports/page.tsx       Reports archive (gated; any role can read)
  admin/page.tsx         User management (admin only)
  api/auth/…             login, logout, me
  api/reports/…          GET list (any) / POST create (editor+), GET/DELETE one
  api/users/…            Admin-only user CRUD
components/
  Calculator.tsx         Interactive calculator (client; hides save for viewers)
  ReportsView.tsx        Reports list + modal (client; hides delete for viewers)
  UsersManager.tsx       Admin panel UI (create/edit/delete users)
  LoginForm.tsx          Client-side login form
  Nav.tsx, ThemeToggle.tsx, Toaster.tsx, PlayerRow.tsx, ResultsView.tsx
lib/
  calc.ts                Settlement algorithm (pure)
  session.ts             JWT helpers (Edge-safe, no bcrypt)
  auth.ts                bcrypt + cookie + role guards (Node runtime)
  users.ts               User store (local FS / Vercel Blob)
  storage.ts             Reports store (local FS / Vercel Blob)
  types.ts               Shared types incl. Role + ROLE_PERMISSIONS
middleware.ts            Edge middleware: guards /reports/* + /admin/*
public/
  legacy.html            The original single-file app, preserved at /legacy.html
```

### Auth

- Login hits `/api/auth/login`, which bcrypt-compares against the stored user (seeding the first admin from env vars if the user store is empty).
- On success, a `jose`-signed JWT is set as an httpOnly cookie (`ck_session`, SameSite=Lax, Secure in prod, 7-day TTL). The payload carries `userId`, `username`, and `role`.
- `middleware.ts` (Edge) verifies the JWT on `/reports/*` + `/admin/*` and redirects unauth users to `/login?next=…`. `/admin/*` also requires `role === "admin"`.
- API routes re-verify in the Node runtime via `getSession()`, which re-reads the user from the store on each request (so deletions / role changes take effect immediately, without waiting for the JWT to expire).
- `requireCanWrite()` and `requireAdmin()` helpers gate write / admin API routes with a typed `AuthError`.

### Storage

Both `lib/storage.ts` (reports) and `lib/users.ts` (users) pick a backend based on whether `BLOB_READ_WRITE_TOKEN` is set:

- **Unset (local dev / self-host):** `data/reports.json` + `data/users.json` on local disk (gitignored).
- **Set (Vercel production):** single blobs at `reports/reports.json` + `users/users.json` on Vercel Blob.

Writes are whole-file rewrites, fine for hundreds of games / dozens of users. Swap the module for a real DB if you outgrow it.

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
