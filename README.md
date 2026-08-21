# LeadFlow — Lead Management CRM

A full lead management CRM built for a real-estate sales team: role-based
admin/employee access, spreadsheet import (built for a Facebook/Meta Lead Ads
export, but any column mapping works) with an optional two-way Google Sheets
sync, a customizable spreadsheet export, dashboards for both admin and
employee, and a handful of workflow features aimed at a real sales team's
day-to-day — reassigning leads that get rejected, spotting the same person
submitting a lead form more than once, tap-to-call/tap-to-email, and so on.

This is a portfolio copy of a project built for a real client — company
branding, real data, and deployment secrets have been stripped out. The code
itself (and this README) describes the real, shipped feature set.

## Stack

- **Backend:** Node.js + Express, PostgreSQL (via `pg`, no ORM — plain
  parameterized SQL in the route/service files), JWT auth in an httpOnly
  cookie, `bcryptjs` for passwords, `xlsx` (SheetJS) + `multer` for
  spreadsheet upload/export, `googleapis` for the optional Google Sheets
  sync, `node-cron` for the scheduled import.
- **Frontend:** React + Vite + Tailwind CSS. No component library or chart
  library — the dashboard's bar/donut/split-bar charts are hand-built SVG,
  following a deliberate categorical-color + accessibility methodology
  (fixed hue-per-category order, a legend for every multi-series chart, a
  visible gap between segments) rather than picking colors by eye.
- **Tests:** vitest + supertest, run against `pg-mem` (an in-memory
  Postgres-compatible engine) so the suite needs no real database.

## Features

**Auth & roles**
- JWT session in an httpOnly cookie. Admin manages employees (create,
  deactivate, reset password) and sees everything; an employee sees and can
  only edit their own assigned leads. Enforced server-side, not just hidden
  in the UI.

**Getting leads in**
- **Spreadsheet import** (`.xlsx`/`.xls`/`.csv`) with a configurable column
  mapping (`server/src/config/sheetMapping.js`) — out of the box, matches a
  Facebook/Meta Lead Ads export. Handles the real-world mess spreadsheets
  arrive in: phone numbers Excel mangled into scientific notation, dates in
  either day-first or month-first convention, legacy status/priority labels
  from an older scheme.
- A unique key (`FirstName-City-last2digitsOfPhone`) de-dupes leads across
  repeated exports — the same person filling out the same ad's form twice
  updates one row, not two.
- **Recurring-lead detection**: if that same key shows up again with a
  genuinely different submission date (not just the same file re-uploaded),
  a counter increments and the lead is flagged and filterable — that's a
  lead worth re-targeting, not a duplicate to ignore.
- Optional **live Google Sheets sync** (two-way): import on a timer, and
  every CRM edit writes back to the source row.
- A one-time **historical import** path: a file with `Status`/`Priority`/
  `Notes`/`Assigned`/`Previously Assigned` columns already filled in seeds
  all of that on creation — for migrating years of an existing spreadsheet
  in one upload, "Assigned" text matched to employees by name or email.
- An explicit **"sync into existing leads too"** opt-in for re-uploading a
  team's ongoing master spreadsheet as the source of truth, without it
  silently overwriting live work by default on every re-upload.

