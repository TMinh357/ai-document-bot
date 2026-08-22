# Defense Preparation — AI-Assisted Document Approval System

> Comprehensive reference for the graduation defense. Read by section. Internalize the reasoning, not the wording.

---

## 0. How to use this document

- **Don't memorize verbatim.** Internalize the *why* behind each answer. If asked the same thing differently, you can re-derive.
- **One section per study session.** This is too much for one sitting. Section 8 (Signing) is the most important — read it twice.
- **Lead with the root cause.** Every answer below starts with the rationale. That's the defense style your supervisors expect.
- **If you don't know — say so honestly, then propose how you'd find out.** Bluffing loses more points than not knowing.
- **Rehearse the demo (Section 2) at least 3 times** before defense day. Time yourself.

---

## 1. Project elevator pitches

### Use this framing first

The safest framing for the second defense is:

> "This is an AI-assisted internal document approval system for university departments and research groups that still review academic PDFs through email, chat, or shared folders. A student or researcher uploads a proposal or report, assigned supervisors and department reviewers approve or reject it through multi-round workflows, and an AI assistant summarizes the document and answers grounded questions about its content. The system also records WebAuthn signatures tied to the file hash, so the department can later verify both who approved the document and whether the approved file was changed."

The key is to avoid presenting the project as a generic enterprise SaaS. Present it as a focused academic workflow tool for departments and research groups that need more accountability than email or Google Drive, but less complexity than a full enterprise document-management or legal e-signature platform.

### Target users and practical value

Use this section when the panel asks "Who would actually use this?" or "Why is this practical?"

- **Primary setting:** university departments and research groups that review academic PDF documents internally.
- **Submitters:** students or researchers who prepare research proposals, internship reports, thesis-related documents, or academic progress reports.
- **Supervisors:** lecturers or research supervisors who review document content, leave comments, and approve or reject revisions.
- **Department reviewers:** academic committee members or department-level reviewers who perform a final quality, completeness, or compliance check.
- **Administrators:** department secretaries, IT staff, or system owners who approve accounts, manage roles, and inspect audit logs.

Practical scenario:

> "For example, a student submits a research proposal as a PDF. The supervisor reviews the objectives, methodology, expected results, and missing points, uses the AI assistant to obtain a quick summary and risk notes, and leaves passage-level comments. If revision is needed, the student uploads a new version and resubmits. When the supervisor and department reviewer both approve, each approval is signed, and the system preserves the version history, review history, signatures, audit log, and a certificate that can detect later tampering."

Why this is more practical than email or Google Drive:

Google Drive and email are useful for storage and communication, but they do not model the approval process. They do not enforce that all assigned reviewers approve, do not keep structured rounds after resubmission, do not require reviewer comments on rejection, do not produce an audit trail tied to roles, and do not verify whether the final PDF was changed after approval.

Why this is not just a commercial e-signature clone:

Commercial e-signature systems focus on legally recognized signing and document routing. This project has a different scope: a low-overhead academic prototype for internal proposal and report review, where the value is the combination of workflow tracking, AI reading support, role-based access control, and integrity verification. It does not claim to replace PAdES/PKCS#7 legal signatures; PDF-embedded legal signatures are documented as future work.

One-sentence practical value:

> "The practical value is not just storing a PDF; it is turning an informal academic review process into a traceable workflow where people know who is responsible, which version was reviewed, what feedback was given, and whether the approved file later changed."

### 30-second version (for the opening question)

> "This is an AI-assisted internal document approval system for university departments and research groups. Students or researchers upload academic PDFs such as research proposals and internship reports; supervisors and department reviewers approve or reject them in multi-round workflows; and an integrated AI assistant summarizes documents and answers questions about their content. Every approved document carries multi-party WebAuthn signature evidence tied to the file hash, so the department can verify both approval responsibility and file integrity. The whole stack is Next.js 16, Supabase with Row-Level Security, deployed on Vercel."

### 2-minute version (when asked "tell us about your project")

> "Traditional document review in organizations relies on email, paper signatures, and ad-hoc tracking. There's no single place to see who approved what, no integrity guarantee that a signed document hasn't been altered, and no automated help for reading long PDFs.
>
> My project integrates three normally-separate concerns into one application: an academic approval workflow with Submitter, Reviewer, and Administrator roles; an AI assistant for summarization, key-point extraction, and grounded Q&A on uploaded PDFs; and a digital signing system built on WebAuthn / FIDO2 platform credentials.
>
> The signing model is multi-party: the Submitter signs at submission, each reviewer signs at approval, and a Verify Integrity button later checks both that the file has not been altered and that the signatures were cryptographically produced by the registered users.
>
> Security is layered: page-level role checks, database Row-Level Security policies, and service-role-only writes. Even if a malicious client bypasses the UI, the database refuses to return rows they shouldn't see.
>
> The stack is Next.js 16 with the App Router, React 19, Tailwind v4, Supabase for Postgres + auth + storage, OpenAI for AI, Brevo for email, and Vercel for hosting."

### 5-minute version (when asked to walk through the system)

Use the demo script in Section 2.

---

## 2. Demo script (step by step — rehearse this)

**Time budget: 5–7 minutes. Practice with a timer.**

### Setup before the defense

- Browser session A: signed in as **admin** (your admin account)
- Browser session B: signed in as **Submitter** (implementation role: `employee`)
- Browser session C: signed in as **reviewer** (different account)
- All three windows visible
- Pre-prepared 5-page PDF on desktop ready to upload, preferably a realistic academic document such as `Research Proposal.pdf`, `Internship Report Approval.pdf`, or `Academic Progress Report.pdf`
- Tab to your deployed Vercel URL or `npm run dev` localhost
- Backup video recording in case live demo breaks

### The demo flow

