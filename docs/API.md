# API reference

Base URL: `http://localhost:4000/api` (or `/api` through the web proxy).

Auth: send `Authorization: Bearer <accessToken>`. The refresh token lives in the
HttpOnly cookie set by login; refresh rotates it. All money fields are integer
paise (INR minor units). IDs are UUIDs except `bookId` (Mongo ObjectId string).

Roles: `M` = Member, `L` = Librarian, `A` = Admin.

## Auth

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| POST | `/auth/register` | public | Self-register a member account |
| POST | `/auth/login` | public | Returns access token + sets refresh cookie |
| POST | `/auth/refresh` | cookie | Rotates refresh token, returns new access token |
| POST | `/auth/logout` | cookie | Revokes session and clears cookie |
| GET | `/auth/me` | any | Current user + member profile |

## Catalog

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| GET | `/books?q=&subject=&language=&publisher=&yearFrom=&yearTo=&page=&pageSize=&sort=` | public | Full-text search with facets |
| GET | `/books/:id` | public | Book detail with live copy counts |
| POST | `/books` | L,A | Create book (optionally initial copies) |
| PATCH | `/books/:id` | L,A | Update metadata |
| DELETE | `/books/:id` | A | Archive (blocked by active issues) |
| POST | `/books/:id/copies` | L,A | Add physical copies |
| GET | `/books/:id/copies` | L,A | List copies and status |
| GET | `/books/:id/reviews` | public | Reviews for a book |
| POST | `/books/:id/reviews` | M | Create/update own review (verified borrowers only) |

Search response:

```json
{
  "items": [{ "id": "…", "title": "…", "availableCopies": 2, "totalCopies": 4 }],
  "total": 42, "page": 1, "pageSize": 12,
  "facets": { "subjects": [{ "key": "Fiction", "count": 9 }],
              "languages": [], "publishers": [] }
}
```

## Circulation

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| POST | `/loans/checkout` | L,A | `{ memberId \| memberQuery, copyCode \| bookId }` |
| POST | `/loans/:id/return` | L,A | Assess fine, release/hold copy |
| POST | `/loans/:id/renew` | L,A | Extend due date if eligible |
| POST | `/loans/:id/lost` | L,A | Close issue, charge replacement fee |
| GET | `/loans/me` | M | Own issued books with dates and metadata |
| GET | `/loans?status=active\|overdue\|returned&memberId=&page=` | L,A | Circulation list |
| POST | `/reservations` | L,A | `{ memberId \| memberQuery, bookId }` — queue or immediate hold |
| GET | `/reservations?bookId=` | L,A | Queue for a title |
| POST | `/reservations/:id/cancel` | L,A | Release copy, promote next |

Members are read-only: every circulation and reservation write requires
`LIBRARIAN` or `ADMIN`. A member calling these endpoints receives `403`.

`GET /me/summary` returns the member desk payload: membership, active issues,
history, reservations, fines, outstanding dues, unread notification count.

## Fines & payments

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| GET | `/fines/me` | M | Own fines and payments |
| GET | `/fines?status=&memberId=&page=` | L,A | Fine ledger |
| POST | `/fines/:id/payments` | L,A | `{ amount, method, reference? }` — partial allowed |
| POST | `/fines/:id/waive` | A | Waive remaining balance with note |

## Members

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| GET | `/members?q=&page=` | L,A | Search members |
| GET | `/members/lookup?q=` | L,A | Fast lookup by email, name, or membership no. |
| GET | `/members/:id` | L,A | Member detail + obligations |
| POST | `/members` | L,A | Create credentialed member |
| PATCH | `/members/:id` | L,A | Status, max loans, expiry (suspension is admin-safe) |

## Notifications & reports

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| GET | `/notifications/me?unread=` | any | Own notification feed |
| POST | `/notifications/:id/read` | any | Mark one read |
| POST | `/notifications/read-all` | any | Mark all read |
| GET | `/reports/dashboard?days=30` | L,A | KPIs, series, top books, aging, holds |
| GET | `/reports/audit?page=` | A | Audit log viewer |

## Errors

Uniform shape:

```json
{ "error": { "message": "Copy is not available", "code": "CONFLICT", "details": null } }
```

`400` validation, `401` missing/expired access token, `403` role/membership,
`404` missing, `409` conflict (busy copy, status, duplicate), `429` rate limit,
`500` unexpected.
