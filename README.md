# Athenaeum — Library Management System

A full-stack, multi-database library management platform featuring catalog and search, physical inventory, circulation, fines and payments, reservations with pickup holds, notifications, and staff reporting.

**Tech Stack:** Node.js 22 · TypeScript · Express · MySQL/Prisma · MongoDB · React 19 · Vite · Tailwind CSS

Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system design and [docs/API.md](docs/API.md) for the endpoint reference.

## Features

- **Authentication & Roles** — JWT access tokens, rotating refresh tokens in HttpOnly cookies, refresh sessions stored in MySQL (revocable), and Admin/Librarian/Member role-based access control.
- **Catalog Management** — MongoDB book metadata and full-text search with subject, language, and publisher facets computed from the catalog.
- **Circulation Management** — Copy-level checkout using MySQL conditional transitions, renewals, returns, and lost-item handling. Only authorized staff can issue, renew, or return books.
- **Member Dashboard** — Members can view book availability, their issued books, issue and due dates, borrowing history, and outstanding dues. Members have no circulation write permissions.
- **Fines & Payments** — ₹5 per started overdue day, per-loan fine cap, partial payments, waivers, and checkout blocking based on outstanding balances.
- **Reservations** — Staff can place holds for members. Includes an ordered queue, 48-hour pickup holds, automatic promotion on return/cancellation/expiry, and copy reservation.
- **Notifications** — Notifications for holds ready, due-soon reminders, overdue books, fines, and payments. Includes an in-app feed with unread counts and daily deduplication per loan in MongoDB.
- **Reports & Analytics** — KPIs, daily circulation and revenue, overdue aging, top titles, hold pipeline, and audit trail.
- **Operations** — Docker Compose configuration for MySQL and MongoDB, health checks, database initialization, graceful shutdown, and background scans.

## Quick Start (Docker)

Clone the repository and navigate to the project directory.

```bash
cp .env.example .env
docker compose up --build
```

Wait for the API health check to complete, then open:

**http://localhost:5173**

The API can initialize the database with optional seed data (`SEED_ON_START=true`).

To initialize the database manually:

```bash
docker compose exec api node dist/scripts/seed.js
```

## Local Development (Without Containerizing the Application)

Start the database infrastructure only:

```bash
docker compose up -d mysql mongo
```

### Backend Setup

```bash
cd server
cp ../.env.example .env
```

Configure `DATABASE_URL`, `MONGO_URL`, and other required environment variables for localhost.

Install dependencies and initialize the database:

```bash
npm install
npm run db:push
npm run seed
npm run dev
```

Backend API:

**http://localhost:4000**

### Frontend Setup

Open another terminal:

```bash
cd web
npm install
npm run dev
```

Frontend:

**http://localhost:5173**

The frontend development server proxies `/api` requests to the backend on port 4000.

No external cache or search service is required. Sessions, catalog cache, rate limits, and full-text search run using MySQL and MongoDB.

## Project Structure

```text
.
├── docker-compose.yml
├── .env.example
├── docs/
│   ├── ARCHITECTURE.md
│   └── API.md
├── server/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── Dockerfile
│   └── src/
│       ├── config/
│       ├── lib/
│       ├── middleware/
│       ├── models/
│       ├── services/
│       ├── routes/
│       ├── jobs/
│       │   └── scheduler.ts
│       └── scripts/
│           └── seed.ts
└── web/
    ├── Dockerfile
    ├── nginx.conf
    └── src/
        ├── lib/
        ├── components/
        └── pages/
```

### Backend Directories

- `config/` — Environment configuration and validation using Zod.
- `lib/` — Prisma and MongoDB clients, error handling, and time utilities.
- `middleware/` — Authentication, RBAC, rate limiting, and error handling.
- `models/` — Mongoose models for books, reviews, audit logs, and notifications.
- `services/` — Circulation, fines, reservations, search, and reporting logic.
- `routes/` — HTTP API endpoints.
- `jobs/` — Background scheduler for due-soon reminders, overdue notifications, and hold expiry.
- `scripts/` — Database initialization and seed scripts.

