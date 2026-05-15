# AI Document Review Assistant

A document-review SaaS where employees submit PDFs, reviewers approve or reject with passage-level comments, and admins manage the system. Includes an OpenAI-powered assistant for summarization and Q&A, plus digital signature with integrity verification.

> **Graduation project** — Vietnamese university, 2026.

- **Live demo**: <!-- TODO:https://ai-document-bot.vercel.app/
- **Source**: <!-- TODO: https://github.com/TMinh357/ai-document-bot

---

## Features

- **Multi-role workflow** — `employee` / `reviewer` / `admin`, enforced at both the page level (auth helpers) and the database level (Postgres Row-Level Security).
- **Multi-version uploads** — every PDF round of revision is preserved; latest vs. superseded versions are clearly badged.
- **Multi-reviewer rounds** — submitter picks N reviewers per round; document is approved only when *all* reviewers approve, rejected immediately if any reject. Resubmission opens a new round with full history preserved.
- **Inline PDF viewer** with passage-level highlights and comments (`react-pdf` + page-relative bounding-rect coordinates so highlights survive zoom/resize).
- **AI Assistant** (real OpenAI, not mocked) — extract text, generate summary / key points / risk notes via structured-output JSON schema, ask grounded questions about the document.
- **Digital signature** — SHA-256 hash stored on approval; verify-integrity button recomputes and compares; print-friendly certificate page.
- **Review SLAs** — submitter picks a deadline; dashboard color-codes overdue (red) / due-soon (amber) / normal (teal); lazy in-app reminders fire when reviewers load the dashboard.
- **Notifications** — bell icon in header with unread badge + dropdown; in-app reminders for review assignment, progress, overdue, approval, rejection.
- **Admin panel** — user role management, document oversight (with cascade delete), audit logs with filters, advanced search across extracted document text.
- **Dashboard analytics** — CSS-only charts (no library): documents by status, documents by month, approval/rejection ratio.

For the full feature inventory, schema details, and architectural decisions, see [`PROJECT_STATE.md`](./PROJECT_STATE.md).

---

## Architecture

```mermaid
graph TD
  subgraph Client[Browser]
    UI[Next.js pages<br/>App Router · React 19]
    Bell[NotificationBell]
    Viewer[InlinePdfViewer<br/>react-pdf]
    AIUI[AIWorkspace]
  end

  subgraph Server[Next.js Server &middot; Vercel]
    Pages[Server Components<br/>requireUser / requireRole]
    API[API Routes<br/>/api/documents/*<br/>/api/approvals/*<br/>/api/admin/*]
    Lib[lib/openai.ts<br/>lib/pdf-validation.ts<br/>lib/review-reminders.ts]
  end

  subgraph Supabase[Supabase]
    Auth[Auth<br/>JWT cookies]
    DB[(Postgres<br/>+ RLS policies)]
    Store[Storage<br/>documents bucket]
  end

  OpenAI[OpenAI API<br/>gpt-5.4-mini]

  UI --> Pages
  Bell --> DB
  Viewer --> Store
  AIUI --> API

  Pages -->|anon-key, RLS-bound| DB
  Pages --> Auth
  API -->|service-role, bypasses RLS| DB
  API --> Store
  API --> Lib
  Lib --> OpenAI

  Auth -.->|sets cookie| UI
```

**Key architectural choices**:

- **Two database clients on the server.** The anon-key client (`lib/supabase/server.ts`) is used for all reads from server components and respects RLS. The service-role client (`lib/supabase/admin.ts`) is used only inside API routes for privileged writes (inserts into `documents`, `document_versions`, `audit_logs`) — bypassing RLS deliberately, but only after the route has authenticated the user and validated the action.
- **RLS is real, not theatrical.** `documents` and `document_versions` SELECT policies restrict to `owner OR assigned-reviewer OR admin`. Even with the anon key leaked, a malicious client cannot enumerate other users' documents.
- **Upload pipeline is staging-then-validate.** The browser uploads to a `_staging/` path under the user's RLS-allowed prefix, then a server route fetches the magic bytes via a Range request, validates `%PDF-` + size, and only then moves the file to its final path and inserts the row. Skipping the API call cannot bypass validation because the row insert requires the service role.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack, React Server Components) |
| UI | React 19, Tailwind v4 (custom design system) |
| Language | TypeScript (strict) |
| Database | Supabase Postgres + Row-Level Security |
| Auth | Supabase Auth (cookie-based JWT) |
| File storage | Supabase Storage |
| PDF text extraction | `pdf-parse` (server-side) |
| PDF rendering | `react-pdf` (client-side, with worker copied via postinstall hook) |
| AI | OpenAI API (`gpt-5.4-mini` by default; structured outputs for summary) |
| Hosting | Vercel |

---

## Local setup

**Prerequisites**: Node.js ≥ 20, an OpenAI API key, and a Supabase project (URL + anon key + service-role key).

1. Clone and install:
   ```bash
   git clone <repo-url>
   cd ai-document-bot
   npm install
   ```
2. Create `.env.local` in the project root:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-5.4-mini
   ```
3. Apply database migrations. The full SQL for tables, RLS policies, and the schema additions used by this project is documented inline in [`PROJECT_STATE.md`](./PROJECT_STATE.md) under the schema-migration code blocks. Run each block once in the Supabase SQL editor.
4. Run the dev server:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 and register an account. To grant yourself admin/reviewer roles, update the `profiles.role` column directly in Supabase Studio.

---

## Project structure

```
app/                        Next.js App Router
  api/                      Server-only API routes (validation + service-role writes)
  admin/                    Admin-only pages
  dashboard/                Per-user dashboard
  documents/                Document list + detail
  reviews/                  Reviewer queue
  notifications/            Full notifications inbox
components/                 Client + server components
  AIWorkspace.tsx           AI summary/Q&A UI
  InlinePdfViewer.tsx       react-pdf + highlight system
  NotificationBell.tsx      Header bell with dropdown
  ...
lib/
  openai.ts                 OpenAI client wrapper (structured outputs, error mapping)
  pdf-validation.ts         Magic-byte + size validation via Range request
  review-reminders.ts       Lazy overdue-reminder fanout
  supabase/                 SSR + admin clients, auth helpers
PROJECT_STATE.md            Living spec — features, schema migrations, decisions
SUPABASE_CONTEXT.md         DB schema + RLS policy snapshot
AGENTS.md                   Next.js 16 caveat reminder for AI coding assistants
CLAUDE.md                   Workflow rules for AI coding assistants
```

---

## Documentation

- [`PROJECT_STATE.md`](./PROJECT_STATE.md) — single-source-of-truth project spec; read this first when extending the project.
- [`SUPABASE_CONTEXT.md`](./SUPABASE_CONTEXT.md) — database schema, foreign keys, RLS policies, sample data.
- [`AGENTS.md`](./AGENTS.md) — note for AI coding assistants about Next.js 16 breaking changes.
- [`CLAUDE.md`](./CLAUDE.md) — workflow rules used during development.

---

## Screenshots

<!-- TODO: drop 2-3 PNGs into a /docs/screenshots folder and reference them here, e.g.:

![Dashboard](docs/screenshots/dashboard.png)
![Document detail with inline PDF + highlights](docs/screenshots/document-detail.png)
![AI summary + Q&A](docs/screenshots/ai-workspace.png)

-->

---

## License

This project was built as an academic graduation submission. All rights reserved by the author.
