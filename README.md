# Athenaeum — Library Management System

A full-stack library platform: catalog and search, physical inventory,
circulation, fines and payments, reservations with pickup holds, notifications,
and staff reporting — all persisted in a single MongoDB database.

**Stack:** Node.js 22 · TypeScript · Express · MongoDB · Prisma + Mongoose ·
React 19 · Vite · Tailwind CSS

> Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design and
> [docs/API.md](docs/API.md) for the endpoint reference.

## Features

- **Auth & roles** — JWT access tokens, rotating refresh tokens in HttpOnly
  cookies, refresh sessions stored in MongoDB (revocable), Admin/Librarian/Member
  RBAC.
- **Catalog** — MongoDB book metadata and full-text search with
  subject/language/publisher facets computed from the catalog itself.
- **Circulation** — copy-level checkout with guarded status transitions,
  renewals, returns, lost-item handling. Staff only: members cannot issue,
  renew, or return books themselves.
- **Member view** — members see availability, which titles are issued to them
  with issue/due dates, their history, and outstanding dues. No write actions.
- **Fines** — ₹5/started overdue day, per-loan cap, partial payments, waivers,
  outstanding-balance checkout blocking.
- **Reservations** — staff place holds for members; ordered queue, 48-hour
  pickup holds, automatic promotion on return/cancel/expiry, copy reservation.
- **Notifications** — holds ready, due-soon, overdue, fines, payments; in-app
  feed with unread counts (deduplicated per loan per day).
- **Live dashboard** — activity feed of issues, returns, renewals, holds and
  fines with member and staff names plus timestamps, refreshing every 5 seconds;
  KPI cards refresh every 10 seconds.
- **Reports** — KPIs, daily circulation and revenue, overdue aging, top titles,
  hold pipeline, audit trail.
- **Ops** — single-command local stack, Docker Compose, health checks, seed data,
  graceful shutdown, background scans.

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up --build
```

Compose starts MongoDB as a single-node replica set (`rs0`), initiates it once,
then boots the API and web app. Wait for the API health check, then open
**http://localhost:5173**.

The API seeds itself on first boot (`SEED_ON_START=true`). To seed manually:

```bash
docker compose exec api node dist/scripts/seed.js
```

## Local development (without containerizing the app)

MongoDB must run as a replica set — Prisma uses transactions for circulation:

```bash
docker compose up -d mongo mongo-init
```

API:

```bash
cd server
cp ../.env.example .env        # set DATABASE_URL / MONGO_URL for localhost
npm install
npm run db:push                # sync Prisma schema
npm run seed
npm run dev                    # http://localhost:4000
```

Web:

```bash
cd web
npm install
npm run dev                    # http://localhost:5173, proxies /api → :4000
```

No cache or search service is required: catalog cache, rate limits, and search
all run from MongoDB and the API process.

### Local stack script (no Docker)

`scripts/dev-stack.sh` runs MongoDB on 27018 as replica set `rs0`, the API on
4000 and Vite on 5173, keeping data, env and logs under `~/.athenaeum-dev` so a
reboot does not wipe them:

```bash
scripts/dev-stack.sh start          # add --build to rebuild the API first
scripts/dev-stack.sh status
scripts/dev-stack.sh logs api 80
scripts/dev-stack.sh stop
```

`scripts/dev-stack.sh supervise` adds a watchdog that restarts any service that
dies. A 500 on sign-in usually means port 4000 is down — the Vite proxy answers
500 when it cannot reach the API. Run `status` first.

## Project layout

```
.
├── docker-compose.yml
├── .env.example
├── docs/
│   ├── ARCHITECTURE.md        # data ownership, models, locks, queues, failure modes
│   └── API.md
├── server/
│   ├── prisma/schema.prisma   # ledger models on MongoDB
│   ├── Dockerfile
│   └── src/
│       ├── config/            # zod-validated env
│       ├── lib/               # Prisma/Mongo clients, errors, time
│       ├── middleware/        # auth, RBAC, rate limiting, errors
│       ├── models/            # Mongoose: books, reviews, audit, notifications
│       ├── services/          # circulation, fines, holds, search, reports
│       ├── routes/            # HTTP layer
│       ├── jobs/scheduler.ts  # due-soon, overdue, hold expiry
│       └── scripts/seed.ts
└── web/
    ├── Dockerfile
    ├── nginx.conf
    └── src/
        ├── lib/               # API client, auth context
        ├── components/
        └── pages/             # catalog, book, member desk, circulation, reports
```

## Configuration

Environment is validated at boot in `server/src/config/env.ts`. Defaults:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | 4000 | API port |
| `DATABASE_URL` | — | Prisma MongoDB URL (same database as `MONGO_URL`) |
| `MONGO_URL` | — | Mongoose MongoDB URL |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | dev values | **Change in production** |
| `ACCESS_TOKEN_TTL_SECONDS` | 900 | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | 7 | Refresh lifetime |
| `LOAN_PERIOD_DAYS` | 30 | Initial issue period |
| `RENEWAL_DAYS` / `MAX_RENEWALS` | 7 / 1 | Renewal policy |
| `MAX_ACTIVE_LOANS` | 5 | Per member |
| `MAX_ACTIVE_HOLDS` | 3 | Per member |
| `FINE_PER_DAY_CENTS` | 500 | Overdue rate (paise, ₹5/day) |
| `MAX_FINE_CENTS` | 15000 | Per-loan cap (₹150) |
| `MAX_OUTSTANDING_FINE_CENTS` | 10000 | Checkout block threshold (₹100) |
| `RESERVATION_HOLD_HOURS` | 48 | Pickup window |
| `LOST_FEE_CENTS` | 25000 | Replacement fee (₹250) |
| `SEED_ON_START` | true (compose) | Idempotent demo seed |

## How the pieces work together

1. **Search** runs against the `books` collection; subject, language, and
   publisher facets are aggregated from the same collection. Availability comes
   from `BookCopy` at query time and results are cached in process for 30 seconds.
2. **Checkout** resolves the member and copy, then inside a Prisma transaction
   flips `AVAILABLE → ON_LOAN` with a guarded `updateMany` and inserts the loan.
   The affected-row count is the authoritative double-checkout guard. Only staff
   can issue, renew, return, or mark items lost.
3. **Return** computes the fine in paise, records it, then either releases the
   copy or assigns it to the oldest queued reservation and marks that hold
   `READY` with a 48-hour expiry.
4. **Reservations** are queued in the `Reservation` collection and placed by
   staff, then promoted transactionally on return/cancel/expiry.
5. **Side effects** (audit, notifications, cache invalidation) run after commit
   and are best-effort. The live activity endpoint joins the audit stream with
   loans, fines, and users to show who did what, to whom, and when.

## Verification

```bash
cd server && npm run typecheck && npm run build
cd web && npm run typecheck && npm run build
```

The build is type-checked in this workspace. The runtime stack needs MongoDB
running as a replica set, either through `docker compose` or locally.

## Production notes

This is a reference implementation, not a hardened deployment. Before production:
rotate secrets, use TLS, add CSRF protection for cookie endpoints, replace the
in-process job scheduler with a queue worker, introduce a transactional outbox,
add idempotency keys to checkout/payment, and run MongoDB as a multi-node replica
set. The full list lives in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#16-production-hardening-roadmap).