### Frontend Directories

- `lib/` — API client and authentication context.
- `components/` — Reusable UI components.
- `pages/` — Catalog, book details, member dashboard, circulation, and reports.

## Configuration

Environment variables are validated at application startup in `server/src/config/env.ts`.

| Variable | Default | Description |
|---|---|---|
| `PORT` | 4000 | Backend API port |
| `JWT_ACCESS_SECRET` | Development value | Access token secret |
| `JWT_REFRESH_SECRET` | Development value | Refresh token secret |
| `ACCESS_TOKEN_TTL_SECONDS` | 900 | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | 7 | Refresh token lifetime |
| `LOAN_PERIOD_DAYS` | 30 | Initial borrowing period |
| `RENEWAL_DAYS` | 7 | Renewal extension period |
| `MAX_RENEWALS` | 1 | Maximum renewals per loan |
| `MAX_ACTIVE_LOANS` | 5 | Maximum active loans per member |
| `MAX_ACTIVE_HOLDS` | 3 | Maximum active reservations per member |
| `FINE_PER_DAY_CENTS` | 500 | Overdue fine rate (₹5/day) |
| `MAX_FINE_CENTS` | 15000 | Maximum fine per loan (₹150) |
| `MAX_OUTSTANDING_FINE_CENTS` | 10000 | Checkout blocking threshold (₹100) |
| `RESERVATION_HOLD_HOURS` | 48 | Reservation pickup window |
| `LOST_FEE_CENTS` | 25000 | Lost book replacement fee (₹250) |
| `SEED_ON_START` | true (Compose) | Initialize database with seed data |

**Important:** Change development JWT secrets before deploying to production.

## How the System Works

### 1. Book Search

Book searches run against MongoDB. Subject, language, and publisher facets are aggregated from the same collection.

Book availability is retrieved from MySQL at query time. Search results are cached in process for 30 seconds.

### 2. Book Checkout

The checkout process resolves the member and physical book copy.

Inside a MySQL transaction, the system conditionally changes the copy status:

`AVAILABLE → ON_LOAN`

A loan record is then inserted. The conditional update acts as the authoritative double-checkout protection mechanism.

Only authorized staff can issue, renew, return, or mark books as lost.

### 3. Book Return

When a book is returned, the system calculates applicable fines in paise and records the payment obligation.

The returned copy is either released as available or assigned to the oldest queued reservation.

If a reservation is assigned, its status becomes `READY` and a 48-hour pickup period begins.

### 4. Reservation Management

Reservations are maintained in an ordered queue in MySQL.

When a book is returned, cancelled, or a pickup hold expires, the system transactionally promotes the next eligible reservation.

### 5. Background Operations

Audit records, notifications, and cache invalidation run after database commits.

These operations are best-effort and do not interfere with the main circulation transaction.

Audit and notification records are stored in MongoDB.

## Verification

Run backend checks:

```bash
cd server
npm run typecheck
npm run build
```

Run frontend checks:

```bash
cd web
npm run typecheck
npm run build
```

The application requires Docker with MySQL and MongoDB, or locally installed instances of both databases.

## Production Considerations

This project is a reference implementation and is not yet hardened for production deployment.

Before production use:

1. Rotate all development secrets.
2. Enable HTTPS/TLS.
3. Add CSRF protection for cookie-based endpoints.
4. Replace the in-process job scheduler with a dedicated queue worker.
5. Introduce a transactional outbox for reliable background operations.
6. Use Prisma migrations instead of `db push`.
7. Add idempotency keys to checkout and payment operations.
8. Configure production database credentials and access permissions.
9. Implement appropriate monitoring, logging, and backup policies.

For additional technical details, refer to:

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#16-production-hardening-roadmap)

[docs/API.md](docs/API.md)

---

**Athenaeum — Library Management System**

A full-stack library platform built with Node.js, TypeScript, React, MySQL, Prisma, and MongoDB.
