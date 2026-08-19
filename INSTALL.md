# Installation & Run Instructions

**AI-Assisted Document Approval System** — Tran Minh (23BI14290), USTH.

This is a web application built with Next.js 16, React 19, Supabase (PostgreSQL +
Auth + Storage), and the OpenAI API. There is no compiled `.exe`: the "program" is
the web application, which can be used in two ways.

---

## Option A — Use the live deployed application (no setup)

The application is deployed and running at:

> **<ai-document-bot.vercel.app>**

Open the URL in a modern browser (Chrome or Edge recommended, for WebAuthn /
Windows Hello signing), register an account, and an administrator approves it.
This is the quickest way to evaluate the running system.

---

## Option B — Run from source locally

### Prerequisites
- **Node.js >= 20**
- A free **Supabase** project (provides the database, auth, and file storage)
- An **OpenAI API key** (for the AI summary / Q&A / OCR features)

### Steps

1. **Install dependencies** (this folder contains the source code; `node_modules`
   was removed to keep the archive small and is reinstalled here):
   ```bash
   npm install
   ```

2. **Configure environment variables.** Copy `.env.example` to `.env.local` and
   fill in your own Supabase and OpenAI values:
   ```bash
   cp .env.example .env.local
   ```
   See the comments inside `.env.example` for where to obtain each value. At
   minimum you must set the three Supabase variables, `OPENAI_API_KEY`, and
   `NEXT_PUBLIC_APP_URL`.

3. **Set up the database.** In the Supabase SQL editor, run the schema-migration
   SQL. The full SQL (tables, Row-Level Security policies, and later additions) is
   documented inline in `PROJECT_STATE.md` under the "schema migration" code
   blocks, and the standalone migration files are in the `migrations/` folder. Run
   each block once.

4. **Start the application:**
   ```bash
   npm run dev
   ```
   Then open <http://localhost:3000>, register an account, and grant yourself the
   `admin` role by editing the `profiles.role` column in Supabase Studio (the first
   account must be promoted manually; afterwards admins approve other accounts in
   the app).

### Production build (optional)
```bash
npm run build
npm run start
```

---

## Notes for the evaluator
- **Digital signing** uses WebAuthn (Windows Hello / Touch ID). It requires a
  device with a platform authenticator and a Chromium-based browser. On the live
  URL (Option A) this works out of the box on Windows/macOS.
- **No secrets are included** in this archive. The `.env.example` lists the
  variable names with placeholder values only; you supply your own keys.
- Architecture, database schema, and design decisions are documented in
  `README.md`, `PROJECT_STATE.md`, and `SUPABASE_CONTEXT.md`.
