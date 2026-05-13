# AI Document Review Assistant — Project State

> Snapshot for any new chat session. Read this first before suggesting changes.
> Last updated: 2026-05-06

## Goal

Graduation project: a document-review SaaS where employees submit PDF documents, reviewers approve/reject with comments, and admins manage the system. Includes an AI assistant for text extraction / summary / Q&A and digital signature with integrity verification.

## Stack

- Next.js 16 (App Router, Turbopack, React Server Components — has breaking changes from older versions; see `AGENTS.md`)
- React 19
- Tailwind v4 (custom design system: `page-shell`, `section-card`, `metric-card`, `button-primary/secondary`, `status-pill`, `eyebrow`, `muted-copy`)
- Supabase (Auth, Postgres + RLS, Storage)
- TypeScript strict
- `pdf-parse` (1.1.1) for PDF text extraction — wraps `pdfjs-dist`, outputs proper word spacing without camelCase recovery hacks
- `openai` package installed but currently unused for real LLM calls
- Deployed on Vercel

## Roles

- **employee** — creates/uploads/submits own documents; cannot see other employees' docs; no admin/review access
- **reviewer** — sees and approves/rejects documents assigned via the `approvals` table; cannot edit/delete employee docs
- **admin** — system-wide access; manages users + roles; uses service-role API routes for privileged actions

RBAC is enforced at the page level via `lib/supabase/auth.ts` (`requireUser`, `requireRole`). RLS exists but `documents` / `document_versions` SELECT is still `USING (TRUE)` — page-level checks are the primary gate.

## Features built

### Auth & access
- Sign in / sign out / register flow
- **Admin approval required for new accounts** — every new sign-up lands with `profiles.status = 'pending'`. `requireUser()` redirects non-approved users to `/account-status`, which shows a pending or rejected message and a sign-out button. Admins approve / reject from `/admin/users`; the user receives an in-app notification on the decision and a `ADMIN_CHANGE_USER_STATUS` audit log entry is recorded.
- Per-page role gates redirect employees away from `/reviews` and `/admin/*`
- Document detail page restricted to owner / assigned reviewer / admin
- Header on every page shows a `<UserBadge />` chip with full name, email, and role next to the notification bell

### Documents
- Create + upload PDF (V1) — server-validated via `/api/documents` (magic bytes `%PDF-`, max 10 MB)
- Multi-version uploads with "Latest" / "Superseded" badges (only owner can upload while status is `draft` or `rejected`) — server-validated via `/api/documents/[id]/versions`
- Submit for review (draft → pending) — owner picks **N reviewers** at submission time; document is approved only when all reviewers approve, rejected immediately if any reviewer rejects (early termination locks the round)
- Each submission is a "round" (`approvals.round_no`); resubmit-after-rejection bumps round_no, owner picks reviewers again, old rounds preserved as history grouped per round
- Resubmit-after-rejection: red **Revision Required** banner with the rejection comment, owner uploads a new version which resets status to `draft`, then submits again
- Comment optional on approve, required on reject
- Document statuses: `draft / pending / approved / rejected / signed`
- Owner-only Submit form, reviewer-only Approve/Reject form (when assigned and pending)

### AI Assistant
- **Hybrid text extraction**: `pdf-parse` reads the text layer first; if the result is < 100 chars (scanned/image-only PDF) the same buffer is uploaded via OpenAI Files API and the multimodal model performs OCR (fallback path). `audit_logs.metadata.path` records `text_layer` vs `ocr_vision`. Page cap: OCR refuses PDFs > 10 pages.
- **Real OpenAI-powered** summary / key points / risk notes via structured-output JSON schema (model forced to return `{summary, key_points[], risk_notes[]}` — no fragile parsing)
- **Real OpenAI-powered** Q&A grounded in extracted document text
- Cost protections: 12k-char input truncation, 1k-char question cap, model + token usage logged into `audit_logs.metadata` per call
- Model swap via `OPENAI_MODEL` env var (default `gpt-5.4-mini`); separate optional `OPENAI_OCR_MODEL` for the OCR path (defaults to `OPENAI_MODEL`); domain errors map to proper HTTP codes — 503 (not configured), 429 (rate limit), 402 (quota exhausted), 413 (OCR page cap exceeded)
- Caching is implicit: detail page loads the latest `document_ai_results` row by `created_at DESC`, so the most recent summary wins; users click "Generate Summary" to refresh
- Per-version state isolation (AIWorkspace remounts on version change via `key={latestVersion?.id}`)

