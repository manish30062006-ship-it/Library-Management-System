# Library Management System — Architecture & Data Design

## 1. Goals

A multi-role library platform that supports:

- Catalog browsing and full-text search of books
- Physical copy inventory and circulation (checkout, return, renew, lost)
- Overdue fine assessment, partial payments, and waivers
- Reservation queues with 48-hour pickup holds
- In-app notifications for holds, due dates, and fines
- Operational reporting for librarians and admins

Non-goals for this reference build: payment-gateway integration, email/SMS
delivery, and multi-branch transfer workflows. The architecture leaves explicit
seams for all three.

## 2. Stack

| Layer | Choice |
| --- | --- |
| API | Node.js 22, TypeScript, Express 4 |
| Frontend | React 19, Vite, TypeScript, React Router, TanStack Query, Tailwind CSS |
| Data store | MongoDB 7+ — one database for every collection |
| ORM / ODM | Prisma (ledger collections) + Mongoose (catalog, reviews, audit, notifications) |
| Packaging | Docker Compose (optional) or `scripts/dev-stack.sh` |

The API deliberately has **no external cache, lock, or search service**. Catalog
and search run directly on MongoDB; cache, rate limits, and short-lived locks are
kept inside the API process.

MongoDB must run as a **replica set** (a single-node `rs0` is enough locally):
Prisma's MongoDB connector uses multi-document transactions for checkout,
returns, and payments.

## 3. System context

```
                       +-----------------------------+
                       |      React SPA (Vite)       |
                       |  catalog · circulation ·    |
                       |  member desk · reports      |
                       +--------------+--------------+
                                      | HTTPS
                     access JWT (Authorization header, memory)
                     refresh token (HttpOnly cookie, rotating)
                                      |
                       +--------------v--------------+
                       |        Express API          |
                       |  routes → services → data   |
                       +--------------+--------------+
                                      |
                       +--------------v--------------+
                       |          MongoDB            |
                       |  identity · inventory       |
                       |  circulation · money        |
                       |  sessions · catalog         |
                       |  reviews · audit · notifs   |
                       +-----------------------------+
```

## 4. Data ownership (the important rule)

Everything lives in one database, but each collection still has exactly one
owner and one access path.

| Data | Collection | Access | Why |
| --- | --- | --- | --- |
| Users, roles, credentials | `User` | Prisma | Unique email, role checks |
| Members, membership state | `Member` | Prisma | Lifecycle tied to circulation |
| Refresh sessions | `AuthSession` | Prisma | Revocable, survives restarts |
| Physical copies, copy status | `BookCopy` | Prisma | Circulation needs guarded status transitions |
| Loans, renewals | `Loan` | Prisma | Money and inventory correctness |
| Fines, payments, waivers | `Fine`, `Payment` | Prisma | Integer paise (INR), auditability |
| Reservations / hold queue | `Reservation` | Prisma | Ordering + transactional copy assignment |
| Book metadata, subjects, descriptions | `books` | Mongoose | Flexible, document-shaped content |
| Reviews | `reviews` | Mongoose | User-generated content |
| Audit log | `auditlogs` | Mongoose | Append-only stream, TTL retention |
| Notifications | `notifications` | Mongoose | Per-user event feed |
| Catalog cache, rate limits, copy locks | API process memory | — | Ephemeral by design |

**`bookId` is a MongoDB ObjectId stored as a string.** The `books` collection is
written through Mongoose while copies and loans go through Prisma, so the link is
enforced by application code, not by a foreign key.

Consequences:

- A loan can never exist without a valid copy; copies are Prisma-managed.
- A copy can reference a book that was archived; archiving is blocked while
  active loans exist, and archived books disappear from search.
- Book metadata enrichment for loan/report responses is a second query keyed by
  `bookId`.

### Consistency strategy

Prisma transactions cover the ledger: copy status, loan, fine, payment, and
reservation promotion commit together or not at all. Side effects (cache
invalidation, audit log, notification) run after the commit and are best-effort.
A side-effect failure never rolls back a committed loan; it is logged and can be
replayed from the audit stream.

- Search needs no rebuild step: queries run directly against `books`.
- Audit/notification loss is acceptable for this reference build; production
  hardening is a transactional outbox consumed by a worker.

## 5. Backend layout