1. **(15 sec) Show the dashboard as admin** — point at the metric cards, audit log preview, user list. *"This is the admin view. Three metric cards, real-time updates via Supabase Realtime."*
2. **(30 sec) Register a new user in session D (incognito).** It lands as pending. *"New accounts are gated by admin approval. Notice the admin dashboard updated in real time via the websocket — no reload."*
3. **(20 sec) Admin approves the new user.** Email is sent via Brevo. *"Approval triggers an email through Brevo and an in-app notification. The user can now sign in."*
4. **(30 sec) As submitter, create a document and upload the PDF.** *"In this scenario, a university department is reviewing a student research proposal. The client does a pre-flight size + MIME check. The file goes to a staging path. Then the server downloads only the first few bytes via an HTTP Range request, validates the PDF magic bytes, and only then moves the file to its final path. Notice the database row is inserted by the service-role client, never by the browser."*
5. **(45 sec) Generate AI summary.** Show summary + key points + risk notes. *"This is gpt-5.4-mini with a JSON-schema-constrained structured output. We extract text with pdf-parse first, and fall back to multimodal OCR via the OpenAI Files API if the text layer is empty. Caching is implicit — the latest result for the document is loaded automatically."*
6. **(45 sec) Submit for review.** Pick the reviewer, deadline 3 days. Windows Hello prompt appears. **Press your fingerprint or PIN.** *"The Submitter produces a WebAuthn assertion here over the current PDF hash. The server verifies it using SimpleWebAuthn before any state transition. If I cancel the authenticator prompt, nothing is written to the database."*
7. **(30 sec) Switch to reviewer.** The bell badge incremented in real time. Open the document. Show the inline PDF viewer, drag-select a passage, add a highlight comment. *"Passage-level highlights stored as page-relative percentage rectangles, so they survive zoom and resize."*
8. **(30 sec) Approve.** Windows Hello prompts again. **Press it.** *"Each reviewer signature is captured at the moment of approval. Document is now Approved — terminal state. Owner gets an email + in-app notification, again via Brevo and Realtime."*
9. **(60 sec — the centerpiece) The tamper demo.** Switch to Supabase Storage console, replace the file with a different binary. Back to the document page, click Verify Integrity. *"Both signatures now show **Hash Mismatch** — the file content was modified — but **WebAuthn-ES256 Valid** — the signatures themselves are cryptographically authentic. This is exactly the case from Figure 5.2 panel (c) in the report. The system detects post-approval tampering without false-flagging either signer."*
10. **(30 sec) Show the certificate page** — summary first, then AAGUID, user-verification flag, credential scope, and sign counter in technical details. *"The certificate starts with practical questions: whether the file changed, who signed, and whether the workflow is complete. The raw WebAuthn evidence is still available, but it is not presented as a legal certificate."*
11. **(15 sec) Wrap.** *"That's the full lifecycle: create, submit-with-signing, review-with-signing, approve, verify, detect tampering."*

### If the demo breaks

- **Have the backup video ready** (record once, play in case live fails). 3 minutes max.
- **Don't panic.** Say: *"The live environment is having a connectivity issue; here's the recorded walkthrough I prepared in case of network problems."* The panel respects preparation.

---

## 3. Stack justifications

The panel may ask "why did you choose X?" for any technology. Each answer below leads with the *trade-off* you considered.

### Q: Why Next.js 16 (App Router) instead of Express + React or a simpler stack?

The App Router pushes data fetching to **server components**, which means most database queries and auth checks happen on the server before any HTML is sent. This is more secure (no API keys leak to the browser) and faster (less JavaScript shipped). Express + React would have required me to build all the auth-cookie handling and SSR plumbing by hand. Next.js gives me a TypeScript-native, Vercel-integrated framework where the same file can render a page and expose an API route.

**If pushed**: I considered SvelteKit (less mature ecosystem), Remix (less Vercel integration), and pure React + Vite (would need separate backend). Next.js 16 + Vercel is the tightest path from code to deployed app for a single developer.

### Q: Why Supabase instead of building your own backend?

Three reasons. **First**, Supabase gives me managed PostgreSQL with first-class Row-Level Security support — this is essential for the layered security architecture, and building RLS into a custom backend would take weeks. **Second**, the auth service issues JWTs that the database understands natively, so I get cookie-based session authentication without writing it. **Third**, the storage service uses the same identity primitives, so file-level permissions and database-level permissions speak the same language. A custom backend would require integrating three separate systems.