### Digital signature
- SHA-256 hash of latest file → stored in `document_signatures` (only on `approved` status)
- Verify Integrity button — recomputes hash, compares with stored, returns ✓ / ✗
- `/documents/[id]/certificate` page — print-friendly certificate with title, signer, signed time, hash, status, live verification result

### Notifications
- In-app notifications (review assigned, approved, rejected) shown on dashboard
- Mark read / unread, mark all read
- **Realtime live updates** via Supabase Realtime — the notification bell receives INSERT/UPDATE events scoped to `user_id` and updates the badge + dropdown without reload. The dashboard wraps a `<DashboardRealtime>` client component that subscribes to `notifications` / `approvals` / `documents` changes for the current user and triggers `router.refresh()` (debounced 400ms) so the three metric cards (Documents, Pending Reviews, Notifications) re-render with fresh counts.

### Dashboard
- Metric cards (Documents, Pending Reviews, Notifications) — scoped per role
- Visual charts (CSS-only, no library): Documents by Status, Documents by Month (last 6), Approval/Rejection Ratio
- Notification panel
- Quick actions

### Admin panel
- Admin dashboard with system metrics
- All users with role change (uses service-role admin client)
- All documents with delete (cascades cleanup of files + child rows)
- All approvals (read-only)
- Audit logs with filters: action / user / document / date range
- Advanced search on /admin/documents: title + description + extracted-text (ILIKE), status/owner/date filters, "Matched in extracted text" badge

### Inline PDF viewer & highlights
- `react-pdf` (10.x, pdfjs-dist 5.x worker copied to `public/pdf.worker.min.mjs` via `scripts/copy-pdf-worker.mjs` postinstall/predev/prebuild hook) renders the latest version inline on the document detail page
- Page nav (prev/next), zoom (50%–200%), text-layer enabled
- Loaded via `next/dynamic({ ssr: false })` through `components/PdfViewerLoader.tsx` because pdfjs touches `window`
- Reviewers in the current round can drag-select text → popover appears → comment textarea → POST highlight
- Highlights stored as bounding-rect percentages (page-relative, survives zoom/resize) in `document_highlights` table
- Right-pane sidebar lists every passage comment for the current version with click-to-jump; author can delete their own highlight
- `canHighlight` = reviewer has an approval row in the current round (any status)

### Document detail page
- Header with status badge
- Revision Required banner (when rejected, owner only)
- Uploaded Files section with version status pills + Upload New Version form
- AI Workspace (extract / summarize / chat)
- Submit for Review form (owner only, draft only) — multi-select reviewer checkbox list
- **Approval Progress card** (when status = pending) showing round number, X/Y approved, per-reviewer status pills
- Review Actions form (assigned reviewer in current round, pending only) — shows "X of Y approved" context
- Sign Document Panel with Verify Integrity + View Certificate link
- Approval History grouped by round (current round badged)
- Document Timeline (replaces old Activity Log) — vertical timeline with colored dots: Created, Uploaded, Submitted (one event per round, lists all reviewers), Approved/Rejected (per reviewer, tagged with round), Signed

## Review SLAs / due dates

- Owner picks a deadline at submission time (preset 1/3/7/14/30 days, default 7) — server stamps `approvals.due_at` on every row in the round.
- Dashboard + `/reviews` queue color-code each pending row: **red** (overdue), **amber** (due within 24h), **teal** (normal). Both pages sort by `due_at` ascending.
- Document detail "Approval Progress" card shows the round deadline + per-reviewer "Overdue" pill.
- **Lazy reminders**: when a reviewer loads `/dashboard` or `/reviews`, `lib/review-reminders.ts` fires for them — for each pending approval where `due_at < now()` AND (`last_reminded_at IS NULL` OR `last_reminded_at < now() - 24h`), a `review_overdue` notification is inserted and `last_reminded_at` is bumped. No external cron required.
- Email reminders are deferred (would require Resend integration).

Schema migration (run once):
```sql
ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS due_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamp with time zone;
CREATE INDEX IF NOT EXISTS approvals_due_at_idx ON approvals (due_at) WHERE status = 'pending';
```

## Multi-reviewer review pipeline

Both submission and decisions are now server-routed (analogous to the upload pipeline):

- **Submit for review** — `POST /api/documents/[id]/submit` with `{ reviewerIds: string[] }`. Server validates ownership + draft status + reviewer roles, computes `next_round = max(round_no) + 1`, inserts N approvals rows, sets doc to `pending`, sends one `review_assigned` notification per reviewer, audit-logs.
- **Reviewer decision** — `POST /api/approvals/[approvalId]/decide` with `{ status, comment }`. Server validates current round + reviewer identity + pending status, updates the approval row, then computes aggregate doc status:
  - any rejected → doc.status = `rejected` (round locked)
  - all approved → doc.status = `approved`
  - else → doc.status stays `pending`
