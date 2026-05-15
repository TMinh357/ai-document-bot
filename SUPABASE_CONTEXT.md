# Supabase Context for AI Document Review Assistant

> Schema reference reflecting the post-migration state of the database.
> Last refreshed: 2026-05-13. All migrations documented in `PROJECT_STATE.md`
> have been applied.

## 1. Project Overview

**Project name:** AI Document Review Assistant

**Tech stack:**
- Next.js 16 (App Router, React Server Components, Turbopack)
- Supabase Auth (cookie-based JWT)
- Supabase PostgreSQL with Row-Level Security
- Supabase Storage (`documents` bucket)
- Supabase Realtime (notification bell + dashboard live updates)
- Vercel

**Roles** (`profiles.role`):
- `employee` — creates documents, uploads PDF files, submits documents for review
- `reviewer` — reviews assigned documents, approves or rejects with comments, can add passage-level highlights
- `admin` — system-wide access; manages users + roles + account approvals via service-role API routes

**Account approval gate** (`profiles.status`):
- Every new sign-up lands with `status = 'pending'`
- `requireUser()` (lib/supabase/auth.ts) redirects non-approved users to `/account-status`
- Admins approve/reject from `/admin/users`; the affected user receives an in-app notification

---

## 2. Database Schema

```
table_name              column_name           data_type                    is_nullable  column_default
approvals               id                    uuid                         NO           gen_random_uuid()
approvals               document_id           uuid                         NO           null
approvals               reviewer_id           uuid                         NO           null
approvals               status                text                         NO           'pending'::text
approvals               comment               text                         YES          null
approvals               created_at            timestamp with time zone     YES          now()
approvals               reviewed_at           timestamp with time zone     YES          null
approvals               round_no              integer                      NO           1
approvals               due_at                timestamp with time zone     YES          null
approvals               last_reminded_at      timestamp with time zone     YES          null
audit_logs              id                    uuid                         NO           gen_random_uuid()
audit_logs              user_id               uuid                         YES          null
audit_logs              action                text                         NO           null
audit_logs              target_table          text                         YES          null
audit_logs              target_id             uuid                         YES          null
audit_logs              metadata              jsonb                        YES          null
audit_logs              created_at            timestamp with time zone     YES          now()
document_ai_messages    id                    uuid                         NO           gen_random_uuid()
document_ai_messages    document_id           uuid                         NO           null
document_ai_messages    user_id               uuid                         YES          null
document_ai_messages    question              text                         NO           null
document_ai_messages    answer                text                         NO           null
document_ai_messages    created_at            timestamp with time zone     YES          now()
document_ai_results     id                    uuid                         NO           gen_random_uuid()
document_ai_results     document_id           uuid                         NO           null
document_ai_results     user_id               uuid                         YES          null
document_ai_results     summary               text                         YES          null
document_ai_results     key_points            text                         YES          null
document_ai_results     risk_notes            text                         YES          null
document_ai_results     created_at            timestamp with time zone     YES          now()
document_highlights     id                    uuid                         NO           gen_random_uuid()
document_highlights     document_id           uuid                         NO           null
document_highlights     document_version_id   uuid                         NO           null
document_highlights     reviewer_id           uuid                         NO           null
document_highlights     page_number           integer                      NO           null
document_highlights     selected_text         text                         NO           null
document_highlights     comment               text                         NO           null
document_highlights     bounding_rects        jsonb                        NO           null
document_highlights     created_at            timestamp with time zone     YES          now()
document_signatures     id                    uuid                         NO           gen_random_uuid()
document_signatures     document_id           uuid                         NO           null
document_signatures     signer_id             uuid                         NO           null
document_signatures     signature_hash        text                         NO           null
document_signatures     signed_at             timestamp with time zone     YES          now()
document_versions       id                    uuid                         NO           gen_random_uuid()
document_versions       document_id           uuid                         NO           null
document_versions       version_no            integer                      NO           null
document_versions       file_path             text                         YES          null
document_versions       content_text          text                         YES          null
document_versions       created_by            uuid                         YES          null
document_versions       created_at            timestamp with time zone     YES          now()
documents               id                    uuid                         NO           gen_random_uuid()
documents               title                 text                         NO           null
documents               description           text                         YES          null
documents               owner_id              uuid                         NO           null
documents               status                text                         NO           'draft'::text
documents               created_at            timestamp with time zone     YES          now()
documents               updated_at            timestamp with time zone     YES          now()
notifications           id                    uuid                         NO           gen_random_uuid()
notifications           user_id               uuid                         NO           null
notifications           type                  text                         NO           null
notifications           title                 text                         NO           null
notifications           message               text                         YES          null
notifications           document_id           uuid                         YES          null
notifications           is_read               boolean                      NO           false
notifications           created_at            timestamp with time zone     YES          now()
profiles                id                    uuid                         NO           null
profiles                full_name             text                         YES          null
profiles                role                  text                         NO           'employee'::text
profiles                status                text                         NO           'pending'::text
profiles                created_at            timestamp with time zone     YES          now()
```