**If pushed**: I considered Firebase (NoSQL doesn't fit relational data, no RLS), AWS Amplify (lock-in, complex), and self-hosted Postgres + custom auth (too much to build alone). Supabase is the Postgres-friendly equivalent of Firebase with proper RLS.

### Q: Why TypeScript strict mode?

Strict mode catches null/undefined bugs at compile time rather than runtime. For a system where one missing null check could expose someone else's documents, this is worth the upfront cost. Every public function and data shape is explicitly typed.

### Q: Why pdf-parse instead of pdfjs-dist directly or pdf-lib?

pdf-parse is a thin wrapper around pdfjs-dist optimized for **server-side text extraction**. pdfjs-dist directly would require me to handle the worker bundle on the server (it expects a browser). pdf-lib is for *creating and modifying* PDFs, not extracting text. pdf-parse gives me the text content of all pages as a single string, which is what the AI pipeline needs.

### Q: Why OpenAI instead of an open-weights model like Llama 3?

Three factors. **First**, OpenAI's structured outputs feature — JSON-schema-constrained responses — is critical for the summary endpoint. Self-hosted models can be coaxed into JSON with prompt engineering but it's brittle. **Second**, gpt-5.4-mini delivers acceptable summary quality at a fraction-of-a-cent per call, whereas a self-hosted model in the 30B+ parameter range to match that quality would require GPU infrastructure outside this project's budget. **Third**, the multimodal OCR fallback uses the same provider — one API for both paths.

**If pushed (data sovereignty)**: I acknowledged this in §1.4 and §7.4 of the report. The model identifier is environment-variable-driven, so a deployment with stricter requirements can substitute a self-hosted model without code changes. Listed as future work in §8.2.2.

### Q: Why Brevo for email instead of Resend or SendGrid?

Brevo's free tier allows verifying a single sender email address without owning a domain. Resend and SendGrid require domain verification, which would have required me to buy a domain. For a graduation project on a student budget, Brevo's free tier (300 emails/day) is sufficient. The trade-off is that emails from a free Gmail address hit the Spam folder on first delivery — I documented this as a limitation in §7.4 and added domain authentication to future work in §8.2.4.

### Q: Why Tailwind v4 instead of a component library like MUI or Chakra?

Tailwind utility classes plus a small custom design system (page-shell, section-card, metric-card, status-pill, button-primary/secondary) keeps the bundle small and gives me complete control over visual consistency. MUI or Chakra would have shipped ~100KB of components I don't use. For an app with a focused, custom UI, Tailwind is leaner.

### Q: Why Vercel?

Zero-config deployment from GitHub, automatic HTTPS, edge network for static assets, and first-class Next.js integration. The free tier covers the prototype scale. The alternative would be Docker + a VPS, which requires manual SSL, build pipeline, and process management.

---

## 4. Architecture questions

### Q: Why a three-tier architecture (browser / Next.js server / Supabase)?

Separation of concerns. The browser handles presentation, the Next.js server enforces business logic and security, and Supabase is the trust boundary for data persistence. Each layer can be replaced independently — for example, the browser layer could become a mobile app without changing the server, or the server could be replaced with a different Node framework without touching Supabase. The report covers this in §4.4.1 and Figure 4.4.

### Q: Why two database clients (anon-key and service-role)?

This is the most important architectural decision. The **anon-key client** respects Row-Level Security — when used inside a server component, the database automatically filters results based on the authenticated user. I use it for all read queries. The **service-role client** bypasses RLS and is used only inside dedicated API routes for privileged writes (inserting documents, updating approvals, posting notifications). These routes explicitly verify the caller's identity and role before performing any write. The combination means: reads are governed declaratively by the database; writes are governed imperatively by code that runs only on the server. The browser cannot bypass either.

### Q: How do you handle authentication?

Supabase Auth handles registration, password hashing (with salt), and JWT issuance. The JWT is stored as an HTTP-only cookie, which makes it inaccessible to client-side JavaScript and therefore robust against XSS-based session theft. A small helper module — `lib/supabase/auth.ts` — exposes `requireUser` and `requireRole` functions that are called at the top of every protected server component and API route. These either return the verified profile or redirect.

### Q: Why server components instead of client components everywhere?

Server components run on the server only — they never ship JavaScript to the browser. This means data fetching, authentication checks, and rendering all happen server-side, where sensitive logic is safe. Client components are only used where they're needed: interactive forms, the PDF viewer, the AI workspace, the notification bell. This minimizes the JavaScript bundle and the attack surface.

### Q: What's in the `lib/` folder?

Cross-cutting concerns. `lib/openai.ts` wraps the OpenAI client with structured-output handling and error mapping. `lib/pdf-validation.ts` does the magic-byte and size validation via HTTP Range requests. `lib/review-reminders.ts` implements the lazy reminder fan-out. `lib/email.ts` is the Brevo integration with one sender function per notification type. `lib/supabase/` has the two clients and the auth helpers.

### Q: How does the realtime update flow work?

Supabase Realtime broadcasts row-level INSERT/UPDATE/DELETE events over websockets. Two client components subscribe: `NotificationBell` (filters by user_id) and `DashboardRealtime` (subscribes to notifications, approvals, and documents). The websocket layer respects RLS — it only delivers rows the user could SELECT — so the filters are an optimization, not a security control. Events trigger a 400ms-debounced `router.refresh()` which re-renders the server components with fresh data. Covered in §5.9.

---

## 5. Database & RLS questions

### Q: How many tables, and why?

Ten tables. Nine model the core domain concepts: `profiles` (users + signing credentials), `documents`, `document_versions`, `approvals`, `document_highlights`, `document_signatures`, `document_ai_results`, `notifications`, `audit_logs`. The tenth, `document_ai_messages`, is an auxiliary log that stores each AI question and the model's answer (one row per question). The schema is in third normal form — foreign keys express relationships, no data is duplicated. Documented in §3.2 and Table 3.1.

*(If asked "why is Q&A in its own table and not in document_ai_results?" — `document_ai_results` caches the structured summary/key-points/risk-notes; `document_ai_messages` is a chronological question/answer history. Different shapes, different lifecycles.)*

### Q: Why is the signing data on the profiles table instead of a separate credentials table?

Currently each user has at most one WebAuthn credential, so a 1:1 relationship can live as columns on `profiles`. If I extend to multi-device credentials (already listed as future work in §8.2.2), I'd split this into a separate `webauthn_credentials` table with a foreign key to `profiles`. Designing for the simple case first is appropriate scope discipline.

### Q: What exactly do RLS policies do?

PostgreSQL Row-Level Security policies are SQL predicates that the database engine implicitly adds to every query's WHERE clause. For example, the `documents` SELECT policy says: *"a row is visible only if `owner_id = auth.uid()`, or there's an `approvals` row with `reviewer_id = auth.uid()` for that document, or the calling user's role is `admin`."* When the application runs `SELECT * FROM documents`, the database transparently augments it so only authorized rows are returned. This is enforced at the engine level — the application cannot bypass it.

### Q: Why have RLS *and* application-level role checks? Isn't one enough?

Defense in depth. Application-level checks fail silently if a developer forgets to add `requireRole('admin')` to a new API route. RLS is unconditional — it applies to every query through the anon-key client regardless of which route runs. If an attacker bypasses the UI by crafting direct HTTP requests, the application checks catch them at the route level; if a bug bypasses the application check, RLS catches them at the database level. Two layers is the cost of one extra SQL policy per table, and the safety gain is large.

### Q: How did you test the RLS policies?

Two ways. **First**, the application-level test: I signed in as employee, reviewer, and admin in three different browser sessions, and confirmed each user only saw the documents and approvals they were entitled to see. **Second**, the policy-level test: I used the Supabase SQL editor with role impersonation, wrapping each test in `BEGIN; SET LOCAL "request.jwt.claims" TO '{"sub":"<uuid>"}'; SELECT ...; ROLLBACK;`. This exercises the policies directly without any application code. Both confirmed the access matrix in §3.4.

### Q: What's the access matrix for SELECT on documents?

- **Owner**: `owner_id = auth.uid()` — always.
- **Assigned reviewer (any round)**: at least one approvals row with `reviewer_id = auth.uid()`.
- **Admin**: `profiles.role = 'admin'`.
- **Everyone else**: cannot see the row.

Document_versions inherits this via an EXISTS subquery.

### Q: How is approved_hash different from the file hash used in WebAuthn signing?

`approved_hash` is computed by the server at the moment all reviewers approve. It's a backup integrity snapshot stored on the documents row. The WebAuthn signature hash, by contrast, is computed by the *client* at the moment of signing and embedded inside the WebAuthn challenge. They should match for an untampered file. If they differ, something happened between approval and signing. The redundancy is intentional — two independent integrity records make tampering harder to hide.

### Q: Why is `audit_logs.target_id` a generic UUID instead of a fixed foreign key?

The audit log records actions across many entity types (documents, profiles, approvals, signatures). Having one nullable `target_id` + `target_table` pair instead of one FK column per entity keeps the schema simple. The trade-off is that referential integrity isn't enforced at the database level, but audit logs are append-only and infrequently joined, so that's acceptable.

---

## 6. Workflow & state machine questions

### Q: Why a state machine instead of just status flags?

A state machine makes the lifecycle explicit. The status column has a CHECK constraint that restricts it to `'draft' | 'pending' | 'approved' | 'rejected'`, and the API routes verify the current state before allowing a transition. This means invalid states are unrepresentable and the workflow rules are enforced centrally. With ad-hoc flags, every transition would need scattered conditional logic. Figure 4.1 visualizes the machine; Table 5.1 documents each transition.

### Q: Why four states and not five?

Earlier in development I had a fifth state, `signed`, that was a terminal state after `approved`. After a supervisor conversation I removed it — signing is now embedded in the workflow itself (owner signs at submission, reviewers sign at approval) rather than being a separate post-approval step. So `approved` is the natural terminal state once all signatures are recorded. This is one of the iterations the signing architecture went through.

### Q: Why unanimous approval (all reviewers must approve) instead of majority?

Unanimous is the strongest and simplest rule. It matches how organizational approvals usually work in practice — if a department head and a technical lead are both assigned to review, the document should not be approved unless both agree. Majority approval would require additional UI to express the rule (how many must approve? does the owner choose?), and would weaken the guarantee. I noted in §8.2.3 that generalizing this to per-document-type rules is future work.

### Q: Why does any single rejection terminate the round immediately?

Early termination is more efficient — there's no point asking remaining reviewers to read a document one reviewer has already rejected, since the document is going back to the owner anyway. The rejecting reviewer's comment is required (FR6), so the owner gets actionable feedback immediately. The round is locked, so a reviewer who hadn't decided yet can't accidentally approve a doomed document.

### Q: What's a "round"? Why preserve history?

A round is one submission cycle: the owner submits with a set of reviewers, the reviewers decide, the round terminates in approval or rejection. If rejected, the owner can upload a new version and resubmit — that's a new round, with `round_no` incremented. Old rounds are preserved as history, so the document detail page shows the full trail of "round 1: rejected by Reviewer X; round 2: approved by both." This is important for accountability and audit.

### Q: Why is the owner required to sign at submission?

To attest that the file being submitted is the version they intended. Without an owner signature, a malicious actor with database access could modify the file between upload and reviewer approval, and the reviewer would have no way to know whether the document they're reading is the document the owner sent. The owner signature creates a cryptographic baseline that reviewers can verify against.

### Q: Why don't reviewers sign on rejection?

Rejection terminates the round; there's nothing to commit. The reviewer's identity and comment are stored in the approvals row, and that's enough audit trail. Requiring a WebAuthn prompt on rejection would add friction without adding security — there's no "document state" being signed because no state transition produces a final artifact.

---

## 7. AI integration questions

### Q: Why structured outputs (JSON schema)?

LLM responses are non-deterministic and may not match the format the application expects. Without structured outputs, I'd have to write fragile regex or string-matching to extract the summary, key points, and risk notes from free-form text. JSON-schema-constrained mode forces the model to return exactly `{summary, key_points[], risk_notes[]}` — the application parses it as JSON and renders it directly. This is the single most valuable technique I used for AI reliability, and I called it out as RQ2's main finding.

### Q: Why gpt-5.4-mini specifically?

Cost and latency. For document summarization in the 10–20 page range, the full flagship model is unnecessary — gpt-5.4-mini produces structurally correct summaries at a fraction of the price and roughly half the latency. The model identifier is environment-variable-driven, so swapping to a larger or smaller model is a one-config change.

### Q: How do you control cost?

Three mechanisms. **Input truncation**: document text is capped at 12,000 characters before being sent. **Question truncation**: user questions are capped at 1,000 characters. **OCR page cap**: the multimodal OCR fallback refuses PDFs longer than 10 pages with HTTP 413. All token usage is logged into `audit_logs.metadata` per call, so administrators can monitor cost. Per-call cost is in the fraction-of-a-cent range, as documented in §1.4.

### Q: What data leaves the system to OpenAI?

Only document text — and only when the user explicitly clicks Generate Summary or asks a question. The OCR fallback path uploads the PDF file itself via the OpenAI Files API. **No** user identities, authentication tokens, approval decisions, signatures, public keys, or comments are ever transmitted. The signing layer never touches OpenAI. Covered in §1.4 and §7.4.

### Q: What if OpenAI is down or rate-limited?

Errors from OpenAI are mapped to specific HTTP status codes: 503 if the API key isn't configured, 429 if OpenAI itself rate-limits us, 402 if quota is exhausted, 413 if the OCR page cap is exceeded. The user gets a friendly message and can retry. The rest of the application — workflow, signing, approvals — is fully functional without AI. The AI is augmentation, not core.

### Q: How do you stop a user from abusing the AI feature and running up your OpenAI bill?

There's a per-user rate limit on all three AI routes (summary, Q&A, text extraction): by default **20 calls per 10 minutes per user**, shared across the routes, configurable via env vars. When exceeded, the route returns 429 with a `Retry-After` header and a message telling the user how long to wait.

The non-obvious part is *where* the counter lives. The app runs on Vercel's stateless serverless functions, so an in-memory counter would reset on every cold start and wouldn't be shared between concurrent function instances — it wouldn't actually limit anything. So the counter is in Postgres: a small `ai_rate_limits` table plus a `SECURITY DEFINER` function that does an atomic check-and-increment in one statement, which also closes the race where two concurrent requests both read the same count and both think they're under the limit. The table has RLS enabled with no policies, so only the server (service-role) can touch it — a user can't read or forge their own counter.

I made two deliberate trade-offs. It uses a fixed window, which allows a short burst across a window boundary (up to ~2× the limit at the seam); a sliding-window log would be more precise but needs per-request rows and cleanup, which is overkill here — I'd add it for production. And it fails open: if the limiter's own database call fails, the request is allowed rather than blocked, because a limiter outage should never take down the core AI feature.

### Q: What about hallucinations in the AI summary?

The Q&A endpoint prompt explicitly instructs the model to ground answers in the provided document text only. The summary endpoint is constrained by JSON schema, so it can't drift structurally. But yes — like any LLM, gpt-5.4-mini can still produce factually incorrect summaries occasionally. This is why the system is described as "AI-assisted," not "AI-decided." Reviewers make the final approval decision; the AI helps them read faster.

### Q: How does the OCR fallback work?

If pdf-parse returns fewer than 100 characters (likely a scanned image PDF), the original PDF buffer is uploaded to OpenAI's Files API, and the multimodal model is asked to return the text content. This is server-side, the user doesn't choose it. The 10-page cap prevents accidentally expensive calls on large scanned documents. Each call records which path was used in `audit_logs.metadata` as either `text_layer` or `ocr_vision`, useful for cost analysis.

### Q: Why cap OCR at 10 pages? Doesn't that mean longer documents can't use the AI?

First, the scope of the cap is narrower than it sounds. It applies **only to the OCR fallback path**, which only runs for scanned image PDFs (text layer under 100 characters). A **text-based PDF of any length** extracts through the free local `pdf-parse` path with no page limit — so the cap never affects born-digital documents, which are the common case. The only thing it blocks is a *scanned* PDF longer than 10 pages, which returns HTTP 413.

Second, having a limit is completely normal — every OCR service imposes page or size limits for cost and latency. Google Cloud Vision caps async PDF OCR at 2,000 pages (and sync requests far lower); AWS Textract's synchronous API handles only 1 page (multi-page requires the async job API); Azure Document Intelligence's free tier processes only the first 2 pages. The question is only where you set the threshold.

I set it conservatively at 10 because my OCR runs through a **general-purpose multimodal model**, not a dedicated OCR engine — it's pricier per page (~1.41 US cent per extraction, rising with page count) and has no batch mode, so an uncapped scanned document is an unbounded cost. The correct production fix isn't to remove the cap but to swap in a dedicated OCR service (Tesseract or a cloud OCR API), which I list in §8.2.2 future work. For a text-layer document, even a very long one, the summary input is bounded instead by the 12,000-character truncation, not by pages.

### Q: What about PDFs with text layers that are structurally broken — like slide decks or LaTeX Beamer?

This is a known limitation. pdf-parse extracts text by reading positioned glyphs in document order; for slide decks where each text fragment is individually positioned with no whitespace metadata, the result can be garbled (word boundaries lost, subscripts split across lines). The pipeline currently doesn't detect this — it sees "plenty of text" and skips OCR. A future improvement would be an extraction-quality heuristic that routes structurally-broken extractions through the vision OCR even when text length > 100 chars.

### Q: Why store AI results in document_ai_results?

Caching. Calling the OpenAI API on every document detail page load would be wasteful and expensive. The most recent result for each document is loaded by default; users click "Generate Summary" to refresh. Subsequent reviewers see the cached output instantly.

---

## 8. Digital signing questions (most important section — read twice)

### Q: Walk us through how a signature is produced.

The first time a user signs anything, the application opens a Windows Hello or platform-equivalent WebAuthn prompt and registers a platform credential. The server stores the user's COSE-encoded public key, AAGUID, sign counter, credential scope indicator, and registration timestamp in the profiles table. The private key is controlled by the authenticator and is never stored by the application server.

For each subsequent signing event:
1. Client requests the SHA-256 hash of the latest file version from a dedicated endpoint that reads the cached `content_hash`.
2. Client calls `navigator.credentials.get()` with the file hash as the WebAuthn challenge, the user's registered credential ID in `allowCredentials`, and `userVerification: "required"`.
3. The browser triggers the platform authenticator; user authenticates with PIN, fingerprint, or face when available.
4. The authenticator signs `authenticatorData || SHA-256(clientDataJSON)` with the credential private key and returns the raw signature bytes, authenticatorData binary blob, and clientDataJSON string.
5. Client posts all three to the server route (`/api/documents/[id]/submit` for Submitter, `/api/approvals/[id]/decide` for reviewer).
6. Server route imports the signer's public key from profiles and calls `verifyAuthenticationResponse` from @simplewebauthn/server, which checks: challenge matches the file hash, origin/RP-ID match the deployment, user-verification flag is set, signature is mathematically valid under the public key.
7. Server updates the sign counter (replay protection) and inserts the signature row.
8. Only on positive verification does any state transition occur.

### Q: Why WebAuthn instead of Web Crypto API with browser-held keys?

This is the key architectural decision. With Web Crypto API, the private key would live in browser IndexedDB — any code with browser access (a malicious extension, XSS, a stolen device) could potentially access and use the key. With WebAuthn / FIDO2:

1. **The private key is controlled by the platform authenticator.** The application server never receives or stores it.
2. **Every signing event requests user verification.** The route requires the WebAuthn user-verification flag, so a session cookie alone is not enough.
3. **Credential binding.** The signature proves that the registered credential produced the assertion for the exact file hash.
4. **Sign counter supports replay/cloning checks.** When reported by the authenticator, counter movement gives another signal for suspicious credential behavior.

Three technical security properties — signer authenticity, file integrity, and auditability — are jointly supported. Legal non-repudiation would require a qualified PKI or regulatory signing layer, which is outside this prototype.

### Q: Why not just SHA-256 hash and call it signing?

A SHA-256 hash proves the file hasn't changed *given that you trust whoever stored the hash*. It does not prove who approved the document or that the approver wasn't impersonated. A malicious database administrator could replace both the file and the hash, and there'd be no way to detect it. WebAuthn signatures cryptographically bind a specific user identity to a specific file content using a private key the server never sees — so even a compromised server admin can't forge them.

### Q: Why multi-party signing instead of just the owner?

The Submitter's signature proves "this is the file I sent for review." But the reviewer is the one who decides whether to approve, and approval is the organizationally meaningful event. If only the Submitter signed, the system would not have independent evidence that each reviewer endorsed the file. Each reviewer signing at the moment of approval creates a separate cryptographic record for the specific file content.

### Q: Why not use the Windows certificate store (certmgr.msc)?

Browsers cannot directly read the Windows certificate store because that would be a serious security boundary violation. WebAuthn is the web-standard alternative: it lets web applications ask a registered authenticator to produce a signed assertion, while the server verifies the public-key signature. For this prototype, that gives practical internal verification without implementing a full PKI certificate lifecycle.

### Q: Why not PAdES (PDF-embedded signatures readable by Adobe)?

PAdES adds no cryptographic value over what WebAuthn already provides — it only changes how the signature is presented. The same ECDSA P-256 signature bytes that I store in the database could be wrapped in PAdES container format and embedded in the PDF's signature dictionary. The trade-off is implementation complexity (pdf-lib or @signpdf/signpdf, plus ASN.1 wrapping) versus presentation value. For a graduation project, I chose to keep signatures in a separate database table and provide verification through the application's certificate page. This is listed as high-priority future work in §8.2.1.

### Q: Why not VNPT-CA or Viettel-CA (Vietnamese PKI certificates)?

Two reasons. **Cost**: commercial PKI introduces per-user certificate cost and operational overhead. For a graduation project, this is unrealistic. **Complexity**: integrating real PKI requires obtaining a real certificate for each user, managing certificate lifecycle (issuance, renewal, revocation), and complying with legal-recognition requirements. My system demonstrates the technical foundation for document-specific signing; productizing it for legal compliance would mean integrating a CA. Listed as future work alongside Trusted Timestamp Authority integration in §8.2.1.

### Q: How do you know the user *actually* signed it and isn't being impersonated?

Five layers of evidence:
1. **PIN or biometric user verification is required** at every signing event when the platform authenticator supports it. The UV flag in `authenticatorData` is checked.
2. **The private key is not stored by the application server.** Signing is delegated to the registered authenticator.
3. **The credential is linked to the user's account** through the stored public key, credential ID, and AAGUID metadata.
4. **The sign counter** can indicate suspicious replay or cloned-authenticator behavior when reported by the authenticator.
5. **The public key was registered** during a previous WebAuthn registration ceremony, so the account-to-credential relationship is recorded before document signing.

Even if a server administrator wanted to forge a WebAuthn signature, they would not have the credential private keys. The server stores public keys and verification metadata, not signer private keys.

### Q: Walk us through the tamper scenarios (Figure 5.2).

**Panel (a) — untampered**: Both signatures show Hash Match (current file hash equals each signed hash) and WebAuthn-ES256 Valid (signatures are cryptographically valid). Panel header: "All hashes match" + "All crypto signatures valid." This is the steady state.

**Panel (b) — tampered between owner submission and reviewer approval**: Only the owner signed so far. Owner's signature shows Hash Mismatch (current file ≠ what owner signed) but WebAuthn-ES256 Valid (the signature math is still authentic — the file was tampered with, but the signature itself wasn't forged). A reviewer opening this document would refuse to approve, because the file they're reading isn't the file the owner sent.

