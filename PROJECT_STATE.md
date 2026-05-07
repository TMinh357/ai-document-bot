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
- Per-page role gates redirect employees away from `/reviews` and `/admin/*`
- Document detail page restricted to owner / assigned reviewer / admin

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
- Extract text from latest version (pdf2json + getRawTextContent + camelCase boundary recovery)
- Mock summary / key points / risk notes (heuristic only, NOT real LLM)
- Mock Q&A persistence
- Per-version state isolation (AIWorkspace remounts on version change via `key={latestVersion?.id}`)

### Digital signature
- SHA-256 hash of latest file → stored in `document_signatures` (only on `approved` status)
- Verify Integrity button — recomputes hash, compares with stored, returns ✓ / ✗
- `/documents/[id]/certificate` page — print-friendly certificate with title, signer, signed time, hash, status, live verification result

### Notifications
- In-app notifications (review assigned, approved, rejected) shown on dashboard
- Mark read / unread, mark all read

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

## Known gaps

- AI summary is heuristic, not OpenAI-powered
- Signature is just a file hash — no cryptographic proof of signer identity
- Scanned/image-only PDFs still produce no text (no OCR step) — text-based PDFs only
- `SUPABASE_SERVICE_ROLE_KEY` must be set in Vercel env vars (User Management page fails at render time without it)

## Recommended next moves (graduation impact)

1. **Replace mock AI with real OpenAI calls.** `openai` is installed; `app/api/documents/[id]/ai-summary` and `ai-chat` should call GPT-4 instead of doing string heuristics.
2. **Real cryptographic signature** via Web Crypto API (per-user keypair, sign the hash with the private key, verify with the public key).

Lower-priority but valuable: multi-reviewer workflows, inline PDF viewer with `react-pdf` + annotations, email notifications via Resend, review SLAs/due dates, Supabase Realtime for live updates, Playwright E2E tests, README with architecture diagram, demo video.

## Important environment

- `.env.local` must have: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Vercel needs the same three env vars on Production (and Preview if used)
- `SUPABASE_SERVICE_ROLE_KEY` must NOT be `NEXT_PUBLIC_*` — keep it server-only

## Where to look for what

- DB schema / RLS / sample data: `SUPABASE_CONTEXT.md`
- Auth helpers: `lib/supabase/auth.ts`
- Service-role client: `lib/supabase/admin.ts`
- Workflow rules: `CLAUDE.md`
- Next.js 16 caveats: `AGENTS.md`