```
server/src
  app.ts                 express wiring, security middleware
  index.ts               startup, dependency health, graceful shutdown
  config/env.ts          zod-validated environment
  lib/                   prisma and mongo clients; errors, time
  middleware/            auth, RBAC, rate limits, error handling
  models/                Mongoose models (catalog, reviews, audit, notifications)
  services/              domain logic (circulation, fines, holds, search, reports)
  routes/                HTTP validation + authorization + response shaping
  jobs/scheduler.ts      overdue/due-soon/expiry scans
  scripts/seed.ts        deterministic demo data
```

Routes are thin. All rules that affect money, inventory, or queue ordering live
in services and execute inside Prisma transactions when they mutate state.

## 6. Authentication and authorization

**Access token**: JWT, 15 minutes, contains `sub`, `role`, `email`, `memberId`.
Sent as `Authorization: Bearer …`; the SPA keeps it in memory only.

**Refresh token**: JWT, 7 days, `type: "refresh"`, `jti`, delivered as an
`HttpOnly; SameSite=Lax; Path=/api/auth` cookie. A document in the `AuthSession`
collection stores the SHA-256 hash of the token keyed by `jti`, which makes it
revocable. Every refresh **rotates**: the old session document is deleted and a
new one created in the same transaction before a new token pair is issued.
Logout deletes the document and clears the cookie.

**Roles**

| Role | Capabilities |
| --- | --- |
| `MEMBER` | Search/catalog, own issues with dates, own history and dues, review returned titles, notifications. **Read-only**: cannot issue, renew, return, or place holds. |
| `LIBRARIAN` | Checkout/return/renew/lost, place and cancel holds, member lookup, book CRUD, add copies, reports |
| `ADMIN` | Everything + waive fines, archive books, member status changes, audit log |

Enforcement is centralized in `requireAuth` + `requireRole` middleware. Route
handlers never trust a body-supplied user id; the member id comes from the token
or an explicit staff-target lookup. Every route that mutates circulation state
(`/loans/*`, `/reservations/*`) requires `ADMIN` or `LIBRARIAN`.

Other controls: bcrypt cost 12, Helmet, strict CORS with credentials, Zod
validation on every body/query, in-process fixed-window rate limits on auth and
write endpoints, request-body size cap, and no secrets in logs.

## 7. Ledger collections (Prisma)

All primary keys are UUID strings stored in `_id`. Money is stored as **integer
paise** (INR minor units).

```
User 1───0..1 Member 1───* Loan *───1 BookCopy
 │              │          │
 │              ├──* Fine ──┼──* Payment
 │              └──* Reservation
 ├──(issued loans / received payments)
└──* AuthSession (refresh-token hashes)

BookCopy.bookId ── references books._id (string, app-enforced)
Loan.bookId     ── denormalized for reporting and hold lookup
```

Relations are emulated by Prisma Client: the relation value (`userId`, `copyId`,
`memberId`, …) is stored on the document and `include` performs the lookup. There
are no database-level foreign keys, so deletes cascade only through Prisma.

Enums:

```
Role             ADMIN | LIBRARIAN | MEMBER
UserStatus       ACTIVE | SUSPENDED
MemberStatus     ACTIVE | SUSPENDED | EXPIRED
CopyStatus       AVAILABLE | ON_LOAN | RESERVED | LOST | MAINTENANCE
LoanStatus       ACTIVE | RETURNED | LOST
FineStatus       PENDING | PARTIAL | PAID | WAIVED
FineReason       OVERDUE | LOST_ITEM | DAMAGE
PaymentMethod    CASH | CARD | ONLINE
ReservationStatus QUEUED | READY | FULFILLED | CANCELLED | EXPIRED
```

Key invariants:

- A copy has at most one active loan (enforced by the guarded status transition,
  see §9).
- `Loan.dueAt` is fixed at checkout; renewals extend it.
- A fine’s `amount` is immutable after assessment. `paidAmount` moves toward it.
  `status` is derived on each payment (`PARTIAL` / `PAID`).
- Reservations are ordered by `createdAt` within a book. `READY` reservations
  own exactly one `copyId`, which is `RESERVED` in inventory.
- Deleting users/members cascades their loans/fines through Prisma for
  development convenience; production would use soft deletes and retention.

See [`server/prisma/schema.prisma`](../server/prisma/schema.prisma) for the
authoritative model definition and indexes.

## 8. MongoDB collections (Mongoose)

### `books`