**Enum-like text columns and their allowed values:**

| Column | Allowed values | Notes |
|---|---|---|
| `documents.status` | `draft / pending / approved / rejected / signed` | Lifecycle managed by server routes |
| `approvals.status` | `pending / approved / rejected` | Reviewer decision |
| `profiles.role` | `employee / reviewer / admin` | Admin-managed |
| `profiles.status` | `pending / approved / rejected` | CHECK constraint enforced |
| `notifications.type` | `review_assigned`, `review_progress`, `review_overdue`, `document_approved`, `document_rejected`, `account_approved`, `account_rejected` | New types append-only |

---

## 3. Foreign Keys

```
table_name              column_name             foreign_table       foreign_column   on_delete
approvals               document_id             documents           id               CASCADE
approvals               reviewer_id             profiles            id               (default)
document_ai_messages    document_id             documents           id               (default)
document_ai_results     document_id             documents           id               (default)
document_highlights     document_id             documents           id               CASCADE
document_highlights     document_version_id     document_versions   id               CASCADE
document_highlights     reviewer_id             profiles            id               (default)
document_signatures     document_id             documents           id               (default)
document_versions       document_id             documents           id               (default)
documents               owner_id                profiles            id               (default)
notifications           user_id                 auth.users          id               CASCADE
notifications           document_id             documents           id               CASCADE
profiles                id                      auth.users          id               CASCADE
```

---

## 4. RLS Policies

Row-Level Security is enabled on every table in the `public` schema. The anon-key client used in client components (`createClient` from `@supabase/ssr`) is bound by these policies. Service-role API routes (`createAdminClient()`) bypass RLS.

### `documents`

| Command | Using / Check |
|---|---|
| SELECT | `owner_id = auth.uid()` OR EXISTS approval row with `reviewer_id = auth.uid()` OR `profiles.role = 'admin'` for caller |
| INSERT | `auth.uid() = owner_id` (legacy — current writes happen via service-role) |
| UPDATE (owner) | `auth.uid() = owner_id` |
| UPDATE (reviewer) | EXISTS approval row with `reviewer_id = auth.uid()` |

The permissive `USING (TRUE)` SELECT policy that previously existed was dropped in the RLS-tightening migration documented in `PROJECT_STATE.md`.

### `document_versions`

| Command | Using / Check |
|---|---|
| SELECT | EXISTS parent document — inherits RLS from `documents` |
| INSERT | `auth.uid() = created_by` |
| UPDATE | `created_by = auth.uid()` OR caller owns the parent document |

### `approvals`

| Command | Using / Check |
|---|---|
| SELECT | authenticated TRUE (rows narrowed by app-level filters) |
| INSERT | EXISTS document owned by `auth.uid()` (legacy — current writes happen via `/api/documents/[id]/submit` using service-role) |
| UPDATE | `auth.uid() = reviewer_id` |

### `profiles`

