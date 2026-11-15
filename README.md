# Athenaeum — Library Management System

A full-stack, multi-database library platform: catalog and search, physical
inventory, circulation, fines and payments, reservations with pickup holds,
notifications, and staff reporting.

**Stack:** Node.js 22 · TypeScript · Express · MySQL/Prisma · MongoDB ·
React 19 · Vite · Tailwind CSS

> Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design and
> [docs/API.md](docs/API.md) for the endpoint reference.

## Features

- **Auth & roles** — JWT access tokens, rotating refresh tokens in HttpOnly
  cookies, refresh sessions stored in MySQL (revocable), Admin/Librarian/Member
  RBAC.
- **Catalog** — MongoDB book metadata and full-text search with
  subject/language/publisher facets computed from the catalog itself.
- **Circulation** — copy-level checkout with MySQL conditional transitions,
  renewals, returns, lost-item handling. Staff only: members cannot issue,
  renew, or return books themselves.
- **Member view** — members see availability, which titles are issued to them
  with issue/due dates, their history, and outstanding dues. No write actions.
- **Fines** — ₹5/started overdue day, per-loan cap, partial payments, waivers,
  outstanding-balance checkout blocking.
- **Reservations** — staff place holds for members; ordered queue, 48-hour
  pickup holds, automatic promotion on return/cancel/expiry, copy reservation.
- **Notifications** — holds ready, due-soon, overdue, fines, payments; in-app
  feed with unread counts (deduplicated per loan per day in MongoDB).
- **Reports** — KPIs, daily circulation and revenue, overdue aging, top titles,
  hold pipeline, audit trail.
- **Ops** — Docker Compose for MySQL and MongoDB, health checks, seed data,
  graceful shutdown, background scans.

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up --build
```

Wait for the API health check, then open **http://localhost:5173**.

The API seeds itself on first boot (`SEED_ON_START=true`). To seed manually:

```bash
docker compose exec api node dist/scripts/seed.js
```

### Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@library.dev` | `Admin123!` |
| Librarian | `librarian@library.dev` | `Librarian123!` |
| Member | `member@library.dev` | `Member123!` |
| Member | `priya@library.dev` | `Member123!` |

Demo seed includes books, copies, active/overdue loans, a partially paid fine,
a paid fine (for revenue charts), a hold queue, reviews, and notifications.

## Local development (without containerizing the app)

Start infrastructure only:

```bash
docker compose up -d mysql mongo
```

API:

```bash
cd server
cp ../.env.example .env        # then set DATABASE_URL/MONGO_URL/... for localhost
npm install
npm run db:push                # sync Prisma schema (use migrations in production)
npm run seed
npm run dev                    # http://localhost:4000
```

Web:

```bash
cd web
npm install
npm run dev                    # http://localhost:5173, proxies /api → :4000
```

No cache or search service is required: sessions, catalog cache, rate limits,
and full-text search all run from MySQL and MongoDB.

## Project layout

```
.
├── docker-compose.yml
├── .env.example
├── docs/
│   ├── ARCHITECTURE.md        # data ownership, ERD, locks, queues, failure modes
│   └── API.md
├── server/
│   ├── prisma/schema.prisma   # MySQL system of record
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

1. **Search** runs against MongoDB books; subject, language, and publisher
   facets are aggregated from the same collection. Availability comes from
   MySQL at query time and results are cached in process for 30 seconds.
2. **Checkout** resolves the member and copy, then inside a MySQL transaction
   flips `AVAILABLE → ON_LOAN` conditionally and inserts the loan. The
   conditional update is the authoritative double-checkout guard. Only staff
   can issue, renew, return, or mark items lost.
3. **Return** computes the fine in paise, records it, then either releases the
   copy or assigns it to the oldest queued reservation and marks that hold
   `READY` with a 48-hour expiry.
4. **Reservations** are queued in MySQL and placed by staff, then promoted
   transactionally on return/cancel/expiry.
5. **Side effects** (audit, notifications, cache invalidation) run after commit
   and are best-effort; audit and notification records live in MongoDB.

## Verification

```bash
cd server && npm run typecheck && npm run build
cd web && npm run typecheck && npm run build
```

The build was type-checked in this workspace. The full runtime stack requires
Docker (MySQL and MongoDB are declared in `docker-compose.yml`) or locally
installed MySQL and MongoDB.

## Production notes

This is a reference implementation, not a hardened deployment. Before production:
rotate secrets, use TLS, add CSRF protection for cookie endpoints, replace the
in-process job scheduler with a queue worker, introduce a transactional outbox,
use Prisma migrations (not `db push`), and add idempotency keys to
checkout/payment. The full list lives in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#16-production-hardening-roadmap).