- Owner gets `document_approved`/`document_rejected` on terminal state, or `review_progress` notifications mid-round.
- All historical rounds are preserved; the detail page filters to `round_no = max(round_no)` for the live progress UI.

Schema migration (run once):
```sql
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS round_no integer NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS approvals_doc_reviewer_round_idx ON approvals (document_id, reviewer_id, round_no);
```

## Highlights (passage comments)

Schema migration (run once):
```sql
CREATE TABLE IF NOT EXISTS document_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES profiles(id),
  page_number integer NOT NULL CHECK (page_number > 0),
  selected_text text NOT NULL,
  comment text NOT NULL,
  bounding_rects jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_highlights_version_idx ON document_highlights (document_version_id, page_number);
ALTER TABLE document_highlights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view highlights" ON document_highlights FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Reviewers can create their own highlights" ON document_highlights FOR INSERT TO authenticated WITH CHECK (auth.uid() = reviewer_id);
CREATE POLICY "Reviewers can delete their own highlights" ON document_highlights FOR DELETE TO authenticated USING (auth.uid() = reviewer_id);
```

- Server enforces "reviewer must have approval row in current round" gate on `POST /api/documents/[id]/highlights`
- `DELETE /api/documents/[id]/highlights/[highlightId]` allowed for highlight author or admin
- Coexists with approval-level `comment` (overall judgment); highlights are passage-specific
- Highlights are version-scoped — uploading a new version doesn't carry old highlights forward

## Upload pipeline