**Panel (c) — tampered after final approval**: Both signatures show Hash Mismatch but WebAuthn-ES256 Valid. This is diagnostic — the signatures are cryptographically authentic (so neither signer is being impersonated), but the file has been modified after both legitimate signings.

The two-judgment design (Hash Match/Mismatch vs. ES256 Valid/Invalid) is intentional. They answer different questions and together pinpoint the failure mode.

### Q: What if the user loses their device or wipes it?

Currently, this breaks signing for that user because the registered credential is no longer available. Re-enrolling requires admin intervention to clear the old credential and let the user register a new one. I listed "WebAuthn credential lifecycle management" as future work in §8.2.4: administrators would need a panel to invalidate credentials, and users would need a self-service re-enroll flow gated by email confirmation. For the prototype, this is a known operational gap.

### Q: What about Linux users without Windows Hello?

The current code uses `authenticatorAttachment: "platform"`, which restricts WebAuthn to platform authenticators such as Windows Hello, Touch ID, or mobile biometric authentication. Linux desktop users without a configured platform authenticator cannot sign; they need to configure one or use another supported device. The application detects this case gracefully and shows setup instructions instead of crashing. Allowing cross-device WebAuthn would improve device coverage, but it changes the credential-scope story, so I list it as future work in §8.2.2.

