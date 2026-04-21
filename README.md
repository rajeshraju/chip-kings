# Chip Kings

A modern, single-file web app for settling poker games. Add players, their winnings/losses, and expenses — get the minimum set of payments that closes out the game. Save games to a local reports archive for later review.

## Features

- **Settlement calculator** — greedy min-transaction algorithm that nets everyone against the group average
- **POT handling** — dedicated POT row with auto-aggregated expenses from all players
- **Local reports repository** — save calculated games to browser localStorage; view, reload, delete, or export as JSON
- **Auto-draft** — current player list persists across refreshes
- **Dark / light theme** — toggle in the header; preference persisted
- **Mobile-first** — responsive layout, iOS-safe inputs, 44px touch targets
- **Zero dependencies** — everything in a single `index.html`; fonts loaded from Google Fonts

## Usage

1. Open [`index.html`](index.html) in any modern browser — no build step, no server required.
2. Add players via the quick-select dropdown or by typing a name, plus their winnings/losses and optional expenses.
3. Optionally add a POT entry (for house cuts, shared pools, etc.) — its expenses auto-sum from player expenses.
4. Click **Calculate Payments** to see the settlement instructions.
5. Click **💾 Save to Reports** to archive the game. Switch to the **Reports** tab to browse history.

## Data model

Players are `{ name, earnings, expenses }`. Net is:

- Regular player: `earnings + expenses` (expenses add to what they're owed)
- POT: `earnings − expenses` (expenses reduce the pot)

The calculator computes each player's difference from the average net and matches largest creditor with largest debtor until everyone is within $1.

## Storage

All data lives in the browser's `localStorage` under these keys:

| Key | Contents |
| --- | --- |
| `chip-kings-reports` | Array of saved game reports |
| `chip-kings-draft` | Current in-progress player list |
| `chip-kings-theme` | `"dark"` or `"light"` |

Use **⬇ Export** on the Reports tab to download all reports as JSON for backup.

## Deployment (Vercel)

This repo is configured to deploy to Vercel as a static site. `index.html` at the root is served as the default page; [`vercel.json`](vercel.json) enables clean URLs and basic security headers.

**Option 1 — Git integration (recommended)**

1. Push this repo to GitHub / GitLab / Bitbucket.
2. On [vercel.com](https://vercel.com), click **Add New → Project** and import the repo.
3. Accept defaults (no framework preset, no build command, output = root). Click **Deploy**.
4. Subsequent pushes to `main` redeploy automatically.

**Option 2 — Vercel CLI**

```bash
npm i -g vercel
vercel           # first run: follow prompts to link the project
vercel --prod    # deploy to production
```

## Tech

Plain HTML, CSS, and vanilla JS. Fonts: Inter, Space Grotesk, JetBrains Mono.