**Getting leads out**
- A **spreadsheet export** with a column picker — the admin chooses exactly
  which of ~20 fields to include, in a modal, rather than always getting a
  fixed set. Respects whatever filters are active on the page (a "rejected
  leads only" shortcut is built into the export modal), and an exported file
  can be edited and re-uploaded through the same importer without remapping.

**Working a lead**
- Editable Status/Priority/Notes/Last Contacted/Next Follow-Up, tap-to-call
  and tap-to-email on mobile/desktop, and a **reject** action — an employee
  who doesn't want a lead sends it back to a "pending reassignment" pool
  (with who had it and their notes still visible) instead of it vanishing
  into the general unassigned bucket.
- Full audit trail of every assignment (who got what, when), independent of
  current state — powers "recently assigned" feeds and a by-date-range
  "leads assigned per employee" report.

**Dashboards**
- **Admin**: total/unassigned/due-today/overdue/won/lost/recurring stat
  cards, leads by status/priority/employee/campaign/ad-set/ad, a recent-
  assignments feed, a recurring-leads list, and assignments-by-date-range.
- **Employee**: their own pipeline as a donut chart, a win-rate stat, their
  own recently-assigned feed, and a banner surfacing overdue follow-ups.

**Everywhere**
- Server-side pagination (10/50/100/500 per page) on the leads list.
- Filters: status, priority, city, free-text search, current assignment,
  *previous* assignment (independent of current — useful for reviewing
  reassignment history), and recurring-only.
- Mobile-responsive throughout — filter forms stack to full-width fields on
  narrow screens, the leads table scrolls horizontally within its own
  container rather than breaking the page layout, modals render as a
  bottom sheet on mobile and a centered dialog on desktop.

## Project layout

```
server/         Express API, Postgres DB, spreadsheet upload/export + Google Sheets sync
  src/
    config/sheetMapping.js   <- column <-> field mapping (edit this if your
                                 spreadsheet/sheet headers differ from the defaults)
    db/            schema + connection pool + admin seeding
    middleware/     auth (JWT) and error handling
    routes/         auth, employees, leads (import/export), dashboard, sync
    services/       Google Sheets client, shared import/write-back sync logic, audit log
  tests/          vitest + supertest — auth, assignment/scoping, spreadsheet
                  import (incl. recurring-lead detection, data repair,
                  overwrite mode), export column selection, column mapping
client/         React + Vite + Tailwind admin & employee portals
render.yaml     Render Blueprint (web service + free Postgres)
```

## Setup

Requires **Node.js 18+** and npm.

### 1. Backend

```bash
cd server
cp .env.example .env
npm install
```

Edit `server/.env`:

| Variable | Purpose |
|---|---|
| `PORT` | API port (default 5000) |
| `JWT_SECRET` | Long random string — required in production |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | The one admin account created automatically the first time the server boots (only if no admin exists yet) |
| `DATABASE_URL` | PostgreSQL connection string. For local dev, the quickest option is a throwaway Docker container: `docker run --name crm-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres`, then `DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres`. The schema is created automatically on boot. |
| `GOOGLE_SHEET_ID` | The spreadsheet ID from its URL |
| `GOOGLE_SHEET_TAB` | The tab/sheet name holding the leads |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | Path to the service-account JSON key (see below) |
| `SHEET_SYNC_INTERVAL_MINUTES` | How often to auto-import (1–59; 0 disables the timer, "Sync now" still works) |

If you don't have Google Sheets access configured, leave the `GOOGLE_SHEET_*`
variables blank — the app still runs, "Sync now" reports "not configured",
and you can add/import leads from the admin UI in the meantime.

```bash
npm run dev
```

### 2. Google Sheet setup (optional)

Skip this if you're only using the **Import spreadsheet** upload button — it
needs no Google account or credentials at all.

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or
   reuse) a project, enable the **Google Sheets API**, and create a
   **service account**.
2. Create a JSON key for that service account and download it.
3. Save it as `server/secrets/service-account.json` (git-ignored), and set
   `GOOGLE_SERVICE_ACCOUNT_FILE=./secrets/service-account.json` in
   `server/.env` — or paste the JSON directly into
   `GOOGLE_SERVICE_ACCOUNT_JSON` as a one-line env var (useful on hosts
   where you can't upload a file).
4. Share the sheet with the service account's email (looks like
   `something@your-project.iam.gserviceaccount.com`) as **Editor**.
5. Row 1 needs headers matching `server/src/config/sheetMapping.js`
   (case-insensitive, any order) — if yours differ, edit that file instead
   of renaming your columns.

### 3. Frontend

```bash
cd client
npm install
npm run dev
```

Visit `http://localhost:5173` (proxies `/api` to the backend on port 5000 —
see `client/vite.config.js`). Log in with the seeded admin credentials from
`server/.env`.

> **macOS note:** port 5000 often collides with AirPlay Receiver. If the
> backend fails with `EADDRINUSE`, either disable AirPlay Receiver (System
> Settings → General → AirDrop & Handoff) or run it on another port:
> `PORT=5050` in `server/.env`, then `API_PORT=5050 npm run dev` in `client/`.

## Lead status & priority

- **Status**: `Won`, `Lost`, `Not answered`, `Contacted`, `Broker`.
- **Priority**: `P1`, `P2`, `P3`, `P5` (P1 = highest).
- Both start **blank** on a new lead (no default) — so an unreviewed lead is
  visibly unreviewed, not indistinguishable from one someone already
  triaged. Enforced by named Postgres CHECK constraints, dropped and
  re-applied on every boot so the scheme can change again the same way.

## Tests

```bash
cd server
npm test
```

No real database needed — with `DATABASE_URL` unset and `NODE_ENV=test`,
`server/src/db/index.js` uses `pg-mem` instead.

## Deployment

`server/src/app.js` serves `client/dist` as static files and falls back to
`index.html` for client-side routing, so one process/host is enough.

### Deploy to Render (free)

This repo includes `render.yaml`, a Render Blueprint provisioning a web
service and a free Postgres database together.

**Free-tier caveats:** the free Postgres database is deleted 30 days after
creation unless upgraded; the free web service spins down after ~15 minutes
of inactivity (next request wakes it, taking tens of seconds — the
scheduled sheet-sync timer only fires while it's awake, "Sync now" always
works once it's up).

**Steps:**

1. Push this repo to GitHub (Render deploys from a connected Git provider).
2. In the [Render dashboard](https://dashboard.render.com/): **New >
   Blueprint**, select this repo.
3. Render prompts for the env vars marked `sync: false`:
   `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `GOOGLE_SHEET_ID`,
   `GOOGLE_SERVICE_ACCOUNT_JSON`. Leave the Google Sheets ones blank for now
   if you want — the app runs fine without them.
4. **Apply**. Render builds the client, installs the server, creates the
   database, and starts the service. `JWT_SECRET` is generated for you.
5. Open the service URL and log in with the admin credentials from step 3.