### Q: How does this compare to DocuSign / Adobe Sign?

DocuSign and Adobe Sign use legally recognized e-signature products with mature audit trails and compliance features. My system focuses on a narrower internal-academic workflow: it records cryptographic WebAuthn evidence that a registered credential signed a specific PDF hash at approval time. That is useful for integrity and internal accountability, but it is not a replacement for certified e-signature platforms when legal recognition is required.

---

## 9. Security questions

### Q: How do you prevent SQL injection?

The application never builds SQL by string concatenation. All database access goes through the Supabase client's query builder (`.eq()`, `.ilike()`, `.in()`, …), which sends the values as bound parameters over PostgREST — they are matched against columns, never interpreted as SQL. The admin search feature uses `.ilike('title', `%${query}%`)`; the `query` string is bound as a parameter, not spliced into the statement. Tested with `'; DROP TABLE--` as a search term; safely treated as a literal (Table 7.3).

### Q: How do you prevent XSS?

React escapes all rendered content by default. Any string from the database is rendered as text, not HTML, unless I explicitly use `dangerouslySetInnerHTML` (which I don't, anywhere). User-uploaded PDFs are rendered through react-pdf which sandboxes pdfjs. AI-generated content (summary, key points) is rendered as text in styled containers.

### Q: How do you prevent CSRF?

Two layers. **First**, JWT cookies are issued by Supabase Auth with `SameSite=Lax` by default, which blocks cross-site cookie submission for most attack vectors. **Second**, mutating API routes verify the caller's identity via the JWT and check the body matches an authorized action (e.g., the submitter must be the document owner). A CSRF attack would have to forge a session, not just trick the browser into sending one.

### Q: What if the admin account is compromised?

Admin compromise is a serious incident. The admin can read all documents, delete documents, change user roles, and approve users. They cannot, however, produce a valid WebAuthn assertion for another user's registered credential because the server stores public keys, not private keys. So while a compromised admin could exfiltrate documents or abuse administrative workflows, they could not create a signature that verifies under a specific user's public key. The audit log records every admin action with actor + timestamp + target, so post-incident forensics is possible.

### Q: How do you handle file upload attacks?

The pipeline is staging-then-validate. The client uploads to a staging path; the server requests a tiny HTTP Range (`bytes=0-7`) so it downloads only the first few bytes, and checks that they begin with the PDF magic bytes `%PDF-` (first 5 bytes). Files that don't are deleted from staging and the request returns 400. Total size is read from the `Content-Range` header returned with the Range response and re-validated against the 10MB limit on the server (not trusting the client's pre-flight check). A `.exe` renamed to `.pdf` is caught (Table 7.3). Path traversal is prevented because the file path is constructed server-side as `${user.id}/${doc.id}/${timestamp}-${sanitized_name}`, never accepting user-provided paths.

### Q: What's the worst-case attack against this system?

The single most damaging attack would be **a successful XSS combined with a Windows Hello bypass**, allowing an attacker to silently produce signatures as the victim. WebAuthn explicitly defends against XSS by requiring user-verification on every signing, so a script that calls `navigator.credentials.get()` would trigger the Windows Hello prompt — the user would see it and refuse. So even worst-case, WebAuthn surfaces the attack to the user. The signing layer is the strongest defense in this system, which is appropriate because it's the most security-critical.

---

## 10. Performance questions

### Q: Walk us through your performance numbers (Table 7.2).

Dashboard load: ~600ms after query parallelization. Document detail: ~700ms including PDF render. AI summary on a 10-page document: ~4.2 seconds, with most time in the OpenAI API call. AI Q&A: ~2.8 seconds. Verify Integrity: ~1.1 seconds (hash recomputation dominated). WebAuthn signature verify on the server: ~150ms. All measured against a **production build** (`next build` + `next start`) on a laptop with an **AMD Ryzen 7 6800H, 32GB RAM**, Supabase in the Singapore region — matching Table 7.2 in the report. (Say "production build," not "dev mode" — dev mode numbers would be misleadingly slow and an examiner may ask.)

### Q: What's the content_hash caching for?

Originally, every WebAuthn signing event recomputed the SHA-256 hash of the file by downloading the entire PDF from Supabase Storage — about 6 seconds for a typical document. I added a `content_hash` column to `document_versions` that stores the hash on first computation. Subsequent signings, verifications, and certificate page loads read the cached value. This saved ~6 seconds per signing operation, which matters when the user is waiting at a Windows Hello prompt.

### Q: How did you parallelize the dashboard queries?

The dashboard server component originally ran 9 independent queries sequentially — total ~5 seconds. I wrapped them in a single `Promise.all` so they fire concurrently and the total time is bounded by the slowest, not the sum. Now ~600ms. This is a Postgres connection-pool consideration too; Supabase handles up to 60 concurrent connections on the free tier, which is more than enough for 9 parallel reads.

### Q: What about scale? What if you had 1,000 users?

Vercel scales serverless functions automatically; Supabase free tier handles ~500MB database and ~50,000 monthly active users. For 1,000 users:
- Database: easily within free tier.
- Storage: depends on document volume — at 10MB max per PDF and ~10 documents per user, that's ~100GB, would need a paid tier.
- AI cost: at ~$0.001 per summary call and 1,000 users × 10 summaries/month = ~$10/month. Modest.
- WebAuthn signing: ~150ms server-side verify, so even 100 concurrent signings would not saturate a single Vercel function.

The architecture scales horizontally. The real bottleneck at 10,000+ users would be Vercel pricing, not architecture.

### Q: What about cold starts on Vercel?

Vercel serverless functions cold-start in 100–300ms on first invocation. For interactive page loads, this is masked by the parallel data fetching — the function spins up while the database queries are firing. For API routes, a cold start adds noticeable latency to the *first* call but subsequent calls within ~10 minutes reuse the warm container.

---

## 11. Testing & validation questions

### Q: Why no automated tests?

Honest answer: time. Manual testing covered all the main user flows and edge cases (Table 7.1, Table 7.3), but a proper Playwright suite to automate the regression check would have been another two weeks of work. I prioritized building features and writing the report. Playwright is in §8.2.2 as medium-priority future work — for a real deployment, automated tests would be essential to catch regressions.

### Q: How did you verify each feature works?

Manually, with three test accounts (employee, reviewer, admin) in separate browser sessions. Each main use case in §4.1.1 was exercised end-to-end. Edge cases — resubmission after rejection, deadline expiry, tamper detection, RLS bypass attempts, malformed payloads — were exercised explicitly. The results are summarized in Table 7.1 (functional coverage) and Table 7.3 (security attack scenarios).

### Q: How did you test RLS specifically?

Two methods. **First**, the application interface — signed in as each role and confirmed each user sees only their authorized rows. **Second**, the Supabase SQL editor with role impersonation in a transaction:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"<uuid>","role":"authenticated"}';
SELECT * FROM documents;
ROLLBACK;
```

