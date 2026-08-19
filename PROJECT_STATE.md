# AI Document Review Assistant — Project State

> Snapshot for any new chat session. Read this first before suggesting changes.
> Last updated: 2026-06-09 (verified against source)

## Goal

Graduation project: a document-review SaaS where employees submit PDF documents, reviewers approve/reject with comments, and admins manage the system. Includes an AI assistant for text extraction / summary / Q&A and **WebAuthn (Windows Hello) multi-party digital signatures** with integrity verification.

## Stack

- Next.js 16 (App Router, Turbopack, React Server Components — has breaking changes from older versions; see `AGENTS.md`)
- React 19
- Tailwind v4 (custom design system in `app/globals.css`: `page-shell`, `section-card`, `metric-card`, `button-primary/secondary/success/danger`, `status-pill`, `eyebrow`, `muted-copy`, `select-field`, `textarea-field`). Visual direction is **flat / production-tool** (solid `#f7f8fa` background, hairline `#e5e7eb` borders, ~10px radii, minimal shadows, flat solid buttons, normal-case labels) — deliberately not the gradient/glassmorphism look. Surface classes force a single 10px radius via `!important` to override leftover `rounded-[2rem]` utilities in markup.
- Supabase (Auth, Postgres + RLS, Storage, Realtime)
- TypeScript strict
- `pdf-parse` (1.1.1) for PDF text extraction — wraps `pdfjs-dist`, outputs proper word spacing without camelCase recovery hacks
- `react-pdf` (10.x) for the inline PDF viewer
- `@simplewebauthn/server` + `@simplewebauthn/browser` (13.x) for WebAuthn registration, signing assertions, and verification
- `openai` package — powers AI summary, key points, risk notes, Q&A (structured-output JSON schema) and the OCR fallback path via the Files API
- Deployed on Vercel (functions pinned to the Singapore `sin1` region)

## Roles

- **employee** — creates/uploads/submits own documents; cannot see other employees' docs; no admin/review access
- **reviewer** — sees and approves/rejects documents assigned via the `approvals` table; cannot edit/delete employee docs
- **admin** — system-wide access; manages users + roles; uses service-role API routes for privileged actions. Admins can also be picked as reviewers.

RBAC is enforced at the page level via `lib/supabase/auth.ts` (`requireUser`, `requireRole`) **and** by row-scoped RLS SELECT policies on `documents` / `document_versions` (see "Tightened SELECT RLS"). All privileged writes go through service-role API routes.

## Document lifecycle (state machine)

`draft → pending → approved` (happy path) or `draft → pending → rejected → (new version) → draft → pending …`

- The owner signs the file with Windows Hello at submission, which moves `draft → pending`.
- Each assigned reviewer signs with Windows Hello when approving. The document becomes `approved` only when **every** reviewer in the current round has approved; a single rejection flips it to `rejected` and locks the round.
- There is **no separate `signed` status** — signing is integrated into submission + approval. (`'signed'` still exists as a leftover allowed value in the `documents.status` column, but nothing in the workflow ever sets it and it has been removed from the dashboard charts. Treat it as deprecated.)

## Features built

### Auth & access
- Sign in / sign out / register flow
- **Admin approval required for new accounts** — every new sign-up lands with `profiles.status = 'pending'`. `requireUser()` redirects non-approved users to `/account-status`, which shows a pending or rejected message and a sign-out button. Admins approve / reject from `/admin/users`; the user receives an in-app notification on the decision and a `ADMIN_CHANGE_USER_STATUS` audit log entry is recorded.
- Per-page role gates redirect employees away from `/reviews` and `/admin/*`
- Document detail page restricted to owner / assigned reviewer / admin (enforced both by RLS and an explicit redirect check)
- Header on every page shows a `<UserBadge />` chip with full name, email, and role next to the notification bell