```js
{
  _id: ObjectId,
  title: String,
  subtitle: String?,
  authors: [String],
  isbn: String,                // unique
  publisher: String?,
  publishedYear: Number?,
  language: String,            // default "en"
  pages: Number?,
  subjects: [String],
  description: String?,
  coverUrl: String?,
  ratingAvg: Number,           // 0..5, derived from reviews
  ratingCount: Number,
  status: "ACTIVE" | "ARCHIVED",
  createdBy: String,           // user id
  createdAt, updatedAt
}
```

Indexes: `{ isbn: 1 }` unique, `{ subjects: 1 }`, `{ status: 1, createdAt: -1 }`.
Copy counts are **not** stored here; they are always read from `BookCopy`.

### `reviews`

```js
{ _id, bookId: String, userId: String, memberName: String,
  rating: 1..5, title: String?, body: String, verifiedBorrow: Boolean,
  createdAt, updatedAt }
```

Unique `{ bookId: 1, userId: 1 }` (one review per member per book). Index
`{ bookId: 1, createdAt: -1 }`. Review writes recompute `ratingAvg`/`ratingCount`
on the book.

### `auditlogs`

```js
{ _id, actorId, actorRole, action, entityType, entityId, before, after,
  ip, createdAt }
```

Append-only. TTL index on `createdAt` (180 days). Used by Admin audit view and by
the live activity feed. Written after successful commits and never allowed to
fail the request.

### `notifications`

```js
{ _id, userId, type: "HOLD_READY" | "DUE_SOON" | "OVERDUE" | "FINE" | "PAYMENT" | "SYSTEM",
  title, body, data: Object, readAt: Date?, createdAt }
```

Indexes `{ userId: 1, createdAt: -1 }` and `{ userId: 1, readAt: 1 }`.

### Live activity

`GET /api/reports/activity` reads the newest audit entries and joins them against
loans, fines, reservations, and `User` documents to resolve member and staff
names. The admin audit endpoint additionally resolves the member behind each
audited loan/fine/reservation, so every row shows who the event was for as well
as who performed it. The dashboard polls activity every 5 seconds and KPI cards
every 10 seconds, so issue/return/waive events appear with actor name and
timestamp without a reload.

All timestamps are presented in **IST (Asia/Kolkata)** — the API formats activity
labels in IST, the report day buckets are IST calendar days, and the SPA renders
dates, times, and its live header clock in IST.

## 9. Concurrency: checkout and returns

Two mechanisms, intentionally redundant:

1. **In-process copy lock** (`lock:copy:{copyId}` in a `Map` with a 10-second
   TTL). This serializes checkout/return per physical copy inside one API
   process and produces a friendly "item is busy" 409 under contention.
2. **Guarded status transition inside a Prisma transaction**:

   ```ts
   const claim = await tx.bookCopy.updateMany({
     where: { id: copyId, status: 'AVAILABLE' },
     data: { status: 'ON_LOAN' },
   });
   if (claim.count === 0) throw conflict('Copy is no longer available');
   ```

   If `count = 0`, the operation aborts. This is the real correctness guard: two
   checkouts cannot both succeed regardless of the in-process lock. Because the
   guard is the document itself, running multiple API replicas stays safe; the
   in-memory lock simply stops duplicate work.

Return does the reverse (`ON_LOAN → AVAILABLE`), then the same transaction
assigns the copy to the next `QUEUED` reservation, marks it `READY`, and sets a
48-hour `expiresAt`. If no queue exists the copy stays `AVAILABLE`.

Reservation creation, cancellation, and expiry use the same promotion helper so
copy assignment and queue state never diverge.

## 10. Circulation rules

Configured in [`server/src/config/env.ts`](../server/src/config/env.ts):

| Rule | Default |
| --- | --- |
| Issue period | 30 days |
| Renewal length / count | 7 days / 1 |
| Max active loans per member | 5 |
| Max active reservations per member | 3 |
| Overdue fine | ₹5 per started day |
| Per-loan fine cap | ₹150.00 |
| Checkout blocked above outstanding fines | ₹100.00 |
| Reservation pickup window | 48 hours |
| Lost item fee | ₹250.00 |

Additional rules:

- Members are read-only: issue, renew, return, lost, and hold placement are all
  staff actions. Membership must be `ACTIVE`, not expired, and the user account
  must be `ACTIVE`.
- Renewal is rejected when the loan is overdue, at max renewals, the title has
  any `QUEUED`/`READY` reservation, or the member’s outstanding fines exceed the
  block threshold.
- A `RESERVED` copy can only be checked out by the holder of its `READY`
  reservation; fulfillment marks it `FULFILLED`.
- Fine day counting uses `ceil(elapsed / 24h)` — any started overdue day counts,
  capped per loan. The fine is assessed at return, not nightly.