The second method exercises the policies directly without any application code, so it's a pure test of the database-level security boundary.

### Q: What's the biggest bug you found and fixed?

A subtle one: the AI Workspace component wasn't remounting when a new document version was uploaded, so the cached summary from the old version would persist visually. The fix was to add `key={latestVersion?.id}` to the component, which forces React to unmount-remount when the version ID changes. This is a good example of "the bug is in your mental model, not the code" — the code was technically correct, but assumed version changes would trigger refresh, which they didn't.

(Have one of these ready for when you're asked to talk through a debugging story.)

---

## 12. Limitations & future work questions

### Q: What's the biggest limitation of the current system?

The Linux platform-authenticator gap. WebAuthn with `authenticatorAttachment: "platform"` requires Windows Hello, Touch ID, or a mobile biometric. Linux desktops without a configured fingerprint reader or PIN can't sign at all. The application detects this and shows setup instructions, but users on Linux without that hardware have to use another device. Removing the restriction would allow phone-via-QR-code signing but weaken the "credential bound to this physical machine" property — a configurable per-deployment toggle is the right long-term solution (§8.2.2).

### Q: If you had three more months, what would you build next?

In priority order: (1) **PAdES PDF-embedded signatures** — let users open signed PDFs in Adobe Reader and see the signature panel without needing my application. (2) **Trusted Timestamp Authority integration** — RFC 3161 timestamps for non-repudiation that survives database tampering. (3) **Automated Playwright test suite** for regression coverage. (4) **Self-hosted open-weights model** for data sovereignty. These are §8.2.1 and §8.2.2 in the report.

### Q: What would you do differently if you started over?

Two things. **First**, I'd write Playwright tests as I build features, not at the end. Manual testing scales poorly once the feature count grows. **Second**, I'd design the WebAuthn credential model for multi-device from day one — a `webauthn_credentials` table with a foreign key to profiles. Adding it as a refactor later is more work than designing it correctly upfront.

### Q: What about cost at scale?

I addressed this in §1.4 with a cost paragraph. Hosting on Vercel + Supabase fits in free tiers at prototype scale. AI calls cost fractions of a cent each. For an organization processing hundreds of documents per month, monthly AI cost stays modest but is not zero. For data sovereignty or cost optimization at scale, switching to a self-hosted open-weights model is the appropriate path.

### Q: What about Vietnamese-language documents?

The AI assistant works on Vietnamese text — gpt-5.4-mini is multilingual. Quality is somewhat lower than English on highly technical Vietnamese, but acceptable for the use case. I noted multi-language summaries as future work in §8.2.3.

### Q: What about regulations like Decree 13/2023/NĐ-CP?

Vietnam's Decree 13 on Personal Data Protection restricts cross-border transfer of Vietnamese personal data. My system sends document text to OpenAI's US servers when AI features are invoked — this is a compliance gap for organizations whose documents contain personal data. The mitigation is the self-hosted model future-work item (§8.2.2) — the OPENAI_MODEL environment variable means the same architecture can be repointed at a local Llama 3 deployment without code changes. I called this out explicitly in §1.4 and §7.4.

---

## 13. Vietnamese context questions

### Q: How does this compare to VNPT-CA or Viettel-CA?

VNPT-CA and Viettel-CA are PKI certificate authorities: they issue real X.509 certificates that bind a user's legal identity to a public key and support legally recognized signatures. My system implements technical verification primitives such as WebAuthn-based signer evidence, file integrity verification, and audit history, but not the legal-recognition layer, because that requires CA certification.

For an organization that needs legally binding signatures, VNPT-CA or another certified provider is the right answer. For internal academic workflows where the goal is traceability and integrity rather than legal signing, my system provides practical technical evidence at zero per-user certificate cost.

### Q: Could this comply with the Law on Electronic Transactions?

Not in its current form. The Law requires certification by a qualified trust service provider, which I'm not. But the technical foundation is in place — adding a Trusted Timestamp Authority (RFC 3161) and integrating with a certified CA would close the compliance gap. This is precisely the path I listed in §8.2.1 future work.

### Q: Why did you choose this topic?

(This is your honest motivation — fill in what's true for you. Suggested framing:)

> "I wanted a project that combined three areas I'd studied: web development, database security, and emerging AI. Academic document review is a familiar problem in university departments and research groups: proposals and reports often move through email, shared folders, and informal comments, but the approval responsibility and final version are hard to track. Building this system gave me hands-on experience with real RLS, real cryptography, and real LLM integration, rather than the toy examples in coursework."

---

## 14. Tricky / provocative questions

These are the ones designed to catch you off-guard. Prepare for them.

### Q: "Couldn't you have built this in Python with Django?"

Yes. Django + django-postgres-extensions for RLS + Celery for async + a separate React frontend would produce a functionally similar system. The reason I chose Next.js is that **the server-component model unifies the server and the rendering layer** — I don't need a separate API gateway, the same TypeScript types are used end-to-end, and Vercel deploys it with one command. Django is a strong alternative; Next.js is what fits my goal of single-developer end-to-end delivery.

### Q: "Why should I trust the OpenAI API for a document approval system?"

You shouldn't trust the AI's decisions — you should trust the *human reviewers* who make the final approval. The AI is augmentation: it summarizes long documents and answers questions, but the approve/reject decision is always human. If OpenAI is unavailable, the workflow continues normally without AI assistance. The trust boundary is at the human reviewer, not the model.

### Q: "Your tamper detection requires people to actually click Verify Integrity. What if they don't?"

Correct — this is a design choice. The Verify button is exposed prominently on the document detail page and the certificate page, but it's not automatic. The reason: an automatic check on every page load would mean recomputing the SHA-256 hash on every render, which is expensive. The right answer for production would be a **periodic background scan** that flags any document whose stored hash doesn't match the current file hash. I'd add this as an operational improvement (§8.2.4).

### Q: "Couldn't a malicious admin just delete the audit logs?"

A determined admin with full database access could. The audit log table is append-only at the application level (no DELETE route), but a service-role connection could run `DELETE FROM audit_logs`. The mitigation in a real deployment would be (1) **log shipping** to an external append-only store (e.g., S3 with object lock), and (2) **separation of duties** so no single admin holds both write access and audit-log access. For a graduation project, this is acknowledged as future work under "Production monitoring" (§8.2.4).

### Q: "What stops someone from approving their own document?"

Application-level checks. The submission route verifies the caller is the document owner and rejects any reviewer ID in the reviewer list that matches the owner. The decision route verifies the caller has an approvals row for the document and is the assigned reviewer. So an owner cannot be self-assigned as a reviewer. RLS at the database level reinforces this — the reviewer must have an approvals row to act on the document.

### Q: "Why did you choose graduation project instead of a thesis?"

(If applicable — this is curriculum-dependent. Possible framing:)

> "This is the standard final project for the BSc ICT program. The format is design + implementation + report + defense, which matches my strengths and gives me a portfolio artifact I can show to employers."

### Q: "What if I, the panel, just don't trust your code?"

Fair — that's what defense in depth is for. (1) The RLS policies are visible in the SQL migrations, you can read them. (2) The WebAuthn verification is done by `@simplewebauthn/server`, a widely-used open-source library. (3) The structured outputs from OpenAI follow a public JSON schema. (4) The PDF magic-byte validation is one function in `lib/pdf-validation.ts` that you can audit in 30 seconds. The trust boundary is not "trust my code" but "trust the documented mechanisms and verify the application uses them correctly."

### Q: "This is a lot of complexity for a student project. Did you really build all of this?"

(Honest answer with confidence:)

> "Yes. I built it incrementally over [N] months, with supervisor checkpoints along the way. The git history shows the progression — early commits are the basic auth and document upload, the AI integration came in May, the WebAuthn signing went through three iterations from hash-only to public-key to multi-party WebAuthn, all driven by supervisor feedback. The complexity is real because the domain has real requirements; my contribution is integrating them coherently."

---

## 15. If you don't know the answer

### What to say

> "I don't have a confident answer to that. My best guess would be [X], but I'd want to verify by [reading the documentation / testing it / consulting my supervisor] before stating it as fact."

### What NOT to say

- Don't bluff. The panel will probe, and you'll dig deeper.
- Don't deflect. "That's outside the scope of this project" is rarely a true answer to a technical question.
- Don't apologize excessively. One acknowledgment is enough.

### Recovery strategies

- **Pivot to what you do know**: *"I'm not sure about [the specific edge case], but here's how I would think about it: [reasoning from principles]."*
- **Cite documentation**: *"I followed the WebAuthn W3C specification on this — specifically section [X] — and the SimpleWebAuthn library handles the low-level details."*
- **Offer to follow up**: *"That's a good question; I'd like to investigate it properly and follow up via email."*

The panel respects intellectual honesty far more than confident bullshitting.

---

## 16. The night before defense — final checklist

- [ ] Re-read this document, especially Section 8 (Signing)
- [ ] Rehearse the demo script 3 times with a timer
- [ ] Verify your Vercel deployment is up and reachable
- [ ] Verify all three test accounts (employee, reviewer, admin) work
- [ ] Pre-upload a test PDF so you don't waste demo time
- [ ] Pre-record the backup demo video
- [ ] Charge your laptop, bring the charger
- [ ] Test screen-share if defending remotely
- [ ] Get 7+ hours of sleep — your reasoning under pressure depends on this more than anything

You built a system that genuinely covers all three of: structured workflow, real LLM integration, and WebAuthn-based multi-party signing. That's above the bar for a USTH BSc ICT defense. The remaining work is presenting it confidently. You can do this.

---

*End of defense preparation document.*