### Documents
- Create + upload PDF (V1) — server-validated via `/api/documents` (magic bytes `%PDF-`, max 10 MB)
- Multi-version uploads with "Latest" / "Superseded" badges (only owner can upload while status is `draft` or `rejected`) — server-validated via `/api/documents/[id]/versions`
- Submit for review (draft → pending) — owner picks **N reviewers** at submission time and signs with Windows Hello; document is approved only when all reviewers approve, rejected immediately if any reviewer rejects (early termination locks the round)
- Each submission is a "round" (`approvals.round_no`); resubmit-after-rejection bumps round_no, owner picks reviewers again and re-signs, old rounds preserved as history grouped per round
- Resubmit-after-rejection: red **Revision Required** banner with the rejection comment, owner uploads a new version which resets status to `draft`, then submits again
- Comment optional on approve, required on reject
- **Status-filtered list** at `/documents?status=<draft|pending|approved|rejected>`: server-rendered filter tabs (All / Draft / Pending / Approved / Rejected), each with a live per-status count badge; the active tab filters the owner's documents server-side. Next.js 16 `searchParams` is awaited (it's a Promise). Dashboard Quick Action cards deep-link into these views.
- **Owner draft deletion** — `DELETE /api/documents/[id]` lets the owner delete their own document **only while it is `draft`** (cascade-cleans files + child rows, audit-logs `DELETE_DRAFT_DOCUMENT`). Once submitted/approved/rejected the document carries approval + signature history, so deletion becomes admin-only (`DELETE /api/admin/documents/[id]`) to preserve the audit trail. Delete button (`components/DeleteDraftButton.tsx`) shows on the detail page only for owner + draft.

### Digital signatures (WebAuthn / Windows Hello — multi-party)

This is the project's centerpiece. It replaced the original hash-only design and a discarded IndexedDB-keypair design (see "History" below).

- **Mechanism**: each signing event is a WebAuthn authentication ceremony. The **challenge is the SHA-256 hash of the latest file** (hex → base64url), so the signature is cryptographically bound to the exact file bytes. The private key is a platform-authenticator (Windows Hello / Touch ID) credential, TPM-backed and non-extractable; `requireUserVerification: true` forces a PIN/biometric at every signature.
- **Multi-party model**:
  - **Owner** signs at submission — `POST /api/documents/[id]/submit` requires a WebAuthn assertion; stored with `signature_role = 'owner_submission'`.
  - **Each approving reviewer** signs at decision time — `POST /api/approvals/[approvalId]/decide` requires an assertion **only when approving** (rejection needs none); stored with `signature_role = 'reviewer_approval'`.