Both creation flows (new document, new version) use the same staging pattern:
1. Client preflight: 10 MB size check + `accept=".pdf,application/pdf"`
2. Client uploads to `${user.id}/_staging/${uuid}/${safeName}` (under user's RLS-allowed prefix)
3. Client POSTs to server route (`/api/documents` or `/api/documents/[id]/versions`)
4. Server validates magic bytes (`%PDF-`) + size via `lib/pdf-validation.ts` (Range request, no full download)
5. On invalid: server deletes the staging object and returns 400
6. On valid: server moves file to final path (`${user.id}/${docId}/${ts}-${name}`) and inserts the row

All `documents` / `document_versions` row inserts now happen via the admin client on the server — bypassing the validation gate by skipping the API call is impossible because the client can no longer insert rows directly.

## Tightened SELECT RLS (documents + document_versions)

Permissive `USING (TRUE)` SELECT policies were replaced with row-scoped checks so the anon-key client can only read rows the user is authorized for. Page-level role gates (`requireUser`, `requireRole`) remain as defense in depth on top.

Access matrix (SELECT):
- **owner** — `owner_id = auth.uid()`
- **assigned reviewer** (any round) — has at least one `approvals` row with `reviewer_id = auth.uid()` for that document
- **admin** — `profiles.role = 'admin'` for the calling user

`document_versions` inherits visibility from `documents` via `EXISTS (SELECT 1 FROM documents WHERE documents.id = document_versions.document_id)` — RLS on the inner query ensures only versions of accessible documents are returned, so the rule lives in one place.

Service-role API routes (`createAdminClient()`) bypass RLS, so server-side writes/admin operations are unaffected.

Schema migration (run once in Supabase SQL editor):
```sql
DROP POLICY IF EXISTS "Authenticated users can view documents" ON documents;
DROP POLICY IF EXISTS "Authenticated users can view document versions" ON document_versions;

CREATE POLICY "Users can view related documents"
ON documents FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM approvals
    WHERE approvals.document_id = documents.id
      AND approvals.reviewer_id = auth.uid()
  )
  OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

CREATE POLICY "Users can view versions of accessible documents"
ON document_versions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM documents
    WHERE documents.id = document_versions.document_id
  )
);
```

**Verification — gotcha**: the Supabase SQL editor runs as the `postgres` superuser by default, which **bypasses RLS entirely**. So `SELECT * FROM documents` in Studio always returns every row regardless of policies. There are two correct ways to verify:

- **Through the app (recommended)**: sign in as employee / reviewer / admin in three browser sessions and confirm `/documents`, `/reviews`, `/admin/documents` show the expected scoped lists. This is what RLS actually gates against (the anon-key client) and is the most defense-panel-friendly demo.
- **In Studio with impersonation** — wrap each test in a transaction:
```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"<user-uuid>","role":"authenticated"}';
SELECT id, title, owner_id FROM documents;
ROLLBACK;
```
Swap the `sub` UUID for the user being impersonated. Each `SET LOCAL` is bounded to the transaction, so `ROLLBACK` cleanly resets the session.

## Realtime live updates

Supabase Realtime broadcasts row-level INSERT / UPDATE / DELETE events over websockets, gated by the same RLS policies that govern SELECT. Two client components subscribe:

- **`components/NotificationBell.tsx`** — after the initial fetch, opens a channel `notifications:${user.id}` with two `postgres_changes` listeners (INSERT and UPDATE) filtered server-side by `user_id=eq.${user.id}`. On INSERT it prepends to the items array (dedup-guarded, capped at `RECENT_LIMIT`). On UPDATE it patches `is_read` in place. Optimistic mark-read writes still happen first; the realtime echo is a no-op.
- **`components/DashboardRealtime.tsx`** — mounted at the top of `/dashboard`, returns `null`. Opens a channel `dashboard:${user.id}` with three listeners: `notifications` (filtered to the user), `approvals` (filtered to `reviewer_id`), and `documents` (filtered to `owner_id` for non-admins, unfiltered for admins). On any event it calls `router.refresh()` with a 400ms debounce so the server component re-fetches all three metric cards + charts + the "My Pending Reviews" list. Channel is removed on unmount.

Realtime respects RLS — the websocket only delivers rows the user could SELECT — so the explicit `user_id` / `reviewer_id` / `owner_id` filters are an additional optimization (less noise, smaller payload), not a security control.

Schema migration (run once in Supabase SQL editor — enables row replication on the publication that Realtime watches):
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE documents;
ALTER PUBLICATION supabase_realtime ADD TABLE approvals;
```

Verification:
- Open `/dashboard` in two browser sessions signed in as different users.
- In session A (admin), assign a review to user B. Session B's bell badge increments and the "Pending Reviews" metric card updates without reload.
- Mark a notification read in one tab; the badge in another tab of the same user updates within ~1 second.

If you ever need to disable realtime for a table, drop it from the publication:
```sql
ALTER PUBLICATION supabase_realtime DROP TABLE notifications;
```

## Account approval (admin gate on registration)

Every new auth user lands as `profiles.status = 'pending'`. The `requireUser()` helper in `lib/supabase/auth.ts` checks the status after fetching the profile and redirects anything except `approved` to `/account-status`. That page reads the status itself (without going through `requireUser`, to avoid a redirect loop) and shows the pending vs rejected message with a sign-out button.

Admin flow: `/admin/users` lists every user, sorts pending accounts to the top, and shows an "X pending approvals" banner. Each row has a `StatusSelector` client component with Approve / Reject buttons that hit `PATCH /api/admin/users/[id]/status` (service-role write). The route writes the new status, inserts an audit log entry (`ADMIN_CHANGE_USER_STATUS`), and posts an `account_approved` / `account_rejected` notification to the affected user so the bell + `/notifications` show it.

Schema migration (run once in Supabase SQL editor):
```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- Bootstrap: every existing account is grandfathered as approved so currently
-- signed-in users (especially admins) are not locked out.
UPDATE profiles SET status = 'approved' WHERE status = 'pending';
```

After the migration, the column default of `'pending'` applies to any *new* profile row created by the existing `handle_new_user` trigger, so the registration → admin approval flow takes effect automatically.

## Known gaps

- Signature is just a file hash — no cryptographic proof of signer identity
- OCR is capped at 10 pages per document; longer scanned PDFs return a 413 error and need to be split first
- README is graduation-friendly but lacks screenshots and a deployed URL placeholder is still pending

## Recommended next moves (graduation impact)

1. **Real cryptographic signature** via Web Crypto API (per-user keypair, sign the hash with the private key, verify with the public key).

Lower-priority but valuable: email notifications via Resend, Playwright E2E tests, demo video.

## Important environment

- `.env.local` must have: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`
- Vercel needs the same five env vars on Production (and Preview if used)
- `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` must NOT be `NEXT_PUBLIC_*` — keep them server-only
- `OPENAI_MODEL` defaults to `gpt-5.4-mini` if unset — fine for dev; set explicitly in Vercel for clarity
- Optional: `OPENAI_OCR_MODEL` overrides the model used by the OCR fallback path; defaults to whatever `OPENAI_MODEL` is. If your chat model doesn't support PDF file inputs, set this to a vision-capable model (e.g. `gpt-4o-mini`).

## Where to look for what

- DB schema / RLS / sample data: `SUPABASE_CONTEXT.md`
- Auth helpers: `lib/supabase/auth.ts`
- Service-role client: `lib/supabase/admin.ts`
- Workflow rules: `CLAUDE.md`
- Next.js 16 caveats: `AGENTS.md`