| Command | Using / Check |
|---|---|
| SELECT (any authenticated) | authenticated TRUE (needed so reviewer pickers can render names) |
| SELECT (own) | `auth.uid() = id` |
| UPDATE (own) | `auth.uid() = id` (role/status changes happen via service-role) |

### `audit_logs`

| Command | Using / Check |
|---|---|
| SELECT | authenticated TRUE (admin audit log viewer) |
| SELECT (own) | `auth.uid() = user_id` |
| INSERT | `auth.uid() = user_id` |

### `document_ai_messages`, `document_ai_results`, `document_signatures`

| Command | Using / Check |
|---|---|
| SELECT | authenticated TRUE |
| INSERT | `auth.uid() = user_id` (or `signer_id` for signatures) |

### `document_highlights`

| Command | Using / Check |
|---|---|
| SELECT | authenticated TRUE (downstream queries filter by `document_version_id`) |
| INSERT | `auth.uid() = reviewer_id` (server route additionally verifies the reviewer has an approval row in the current round) |
| DELETE | `auth.uid() = reviewer_id` (admins use service-role) |

### `notifications`

| Command | Using / Check |
|---|---|
| SELECT | `auth.uid() = user_id` |
| UPDATE | `auth.uid() = user_id` (only for mark read/unread) |
| INSERT | service-role only — no anon-key policy |

---

## 5. Indexes

```
approvals_due_at_idx                  approvals (due_at)               WHERE status = 'pending'
approvals_doc_reviewer_round_idx      approvals (document_id, reviewer_id, round_no)   UNIQUE
document_highlights_version_idx       document_highlights (document_version_id, page_number)
```

Primary keys and FK indexes are not listed here — Postgres creates those implicitly.

---

## 6. Triggers & Functions

| Name | Type | Purpose |
|---|---|---|
| `handle_new_user` | trigger function on `auth.users` INSERT | Creates a `profiles` row for every new auth user with `role = 'employee'` and `status = 'pending'` (admin must approve before the user can sign in). |

---

## 7. Realtime publication

Tables added to the `supabase_realtime` publication for websocket replication:

```
notifications
documents
approvals
```

- `components/NotificationBell.tsx` subscribes to INSERT/UPDATE on `notifications` filtered by `user_id`.
- `components/DashboardRealtime.tsx` subscribes to all three (notifications by `user_id`, approvals by `reviewer_id`, documents by `owner_id` for non-admins or unfiltered for admins) and triggers `router.refresh()` on any event.

Realtime respects RLS — the websocket only delivers rows the user could SELECT — so the explicit per-user filters are an optimization, not a security control.

---

## 8. Storage

**Bucket:** `documents` (private)

**Path conventions:**
- Final: `${user.id}/${document_id}/${timestamp}-${safeName}`
- Staging (during upload validation): `${user.id}/_staging/${uuid}/${safeName}`

Upload pipeline (`PROJECT_STATE.md` → "Upload pipeline"): client uploads to staging path under the user's RLS-allowed prefix, server validates magic bytes via a Range request, then moves the file to the final path and inserts the `documents` / `document_versions` row using the service-role client. Bypassing the validation gate is impossible because anon-key clients can no longer insert document rows directly.

---

## 9. Sample data

### profiles

| id (truncated) | full_name | role | status | created_at |
|---|---|---|---|---|
| 6a4b8205… | minh | employee | approved | 2026-04-28 |
| e9c66098… | tm | reviewer | approved | 2026-04-28 |
| 663cbfe5… | tm2 | reviewer | approved | 2026-04-28 |
| 9062e822… | tm3 | admin | approved | 2026-04-29 |

All four pre-existing accounts were grandfathered to `status = 'approved'` by the bootstrap `UPDATE` in the account-approval migration. Any sign-up after the migration starts as `pending`.

### documents

| id (truncated) | title | owner_id (truncated) | status |
|---|---|---|---|
| 481f3d9e… | TM | 6a4b8205… | draft |
| cf0080de… | tm2 | 6a4b8205… | signed |