- **One-time key setup**: `components/SigningKeySetup.tsx` modal preflights `platformAuthenticatorIsAvailable()`, then registers a credential via `/api/profile/webauthn/register-options` (challenge stored in a 5-minute HttpOnly cookie) → `startRegistration()` → `/api/profile/webauthn/register` (`verifyRegistrationResponse`, `attestationType: 'none'`, `authenticatorAttachment: 'platform'`). The credential id, public key, sign counter, device type, transports, AAGUID, and registered-at timestamp are saved on the `profiles` row.
- **Server verification** (`lib/webauthn/verify.ts`): `verifyAuthenticationResponse` with the expected challenge = file hash, expected origin/RPID from `lib/webauthn/config.ts`, `requireUserVerification: true`. On success the route updates `profiles.webauthn_counter` so a cloned authenticator's replayed assertion is rejected next time.
- **Storage**: signatures live in the `document_signatures` table only — `signature_hash`, `signature_bytes`, `client_data_json`, `authenticator_data`, `credential_id`, `algorithm` (`'WebAuthn-ES256'`), `signature_role`, `round_no`, `signed_at`. The original PDF bytes are never modified (PAdES/PKCS#7 embedding is deliberately out of scope).
- **Verify Integrity** (`/api/documents/[id]/signature/verify`) and the **certificate page** (`/documents/[id]/certificate`) both recompute the current file hash and re-verify **every** signature in parallel (`Promise.all`) — checking `hashMatch` (stored hash vs current file) and re-running the ECDSA verification against each signer's stored public key (`counter: 0` to bypass the replay check for stored signatures). The certificate decodes `authenticatorData` flags (user-verified, user-present, backup-eligible, sign counter) and resolves the AAGUID to a friendly authenticator name (`lib/webauthn/aaguid-registry.ts`).
- **Performance caching**: `lib/document-hash.ts` (`getOrComputeLatestVersionHash`) reads `document_versions.content_hash` when present and lazily backfills it on the first miss, so sign/verify operations don't re-download the file every time.
- **approved_hash snapshot**: when a round reaches unanimous approval, the decide route snapshots the verified file hash onto `documents.approved_hash` so later tampering is detectable against the approved-state fingerprint.
- **Tamper-detection demo**: three scenarios are demonstrable — (a) valid file matching all signatures, (b) file modified between owner submission and reviewer approval, (c) file modified after both parties signed. Each shows hash mismatch + crypto-invalid on the affected signature.

### AI Assistant
- **Hybrid text extraction** (`/api/documents/[id]/extract-text`): `pdf-parse` reads the text layer first; if the result is < 100 chars (scanned/image-only PDF) the same buffer is uploaded via OpenAI Files API and the multimodal model performs OCR (fallback path). `audit_logs.metadata.path` records `text_layer` vs `ocr_vision`. Page cap: OCR refuses PDFs > 10 pages (`AIOcrPageLimitError` → HTTP 413).
- **Real OpenAI-powered** summary / key points / risk notes via structured-output JSON schema (model forced to return `{summary, key_points[], risk_notes[]}` — no fragile parsing)
- **Real OpenAI-powered** Q&A grounded in extracted document text
- Cost protections: 12k-char input truncation, model + token usage logged into `audit_logs.metadata` per call
- Model swap via `OPENAI_MODEL` env var (default `gpt-5.4-mini`); separate optional `OPENAI_OCR_MODEL` for the OCR path (defaults to `OPENAI_MODEL`); domain errors map to proper HTTP codes — 503 (not configured), 401 (invalid key), 429 (rate limit), 402 (quota exhausted), 413 (OCR page cap exceeded)
- Caching is implicit: detail page loads the latest `document_ai_results` row by `created_at DESC`, so the most recent summary wins; users click "Generate Summary" to refresh
- Per-version state isolation (AIWorkspace remounts on version change via `key={latestVersion?.id}`)

### Notifications
- In-app notifications (review assigned, review progress, review overdue, approved, rejected, account approved/rejected, new user registered) shown on dashboard and `/notifications`
- Mark read / unread, mark all read
- **Realtime live updates** via Supabase Realtime — the notification bell receives INSERT/UPDATE events scoped to `user_id` and updates the badge + dropdown without reload. The dashboard wraps a `<DashboardRealtime>` client component that subscribes to `notifications` / `approvals` / `documents` changes for the current user and triggers `router.refresh()` (debounced 400ms) so the metric cards re-render with fresh counts.
- **Email notifications via Brevo** — every in-app notification is mirrored to email. `lib/email.ts` calls Brevo's REST API directly (no SDK) and exposes one sender per notification type: `sendReviewAssignedEmail`, `sendDocumentApprovedEmail`, `sendDocumentRejectedEmail`, `sendReviewProgressEmail`, `sendReviewOverdueEmail`, `sendAccountApprovedEmail`, `sendAccountRejectedEmail`, `sendAdminNewUserEmail`. Each is called (fire-and-forget) immediately after the matching `notifications` insert in `/api/documents/[id]/submit`, `/api/approvals/[approvalId]/decide`, `/api/admin/users/[id]/status`, `/api/auth/register-notify`, and `lib/review-reminders.ts`. Emails are best-effort: a missing `BREVO_API_KEY` / `BREVO_FROM_EMAIL` becomes a `console.warn` (dev) or silent skip (prod), and any HTTP/fetch error is logged but never thrown — the in-app notification row is the source of truth. Recipient addresses are resolved via `auth.admin.getUserById()`. Deep-links use `NEXT_PUBLIC_APP_URL`. Brevo is preferred over Resend because its free tier verifies a single sender email (no domain required) and allows sending to any recipient address.
- **Admin notified of new registrations** — after `supabase.auth.signUp()` resolves, the client fires a fire-and-forget `POST /api/auth/register-notify` with the new user's id. The server-side route validates the profile was created within the last 5 minutes and is `status='pending'` (anti-abuse window), then fans out a `new_user_registered` in-app notification + email to every approved admin so they can review the pending account in `/admin/users`. The Supabase `handle_new_user` trigger that creates the profile row is synchronous with the `auth.users` insert, so by the time the client makes the follow-up call the row already exists.

### Dashboard
- Metric cards (Documents, Pending Reviews, Notifications) — scoped per role; all five backing queries run in parallel via `Promise.all`
- Visual charts (CSS-only, no library): Documents by Status (draft/pending/approved/rejected — `signed` removed), Documents by Month (last 6, fixed-pixel bar heights so a 12-doc bar is exactly 3× a 4-doc bar), Approval/Rejection Ratio
- "My Pending Reviews" list (reviewers/admins) — sorted by deadline with overdue/due-soon color coding
- **Role-aware Quick Action cards**: employees see *New Document* (→ `/documents/new`), *Manage Documents* (→ `/documents`), *Awaiting Review* (→ `/documents?status=pending`, badged with own pending count), and *Needs Revision* (→ `/documents?status=rejected`, shown only when count > 0). Reviewers/admins additionally see *Review Queue*; admins see *Admin Panel*. Status-scoped cards deep-link into the filtered documents list.

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
- Inline PDF viewer + highlights
- AI Workspace (extract / summarize / chat)
- Submit for Review form (owner only, draft only) — multi-select reviewer checkbox list + deadline picker + Windows Hello signing
- **Approval Progress card** (when status = pending) showing round number, X/Y approved, per-reviewer status pills + per-reviewer Overdue pill + round deadline
- Review Actions form (assigned reviewer in current round, pending only) — Sign-and-Approve (Windows Hello) / Reject, shows "X of Y approved" context
- Sign Document Panel with Verify Integrity + View Certificate link (lists every signature with hash-match + crypto-valid badges)
- Approval History grouped by round (current round badged)
- Document Timeline — vertical timeline with colored dots: Created, Uploaded, Submitted (one event per round, lists all reviewers), Approved/Rejected (per reviewer, tagged with round), Signed
- The page runs its 9 independent initial queries in `Promise.all`

## Review SLAs / due dates

- Owner picks a deadline at submission time (preset 1/3/7/14/30 days, default 7) — server stamps `approvals.due_at` on every row in the round.
- Dashboard + `/reviews` queue color-code each pending row: **red** (overdue), **amber** (due within 24h), **teal** (normal). Both pages sort by `due_at` ascending.
- Document detail "Approval Progress" card shows the round deadline + per-reviewer "Overdue" pill.
- **Lazy reminders**: when a reviewer loads `/dashboard` or `/reviews`, `lib/review-reminders.ts` fires for them — for each pending approval where `due_at < now()` AND (`last_reminded_at IS NULL` OR `last_reminded_at < now() - 24h`), a `review_overdue` notification (+ email) is inserted and `last_reminded_at` is bumped. No external cron required.

Schema migration (run once):
```sql
ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS due_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamp with time zone;
CREATE INDEX IF NOT EXISTS approvals_due_at_idx ON approvals (due_at) WHERE status = 'pending';
```

## Multi-reviewer review pipeline

Both submission and decisions are server-routed (analogous to the upload pipeline):

- **Submit for review** — `POST /api/documents/[id]/submit` with `{ reviewerIds: string[], dueInDays, assertion }`. Server validates ownership + draft status + reviewer roles, verifies the owner's WebAuthn assertion against the current file hash, inserts the owner signature row, computes `next_round = max(round_no) + 1`, inserts N approvals rows, sets doc to `pending`, sends one `review_assigned` notification + email per reviewer, audit-logs.
- **Reviewer decision** — `POST /api/approvals/[approvalId]/decide` with `{ status, comment, assertion? }`. Server validates current round + reviewer identity + pending status. When approving, it verifies the reviewer's WebAuthn assertion and inserts the reviewer signature row. Then it computes aggregate doc status:
  - any rejected → doc.status = `rejected` (round locked)
  - all approved → doc.status = `approved` (and `approved_hash` snapshotted)
  - else → doc.status stays `pending`
- Owner gets `document_approved`/`document_rejected` on terminal state, or `review_progress` notifications mid-round.
- All historical rounds are preserved; the detail page filters to `round_no = max(round_no)` for the live progress UI.

Schema migration (run once):
```sql
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS round_no integer NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS approvals_doc_reviewer_round_idx ON approvals (document_id, reviewer_id, round_no);
```

## WebAuthn signing — schema migrations

Run once in the Supabase SQL editor.

```sql
-- Per-user platform-authenticator credential, stored on the profile.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS webauthn_credential_id text,
  ADD COLUMN IF NOT EXISTS webauthn_public_key   text,
  ADD COLUMN IF NOT EXISTS webauthn_counter      integer,
  ADD COLUMN IF NOT EXISTS webauthn_device_type  text,
  ADD COLUMN IF NOT EXISTS webauthn_transports   jsonb,
  ADD COLUMN IF NOT EXISTS webauthn_aaguid       text,
  ADD COLUMN IF NOT EXISTS webauthn_registered_at timestamp with time zone;

-- Cryptographic-signature columns on document_signatures (added on top of the
-- original hash-only design). signature_role distinguishes owner vs reviewer.
ALTER TABLE document_signatures
  ADD COLUMN IF NOT EXISTS signature_bytes    text,
  ADD COLUMN IF NOT EXISTS client_data_json   text,
  ADD COLUMN IF NOT EXISTS authenticator_data text,
  ADD COLUMN IF NOT EXISTS credential_id      text,
  ADD COLUMN IF NOT EXISTS algorithm          text,
  ADD COLUMN IF NOT EXISTS signature_role     text,
  ADD COLUMN IF NOT EXISTS round_no           integer;

-- Approved-state fingerprint + cached per-version file hash.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS approved_hash text;
ALTER TABLE document_versions
  ADD COLUMN IF NOT EXISTS content_hash text;
```

Relevant env vars (see "Important environment"): `NEXT_PUBLIC_RP_ID`, `NEXT_PUBLIC_APP_URL` scope the relying-party id and expected origin.

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

## AI rate limiting (per-user)

The three AI routes (`ai-summary`, `ai-chat`, `extract-text`) call OpenAI, which the project pays for. To stop a runaway client loop or an abusive user from burning the OpenAI budget, each user is capped at a fixed number of AI calls per time window. **Default: 20 calls per 10 minutes per user**, shared across all three routes (the cost we care about is total OpenAI calls per person, not per endpoint). Overridable via `AI_RATE_LIMIT_MAX` and `AI_RATE_LIMIT_WINDOW_SECONDS` env vars.

- **Why Postgres, not in-memory**: the app runs on stateless serverless functions (Vercel). A module-scope counter resets on every cold start and isn't shared across concurrent instances, so it wouldn't actually limit anything. A shared, durable Postgres counter does — and the rows are auditable.
- **Atomic check-and-increment**: `increment_ai_usage()` is a `SECURITY DEFINER` function that increments the current window's counter and reports allow/remaining in a single statement, so two concurrent requests can't both read "4" and both decide they're under the limit.
- **Strategy**: fixed-window counter (one row per `(user_id, window_start)`). Trade-off: allows a burst across the window boundary (up to ~2× the limit at the seam). A sliding-window log would be more precise but needs per-request rows + cleanup; fixed-window is the standard pragmatic choice. Documented as a future refinement.
- **Fails open**: if the limiter's own DB call errors, the request is logged and allowed. A limiter outage must never take down the core AI feature.
- **Client contract**: enforced in `lib/rate-limit.ts` (`enforceAiRateLimit`) right after the auth guard in each route. On exceed, returns **429** with a `Retry-After` header and a human message ("…try again in about N minutes"). This reuses the 429 status already used for OpenAI's upstream rate limit, but with a distinct message so the two cases are distinguishable.

The `ai_rate_limits` table has **RLS enabled with no policies** — only the service-role client and the `SECURITY DEFINER` function may touch it, so users can't read or forge their own counters (same isolation pattern as other privileged writes).

Schema migration (run once in Supabase SQL editor — full SQL in `migrations/2026-06-15-ai-rate-limit.sql`):
```sql
CREATE TABLE IF NOT EXISTS ai_rate_limits (
  user_id      uuid        NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, window_start)
);
ALTER TABLE ai_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION increment_ai_usage(
  p_user_id uuid, p_limit integer, p_window_seconds integer
)
RETURNS TABLE (allowed boolean, remaining integer, reset_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count        integer;
BEGIN
  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );
  INSERT INTO ai_rate_limits (user_id, window_start, count)
  VALUES (p_user_id, v_window_start, 1)
  ON CONFLICT (user_id, window_start)
  DO UPDATE SET count = ai_rate_limits.count + 1
  RETURNING count INTO v_count;
  allowed   := v_count <= p_limit;
  remaining := greatest(p_limit - v_count, 0);
  reset_at  := v_window_start + make_interval(secs => p_window_seconds);
  RETURN NEXT;
END;
$$;
```

## Realtime live updates

Supabase Realtime broadcasts row-level INSERT / UPDATE / DELETE events over websockets, gated by the same RLS policies that govern SELECT. Two client components subscribe:

- **`components/NotificationBell.tsx`** — after the initial fetch, opens a channel `notifications:${user.id}` with two `postgres_changes` listeners (INSERT and UPDATE) filtered server-side by `user_id=eq.${user.id}`. On INSERT it prepends to the items array (dedup-guarded, capped at `RECENT_LIMIT`). On UPDATE it patches `is_read` in place. Optimistic mark-read writes still happen first; the realtime echo is a no-op.
- **`components/DashboardRealtime.tsx`** — mounted at the top of `/dashboard`, returns `null`. Opens a channel `dashboard:${user.id}` with three listeners: `notifications` (filtered to the user), `approvals` (filtered to `reviewer_id`), and `documents` (filtered to `owner_id` for non-admins, unfiltered for admins). On any event it calls `router.refresh()` with a 400ms debounce so the server component re-fetches all metric cards + charts + the "My Pending Reviews" list. Channel is removed on unmount.

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

## History — how signing reached the current design

The signature system went through three iterations driven by supervisor feedback:

1. **Hash-only** (original report design): SHA-256 of the approved file stored in `document_signatures.signature_hash`. Provides integrity but no proof of *who* signed (non-repudiation).
2. **In-browser ECDSA P-256 keypair**: private key in IndexedDB. Added non-repudiation but was "account-based, not person-based" — anyone with the browser session could sign. Discarded.
3. **WebAuthn / Windows Hello (current)**: TPM-backed keypair, fresh biometric/PIN required at every signature, multi-party (owner at submission + each reviewer at approval).

The hash-only columns are retained for backward compatibility — old rows with only `signature_hash` render as "Legacy hash-only" on the certificate.

## Known gaps / limitations

- **No PDF-embedded signatures** (PAdES / PKCS#7). Signatures live in `document_signatures` only; the original file bytes are never modified. Deliberate — adds no cryptographic value for this use case and keeps the original document intact.
- **`authenticatorAttachment: 'platform'`** means a device without a configured platform authenticator (e.g. a Linux desktop with no Windows Hello equivalent) cannot sign. Handled gracefully: `SigningKeySetup` detects this and shows setup instructions instead of crashing. A phone/QR fallback is a one-line change but trades device-binding strength.
- OCR is capped at 10 pages per document; longer scanned PDFs return a 413 error and need to be split first.
- Email from a free Gmail sender lands in Spam until the recipient marks it not-spam once.
- No automated end-to-end test suite (Playwright is identified as future work).
- The `'signed'` value remains in the `documents.status` column's allowed set even though the workflow no longer uses it (deprecated leftover); it has been removed from the dashboard charts.

## Recommended next moves (graduation impact)

- **PDF-embedded signatures (PAdES)** — the natural next step now that WebAuthn signing is done; would let the signed PDF be verifiable in standard readers.
- Playwright E2E tests; demo video; README screenshots + deployed URL.

## Important environment

- `.env.local` must have: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`
- WebAuthn relying-party config: `NEXT_PUBLIC_RP_ID` (the deployed hostname, e.g. `ai-doc-review.vercel.app`; falls back to `VERCEL_URL`'s host, then `localhost`) and `NEXT_PUBLIC_APP_URL` (the full origin used as the expected WebAuthn origin and email deep-link base; defaults to `http://localhost:3000` / `:3001`). These must be set correctly in production or signing ceremonies will be rejected by the browser.
- Email (optional but recommended): `BREVO_API_KEY`, `BREVO_FROM_EMAIL` (must be a verified sender in the Brevo dashboard), `BREVO_FROM_NAME` (defaults to "AI Document Review"). Without these the app still works and sends are skipped with a dev warning.
- Optional: `OPENAI_OCR_MODEL` overrides the model used by the OCR fallback path; defaults to whatever `OPENAI_MODEL` is. If your chat model doesn't support PDF file inputs, set this to a vision-capable model.
- Vercel needs the same env vars on Production (and Preview if used)
- `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` must NOT be `NEXT_PUBLIC_*` — keep them server-only
- Vercel functions are pinned to the Singapore region (`sin1`) to reduce latency to a Singapore-region Supabase project

## Where to look for what

- DB schema / RLS / sample data: `SUPABASE_CONTEXT.md`
- Auth helpers: `lib/supabase/auth.ts`
- Service-role client: `lib/supabase/admin.ts`
- WebAuthn config / verify / client / authenticator-data / aaguid: `lib/webauthn/*`
- File-hash caching: `lib/document-hash.ts`
- OpenAI wrapper: `lib/openai.ts`
- Email senders: `lib/email.ts`
- Overdue reminders: `lib/review-reminders.ts`
- Workflow rules: `CLAUDE.md`
- Next.js 16 caveats: `AGENTS.md`