- Lost items: copy → `LOST`, loan → `LOST`, a `LOST_ITEM` fine is created at the
  replacement fee. The reservation queue is not auto-promoted because no copy
  became available.
- Payments may be partial. `paidAmount` accumulates; status becomes `PARTIAL`
  until fully paid, then `PAID`. An Admin may waive the remaining balance.

Reservation state machine:

```
create ──► QUEUED ──(copy available / prev return)──► READY ──(checkout)──► FULFILLED
              │                                        │
              ├──(staff cancel)─────────► CANCELLED    ├──(48h expiry)──► EXPIRED
              └──────────────────────────               └──(staff cancel)─► CANCELLED
```

`READY → EXPIRED/CANCELLED` releases the copy and promotes the next `QUEUED`
reservation in the same transaction.

## 11. In-process cache and limits

The API keeps three small `Map`-based stores with TTLs:

| Key | TTL | Purpose |
| --- | --- | --- |
| `catalog:book:{bookId}` | 60 s | Book detail cache |
| `catalog:search:v1:{hash}` | 30 s | Search result cache |
| `rl:{bucket}:{ip}` | window | Fixed-window rate limiting |
| `lock:copy:{copyId}` | 10 s | Checkout/return serialization |

Book writes delete the detail key and every `catalog:search:v1:*` key. Rate-limit
windows and locks are per process; with multiple replicas each process enforces
its own window, while guarded copy updates remain the authoritative concurrency
control.

Notification dedupe (one overdue/due-soon notice per loan per day) uses a unique
MongoDB `dedupeKey` index instead of a cache key.

## 12. Search on MongoDB

Search queries the `books` collection directly. A free-text term builds a
case-insensitive regex across `title`, `subtitle`, `authors`, `isbn`, and
`description`; subject/language/publisher/year filters layer on top.

Facets are computed with aggregation pipelines over the same filter (text term
plus `ACTIVE` status), so refining by a facet never hides the other buckets:

| Facet | Pipeline |
| --- | --- |
| `subjects` | `$unwind` then `$group` by subject, top 15 |
| `languages` | `$group` by `language`, top 10 |
| `publishers` | `$group` by `publisher`, top 10 |

Availability is enriched from `BookCopy` for the current page only, so inventory
is always fresh. Results are cached in process for 30 seconds and invalidated on
book writes. There is no separate index to rebuild.

## 13. Background jobs

In-process interval workers (replace with a queue/worker in production):

- Every 15 minutes: notify due-soon (≤2 days) and overdue active loans; the
  unique `dedupeKey` index keeps it to one notice per loan per day.
- Every 5 minutes: expire `READY` reservations past their hold window, release
  the copy, notify the member, and promote the next reservation.

Jobs are idempotent and never throw into the process loop.

## 14. Reporting

Reporting reads the ledger collections through Prisma and folds the rows in
process: daily loans, daily fine revenue, outstanding balance, overdue counts and
aging buckets, top-borrowed titles, and hold pipeline. Mongo supplies titles for
the top-books list. Reports are staff-only and computed on demand; at larger
scale, materialize daily rollups or move the aggregation into a `$group`
pipeline.

## 15. Failure modes

| Failure | Behavior |
| --- | --- |
| MongoDB down | Whole API is unavailable — one store, no partial mode. Health check fails fast at startup |
| Mongo running without a replica set | Prisma writes fail with `P2031`; start `mongod --replSet rs0` and run `rs.initiate()` once |
| API crash mid-request | Prisma transaction rolls back; in-process locks/cache die with the process; side effects are at-least-once only after commit |
| Duplicate checkout | Second guarded update matches zero documents → 409 |
| Stale catalog cache | 30–60 s TTL; book writes invalidate immediately |

## 16. Production hardening roadmap

1. Transactional outbox for notifications and audit.
2. Multi-node replica set with majority write concern and retryable writes.
3. Idempotency keys on checkout/payment endpoints.
4. httpOnly refresh cookies already implemented; add CSRF double-submit for
   cookie-bearing endpoints and a strict CSP at the edge.
5. Replace in-process jobs with a durable queue or a dedicated worker.
6. Real email/SMS provider behind the existing notification interface.
7. Read preference for reports; materialized daily rollups.
8. Soft deletes and retention policies for members and financial records.
9. MongoDB text index (or an external engine) if catalog search outgrows regex.
10. Payment gateway with webhook reconciliation instead of manual payment entry.
