# Complete Project Guide — AI-Assisted Document Approval System

> A from-first-principles guide to every technology and every feature in the project. Read this to *understand*, not to memorize. After reading, you should be able to explain any part of the system in your own words.
>
> Companion to `DEFENSE_PREP.md` (which is the Q&A cheat sheet). This file is the conceptual deep dive.

---

## Table of Contents

**Part 1 — What This Project Is**
- 1.1 The problem
- 1.2 The solution at a glance
- 1.3 The three "rooms" of the system

**Part 2 — The Technology Stack Explained**
- 2.1 Frontend: Next.js, React, Tailwind, react-pdf
- 2.2 Backend: Supabase (PostgreSQL + Auth + Storage + Realtime)
- 2.3 AI layer: OpenAI API, pdf-parse, structured outputs
- 2.4 Cryptography layer: SHA-256, WebAuthn, TPM, ECDSA P-256
- 2.5 Infrastructure: Vercel, Brevo, environment variables

**Part 3 — The Database Schema**
- 3.1 The ten tables and what each one stores
- 3.2 Foreign keys and relationships
- 3.3 Why this schema (design decisions)

**Part 4 — The Security Architecture**
- 4.1 Role-Based Access Control (RBAC)
- 4.2 Row-Level Security (RLS) in depth
- 4.3 The two-client pattern (anon-key vs service-role)
- 4.4 JWT cookies and session security
- 4.5 Defenses against specific attacks

**Part 5 — Every Feature, In Depth**
- 5.1 Registration and admin approval
- 5.2 The document upload pipeline
- 5.3 The AI assistant
- 5.4 The WebAuthn signing system (the centerpiece)
- 5.5 The multi-round, multi-reviewer approval pipeline
- 5.6 Passage-level highlights and comments
- 5.7 Review deadlines and lazy reminders
- 5.8 Notifications (in-app, email, realtime)
- 5.9 Admin panel features
- 5.10 Dashboard analytics

**Part 6 — How the Code is Organized**

**Part 7 — Glossary of Terms**

---

# Part 1 — What This Project Is

## 1.1 The problem

Imagine you work at a Vietnamese university department. Every week, employees produce documents that need approval before they go anywhere — a research proposal, an internal report, a budget request, a policy draft. The current process is messy: the author emails the PDF to the head of department; the head forwards it to two senior staff; one of them prints it, signs it on paper, scans it, sends it back; the head emails everyone confirming the document is approved.

Now ask three questions about this process:

1. **Where can the author see who has approved their document?** Nowhere. They have to chase people on email or messenger.
2. **If someone changes the PDF a week after approval, can anyone tell?** No. There's no record that ties "this exact file" to "the approval decision."
3. **What if the document is 80 pages of dense legal text and the reviewer needs to find the parts about budget? Can software help?** No. The reviewer reads the whole thing manually.

These three gaps — **workflow visibility**, **integrity guarantee**, and **intelligent assistance** — are what this project addresses, in one application.

## 1.2 The solution at a glance

The system is a **web application** that does three things:

**First**, it tracks document approvals as structured workflows. Every document has a status (`draft`, `pending`, `approved`, or `rejected`). Every approval is recorded as a database row with the reviewer, the decision, the timestamp, and the comment. The author has a single dashboard that shows the current state of every document they've submitted.

**Second**, it cryptographically signs documents at every decision point. When the author submits a document for review, their device produces a digital signature using Windows Hello (or Touch ID, or fingerprint). When each reviewer approves, *their* device produces a signature too. Anyone in possession of the approved file can later click a Verify Integrity button and prove two things: that the file hasn't been altered since signing, and that the signatures were produced by the registered users (not forged).

**Third**, it provides an AI assistant that reads the document and helps the reviewer. The assistant generates a structured summary (concise summary + bullet-point key points + risk notes), and answers natural-language questions grounded in the document content. It uses OpenAI's `gpt-5.4-mini` model with JSON-schema-constrained output, so the format is predictable.

## 1.3 The three "rooms" of the system

Think of the system as three physical rooms in a building, with locked doors between them.

**Room 1 — The browser.** This is where the user lives. They see HTML pages, click buttons, fill forms, see results. The browser holds the user's session cookie and runs only the JavaScript necessary for interactive features (the PDF viewer, the AI workspace, the notification bell). It does NOT hold any API keys, signing keys, or sensitive credentials.

**Room 2 — The Next.js server.** This is the application logic. It receives HTTP requests from browsers, checks authentication, validates inputs, queries the database, orchestrates calls to OpenAI, and sends back HTML or JSON responses. The server has the OpenAI API key, the Supabase service-role key, and the Brevo email API key — none of these ever reach the browser.

**Room 3 — Supabase (managed PostgreSQL + Auth + Storage + Realtime).** This is the data layer. It holds every document, every approval, every notification, every signature. It's hosted by Supabase as a managed service. The Next.js server talks to it; the browser never does directly.

Between Room 2 and Room 3 there's an extra security layer called Row-Level Security, which Part 4 explains in depth. Between Room 1 and Room 2, every request carries a JWT cookie that proves the user's identity. The "locked doors" are the boundaries where authentication and validation happen.

This three-room model is called a **three-tier architecture**, and it's the standard pattern for web applications. The reason for the separation: each room can be replaced independently. The browser could be a mobile app instead. The Next.js server could be replaced with another Node framework. The database could be hosted somewhere else. Each layer has a clear contract with the next.

---

# Part 2 — The Technology Stack Explained

## 2.1 Frontend: Next.js, React, Tailwind, react-pdf

### What is React?

React is a **JavaScript library for building user interfaces by composing components**. A "component" is a function that takes data (called *props*) and returns a description of UI (a tree of elements like `<div>`, `<button>`, `<form>`). React then turns that description into actual DOM nodes in the browser.

The key idea is that components are **reusable** and **declarative**. Instead of writing imperative code like *"find the button by ID, attach a click handler, when clicked find the counter element, increment its text"*, you write: *"this component takes a count prop and displays it; when the button is clicked, update the count state."* React figures out the DOM changes for you.

In this project, components like `<DocumentList>`, `<AIWorkspace>`, `<NotificationBell>`, `<SigningKeySetup>` are the building blocks. They're defined in the `components/` folder.

### What is Next.js?

Next.js is a **framework built on top of React** that adds three things React alone doesn't provide:

1. **Routing.** In plain React, you'd need a library like react-router and configuration. In Next.js, the URL `/documents/123` is automatically served by the file at `app/documents/[id]/page.tsx`. The file system is the router.

2. **Server-side rendering (SSR).** Plain React runs entirely in the browser — the user gets an empty HTML page, then JavaScript downloads and renders the content. This is slow on first load and bad for search engines. Next.js can render React components on the *server* first, send fully-rendered HTML to the browser, and then "hydrate" it with JavaScript for interactivity.

3. **API routes.** In Next.js, a file at `app/api/documents/route.ts` becomes an HTTP endpoint. You can serve both the page and its API from the same project.

### The Next.js 16 App Router

The "App Router" is the newer way of building Next.js apps (introduced in version 13, mature in 16). The older way ("Pages Router") had pages and APIs in separate folders. The App Router puts them all in the `app/` folder using a clear file naming convention:

- `app/page.tsx` → the home page (`/`)
- `app/documents/page.tsx` → the documents list (`/documents`)
- `app/documents/[id]/page.tsx` → a single document (`/documents/123`)
- `app/api/documents/route.ts` → the API endpoint (`POST /api/documents`)

### Server Components vs Client Components

This is the single most important Next.js 16 concept to understand.

**Server Components** are React components that run *only on the server*. They never run in the browser. They can read from databases directly, use server-only secrets (like API keys), and produce HTML that gets sent to the browser. The browser never downloads their JavaScript.

**Client Components** are traditional React components that run in the browser. They can use state (`useState`), effects (`useEffect`), event handlers, and browser APIs. They're declared by adding `"use client";` at the top of the file.

A page in this project typically uses both: a server component does the initial data fetching and authentication, then renders client components for any interactive parts.

For example, the document detail page (`app/documents/[id]/page.tsx`) is a server component. It calls `requireUser()`, fetches the document, signatures, approvals, and AI results from Supabase, and renders an HTML page. Inside that page, the AI Workspace and the Submit form are client components — they need interactivity (button clicks, form state, Windows Hello prompts).

The benefit: the server component runs fast on the server with full database access, and the client gets a small JavaScript bundle for just the interactive parts. The user sees content immediately because the HTML arrived rendered.

### React 19

React 19 is the latest major version. The relevant changes for this project:

- **Improved server components.** Faster rendering and better integration with Next.js.
- **`use()` hook.** Lets a component "await" a promise during rendering. Useful for data fetching.
- **Form actions.** Forms can directly call server functions without writing fetch boilerplate. Some places in this project use this.

These are incremental improvements — nothing exotic.

### Tailwind CSS v4

Tailwind is a **utility-first CSS framework**. Instead of writing CSS classes like `.button-primary` and putting the styles in a separate file, you compose styles inline using small utility classes: `<button className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-xl">`.

The advantage: every component is self-contained. To change the button style, you change the className, not a CSS file. The browser only downloads CSS for classes you actually used (Tailwind's compiler removes unused classes).

Version 4 (the version in this project) is a major rewrite that uses a CSS-native pipeline instead of PostCSS, making it faster and smaller. The configuration lives in `app/globals.css` instead of a separate JS file.

This project adds a small custom design system on top of Tailwind:
- `page-shell` — the outer container with consistent padding and max-width
- `section-card` — a white rounded card with subtle shadow
- `metric-card` — the dashboard metric tiles
- `status-pill` — the rounded status badges
- `button-primary` / `button-secondary` — the two button variants
- `eyebrow` — small uppercase label above a heading
- `muted-copy` — subdued explanatory text

These are defined in `app/globals.css` and used throughout the components for consistency.

### react-pdf

PDFs are not images — they're a structured document format with text layers, vector graphics, fonts, and metadata. Displaying a PDF in a browser requires a JavaScript library that parses the PDF format and renders it to a `<canvas>` element.

`react-pdf` is a React wrapper around **pdfjs-dist** (the official Mozilla PDF.js library that powers Firefox's PDF viewer). It exposes React components like `<Document>` and `<Page>` that handle the heavy lifting.

In this project, react-pdf renders the document inline on the detail page. The user can navigate pages (prev/next), zoom (50%–200%), and the text layer is enabled — meaning text is selectable, which is required for the passage highlight feature.

One quirk: pdfjs-dist uses a "worker" — a separate JavaScript file that runs in a Web Worker thread to avoid blocking the main UI thread during PDF parsing. The worker file has to be served from the same origin as the application, so this project includes a small script (`scripts/copy-pdf-worker.mjs`) that copies the worker file from `node_modules` to `public/` on install. Otherwise, the PDF viewer would silently fail with a worker-loading error.

## 2.2 Backend: Supabase (PostgreSQL + Auth + Storage + Realtime)

### What is Supabase?

Supabase is what's called a **Backend-as-a-Service (BaaS)** — a hosted platform that gives you several backend services through one set of client libraries. You can think of it as "Firebase but built on PostgreSQL and open-source."

Concretely, Supabase provides:

1. **A managed PostgreSQL database.** You don't install or maintain anything. They handle backups, scaling, replication, security patches.
2. **An authentication service.** Sign-up, sign-in, password reset, OAuth providers, JWT issuance — all built in.
3. **Object storage.** Like Amazon S3 but with the same identity system as the database.
4. **Realtime.** A websocket layer that broadcasts database changes to subscribed clients.
5. **A unified client library.** One TypeScript SDK talks to all four services.

The reason this matters: building these four services yourself, each with proper security, would take months. Supabase gives you a production-grade backend in minutes.

### PostgreSQL — what it is

PostgreSQL (often just "Postgres") is an open-source **relational database management system (RDBMS)**. "Relational" means data is organized into tables with rows and columns, and tables can reference each other through foreign keys. It's the same family as MySQL, MariaDB, Oracle, SQL Server.

Postgres has been around since 1986. It's known for being extremely correct (it follows the SQL standard closely), feature-rich (it has JSON support, full-text search, geographic data, row-level security), and reliable.

This project uses Postgres for everything structured: user profiles, documents, approvals, signatures, notifications, audit logs. The PDF files themselves don't live in Postgres — they live in Supabase Storage (object storage). But the metadata about each file (path, size, uploader, version number) lives in Postgres.

### Row-Level Security (RLS) — what it is

This is the most important Postgres feature in the project. Read this carefully.

Normally in a database, access control happens at the *table* level: you grant or deny SELECT, INSERT, UPDATE, DELETE permissions per table per user. Row-Level Security extends this to the *row* level: you can write a SQL predicate that determines, for each row, whether the current user can see or modify it.

Here's an example. The `documents` table has a SELECT policy:

```sql
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
```

This means: when an authenticated user queries `SELECT * FROM documents`, Postgres silently augments the query to:

```sql
SELECT * FROM documents
WHERE (
  documents.owner_id = <current_user_id>
  OR <current user has an approvals row for the document>
  OR <current user is an admin>
);
```

The application doesn't need to remember to filter — the database does it automatically. Even if the application code has a bug, the database refuses to return unauthorized rows.

This is **declarative security**: the rules are written once in SQL, version-controlled with the rest of the schema, and applied uniformly to every query through the authenticated client.

### Supabase Auth — what it does

Supabase Auth is a service that handles:

- **Registration.** A user signs up with email and password; their credentials are stored (hashed with bcrypt + salt) in a special `auth.users` table.
- **Sign-in.** Verifies password, issues a JSON Web Token (JWT).
- **Session management.** The JWT is stored as an HTTP-only cookie. HTTP-only means it cannot be read by JavaScript in the browser — which protects it from XSS attacks. The cookie is sent on every subsequent request, proving the user's identity.
- **JWT format.** The token contains the user's UUID, email, role (always `authenticated` for signed-in users), and an expiration timestamp. It's signed with a secret key so it can't be forged.
- **Integration with Postgres.** Postgres can read the JWT via `auth.uid()` and `auth.jwt()`, which is how RLS policies know who the current user is.

The application code in `lib/supabase/auth.ts` wraps Supabase Auth with helper functions:

- `requireUser()` — fetches the current profile, redirects to sign-in if not authenticated, or to `/account-status` if pending or rejected.
- `requireRole(roles)` — like `requireUser()`, but also checks the profile's role is in the allowed list.

### Supabase Storage — what it does

Supabase Storage is an **object storage** service. It stores files (PDFs, images, anything) and serves them via HTTPS URLs. It's similar to Amazon S3 or Google Cloud Storage.

Key features used in this project:

- **Buckets.** A bucket is a named container for files. This project has one bucket called `documents`.
- **Paths.** Within a bucket, files have paths like `user-uuid/document-uuid/timestamp-filename.pdf`. The path structure is hierarchical.
- **HTTP Range requests.** Allows downloading just part of a file (the validator requests `bytes=0-7`) instead of the whole thing. This is critical for the upload validation pipeline — the server only downloads the first few bytes to check the PDF magic number, not the entire 10MB file.
- **Signed URLs.** Temporary URLs that grant time-limited access to a file. The PDF viewer uses signed URLs so the file is fetched by the browser directly from Supabase, without going through the Next.js server.
- **RLS integration.** Storage policies work like database RLS — you can grant access based on the user's identity and file path.

### Supabase Realtime — what it does

Realtime is the websocket layer. Here's what it does:

Normally, the browser communicates with the server through HTTP requests. The browser asks; the server answers. The browser doesn't know about changes until it asks again. This works for static content but doesn't let the server *push* updates to the browser.

A **websocket** is a long-lived two-way connection between browser and server. Once opened, either side can send messages at any time.

Supabase Realtime uses websockets to broadcast database changes. It hooks into Postgres's logical replication system: when a row is INSERTed, UPDATEd, or DELETEd on a replicated table, Postgres tells Realtime, and Realtime broadcasts a structured JSON message to every subscribed client.

In this project:

- The notification bell subscribes to the `notifications` table filtered by `user_id`. When a new notification arrives, the bell badge updates without reload.
- The dashboard subscribes to `notifications`, `approvals`, and `documents`. When any of these change, the dashboard re-fetches its data and updates.

A critical property: **Realtime respects RLS**. The websocket layer evaluates each row against the SELECT policies before delivering the event. So a malicious client cannot subscribe to changes for documents they're not entitled to see — even if they spoof the filter.

The schema migration to enable Realtime on a table is just:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
```

Postgres `PUBLICATION` is the mechanism that controls which tables emit replication events. Adding a table to the `supabase_realtime` publication makes its changes available to the Realtime broadcaster.

## 2.3 AI layer: OpenAI API, pdf-parse, structured outputs

### What is an LLM?

A **Large Language Model** is a type of neural network trained on enormous amounts of text. It learns statistical patterns in language: given a sequence of tokens (rough chunks of words), it predicts the next token. Run that prediction in a loop, and you get text generation.

Modern LLMs like GPT-4, Claude, Gemini, and Llama 3 are based on the **transformer** architecture (the "T" in "GPT" — Generative Pre-trained Transformer). They have billions or trillions of parameters and have been trained on essentially the entire public internet plus curated datasets.

The key capabilities relevant to this project:

- **Summarization.** Given a long document, produce a concise summary.
- **Information extraction.** Given text, identify specific elements (key points, risk warnings, named entities).
- **Question answering.** Given a document and a question, produce an answer grounded in the document.
- **Multimodal understanding.** Some models accept images or PDFs directly and can "read" them.

LLMs are not databases — they don't know facts beyond their training data. They're not deterministic — the same prompt can produce different outputs. They can "hallucinate" — confidently produce plausible-sounding text that's factually wrong. The application has to design around these properties.

### What is the OpenAI API?

OpenAI is the company that makes ChatGPT. They expose their language models as a paid HTTP API. You send a JSON payload describing what you want; they respond with the generated text and metadata (tokens used, model version).

The API endpoints used in this project:

- **Chat Completions** (`/v1/chat/completions`) — the main endpoint. Send a system prompt + user message + parameters, get a generated response.
- **Files** (`/v1/files`) — upload a file (PDF or image) to OpenAI's servers and get back a file ID. That ID can then be referenced in subsequent Chat Completions calls.

The project uses the official `openai` npm package (a TypeScript client) to call these endpoints from server-side code only. The API key is in the `OPENAI_API_KEY` environment variable, server-only — it never leaves the Next.js server.

### What is gpt-5.4-mini?

`gpt-5.4-mini` is the specific OpenAI model this project uses by default. It's a smaller, faster, cheaper variant of the gpt-5.4 family — well-suited for tasks that don't need the largest model's capability.

Why not the largest model? Cost and latency. The largest models charge significantly more per token and take longer to respond. For summarization of 10-page documents, gpt-5.4-mini produces structurally correct, high-quality summaries at a fraction of the cost.

The model identifier is stored in the `OPENAI_MODEL` environment variable, so swapping models is a one-config change without code modification.

### What are structured outputs (JSON schemas)?

This is the most important AI feature the project uses.

By default, LLM responses are free-form text. If you ask for a summary, you might get a paragraph, a bulleted list, or something with headings — it's non-deterministic. For a programmatic system that needs to *parse* the response and put specific fields into the UI, this is fragile.

OpenAI's **structured outputs** feature solves this. You provide a JSON schema describing the exact shape you want, like:

```json
{
  "type": "object",
  "properties": {
    "summary": { "type": "string" },
    "key_points": { "type": "array", "items": { "type": "string" } },
    "risk_notes": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["summary", "key_points", "risk_notes"]
}
```

The model is constrained to return JSON matching that schema. No prose. No bullet markers. Just a valid JSON object with the three fields, every time.

The application parses the JSON directly and renders the three fields into the AI Workspace UI: a paragraph summary, a bulleted list of key points, a bulleted list of risk notes. There's no string matching, no regex, no fallback parsing — the data shape is guaranteed.

This is why the report calls structured outputs the single most valuable technique for AI reliability.

### What is pdf-parse?

`pdf-parse` is a Node.js library that extracts text from PDF files. It's a thin wrapper around `pdfjs-dist` (the same library that powers the PDF viewer in the browser) but configured to run server-side.

You give it a `Buffer` containing the PDF bytes, it returns an object with the text content of every page concatenated as a single string, plus metadata like page count.

This project uses pdf-parse as the **first step** of the AI pipeline. Before sending anything to OpenAI, the server extracts the text layer using pdf-parse. If the text is reasonable (≥ 100 characters), it's used directly. If not, the system falls back to OCR.

### What is OCR? What's the multimodal vision model fallback?

**OCR (Optical Character Recognition)** is the process of extracting text from images of text. Scanned documents — old contracts, paper forms photographed with a phone — are images embedded in a PDF, not text. pdf-parse returns essentially nothing for these files because there's no text layer to extract.

For OCR, this project doesn't use a dedicated OCR engine like Tesseract. Instead, it uses OpenAI's **multimodal model**, which can read images and PDFs directly. The workflow:

1. Server detects pdf-parse returned < 100 characters.
2. Server uploads the PDF buffer to OpenAI's Files API.
3. Server calls Chat Completions with the file ID attached and a prompt asking for the text content.
4. The model "reads" the PDF visually (page by page) and returns the extracted text.
5. The extracted text is then used as input for the summary and Q&A endpoints.

The trade-off: this is slower and more expensive than dedicated OCR. To control cost, the system caps OCR to PDFs of 10 pages or fewer. Larger scanned PDFs return HTTP 413 (Payload Too Large) with a message asking the user to split the document.

The pipeline is logged: each call records its path (`text_layer` or `ocr_vision`) in `audit_logs.metadata`, so administrators can see which documents went through which route.

## 2.4 Cryptography layer: SHA-256, WebAuthn, TPM, ECDSA P-256

This is the most technically dense section. Take your time.

### What is SHA-256?

**SHA-256** (Secure Hash Algorithm, 256-bit output) is a **cryptographic hash function**. It takes input of any length and produces a fixed 256-bit (32-byte, or 64 hexadecimal characters) output called the **hash** or **digest**.

Three properties make it useful:

1. **Deterministic.** The same input always produces the same hash.
2. **Avalanche.** Changing even one bit of input changes ~50% of the bits of the output. There's no way to "predict" what small change to the input would produce.
3. **One-way.** Given a hash, there's no efficient algorithm to recover the input. You can verify whether a candidate input matches a given hash, but you can't reverse-engineer the input from the hash.

This is the foundation of file integrity. If you compute the SHA-256 hash of a file, store it, and later compute the hash again, you can verify the file hasn't changed — without storing the file itself.

In this project, SHA-256 is used in several places:
- The `content_hash` column on `document_versions` stores the SHA-256 of each file version.
- The `approved_hash` column on `documents` stores the hash at the moment all reviewers approved.
- The `signature_hash` column on `document_signatures` stores the hash that was signed in each WebAuthn signing event.
- The Verify Integrity button recomputes the hash of the current file and compares it against all stored hashes.

### What is a digital signature?

A digital signature is a cryptographic construct that proves two things simultaneously:

1. **Authenticity**: a specific person (or device, or key) produced this signature.
2. **Integrity**: the data being signed hasn't been altered.

Unlike a handwritten signature (which can be photocopied) or a stamp (which can be stolen), a digital signature is mathematically tied to both a specific private key and a specific piece of data. Change either the key or the data, and the signature no longer verifies.

The math is based on **asymmetric (public-key) cryptography**.

### What is public-key cryptography?

A **keypair** is two mathematically related keys: a **private key** and a **public key**. They have a specific property: data encrypted with the private key can be decrypted only with the public key (and vice versa). But you cannot derive the private key from the public key, even though they're related.

For signing:
1. The signer holds the private key (and tells no one).
2. To produce a signature, the signer applies a signing algorithm to (data + private key), producing a signature bytes.
3. To verify, anyone with the public key can apply a verification algorithm to (data + signature + public key), getting back a yes/no answer.

If the answer is yes, two things are proven: the data is unchanged since signing, and the signature was produced by someone who holds the corresponding private key.

The signer's identity is bound to the public key through some registration process — in this project, when the user first sets up WebAuthn signing, the application stores their public key in the database and labels it with their user account.

### What is ECDSA P-256?

**ECDSA** stands for *Elliptic Curve Digital Signature Algorithm*. It's a specific signing algorithm based on elliptic curve cryptography (a kind of math involving points on curves over finite fields). ECDSA produces small signatures (about 64 bytes) and uses small keys (about 32 bytes) while being cryptographically very strong.

**P-256** specifies which elliptic curve to use. P-256 (also called secp256r1 or prime256v1) is a curve standardized by NIST. It provides about 128 bits of security — far beyond what's currently breakable.

In this project, every WebAuthn signature is an ECDSA P-256 signature. This is the algorithm Windows Hello, Touch ID, and Android biometric authenticators all support natively.

### What is the WebAuthn / FIDO2 standard?

**WebAuthn** (Web Authentication API) is a W3C standard that defines a browser API for cryptographic authentication. **FIDO2** is the broader specification suite that includes WebAuthn plus the CTAP protocol for talking to external authenticators (like YubiKeys).

The standard solves a specific problem: how can a website let the user prove their identity using a hardware-bound cryptographic key, without passwords?

The browser API has two main calls:

- **`navigator.credentials.create()`** — registers a new keypair. The authenticator (the hardware) generates a new private/public keypair, stores the private key internally, and returns the public key + some metadata to the browser, which the browser sends to the server. This happens once per device per account.

- **`navigator.credentials.get()`** — produces a signature. The server sends a challenge (a random value, or in this project, a file hash). The authenticator prompts the user for biometric/PIN, then uses the private key to sign the challenge. The browser receives the signature + auxiliary data and sends them to the server, which verifies the signature against the stored public key.

WebAuthn is what powers "passkeys" — the password-free login feature you've seen in Apple's iCloud, Google accounts, GitHub, etc. The same standard is used here, but for document signing instead of just login.

### What is a TPM?

**TPM** stands for *Trusted Platform Module*. It's a dedicated cryptographic chip on the device's motherboard (or, on newer hardware, integrated into the CPU). The TPM has a few specific properties:

1. **It can generate keypairs internally.** When asked to make a new key, it generates the private+public pair inside its own silicon. The private key never leaves the chip.
2. **It can sign data.** The TPM accepts a signing request, performs the signing using its internal key, and returns the signature. The private key is *not* exposed.
3. **It can require user-verification.** Before signing, the TPM can be configured to require a PIN, fingerprint, or face recognition from the user. This is what Windows Hello uses.
4. **It is tamper-resistant.** Physically extracting a key from a TPM is extremely difficult, often involving microscopes and acid.

On Macs, the equivalent is the **Secure Enclave** — a separate chip in Apple Silicon that does the same job. On Android, it's the **Trusted Execution Environment (TEE)** or **StrongBox**.

In this project, the TPM/Secure Enclave is where the user's WebAuthn private key lives. Every signing event:

1. Application asks the browser to sign data with the user's WebAuthn credential.
2. Browser asks the operating system, which asks the TPM.
3. TPM asks the user to verify (PIN, fingerprint, face).
4. TPM signs the data with the private key (which never leaves the chip).
5. TPM returns the signature to the OS, which returns it to the browser, which sends it to the server.

The critical security property: **even a malicious user with full root access to their own device cannot extract the private key**. They could *use* it (with biometric/PIN), but they can't copy it to another device or to a server.

### What is the COSE format?

**COSE** (CBOR Object Signing and Encryption) is a binary format for representing cryptographic data, used by WebAuthn. The public key returned during registration is encoded in COSE format — it's a CBOR-encoded structure containing the algorithm identifier and the key bytes.

The server stores this COSE-encoded public key in the `profiles.webauthn_public_key` column — base64-encoded as `text`, not a raw binary column. When verifying signatures later, the `@simplewebauthn/server` library decodes the COSE structure and uses the algorithm + key bytes to verify the signature.

### What is the AAGUID?

**AAGUID** stands for *Authenticator Attestation GUID*. It's a 128-bit identifier (UUID) that uniquely identifies the *model* of authenticator that produced a credential. For example:

- Windows Hello on a TPM-backed PC has a specific AAGUID.
- Touch ID on macOS has a different AAGUID.
- A YubiKey 5 has its own AAGUID.

The AAGUID is returned in the `authenticatorData` of every WebAuthn registration response. The server stores it in `profiles.webauthn_aaguid`.

When displaying the certificate page, the application looks up the AAGUID in a small registry (`lib/webauthn/aaguid-registry.ts`) to produce a friendly name like *"Windows Hello (Hardware, TPM)"* or *"Touch ID (Apple)"*. This lets viewers see what kind of authenticator produced each signature.

### What is the sign counter?

Every time an authenticator signs something, it can optionally increment an internal counter and include it in the response. The server stores this counter for each user.

On the next signing event, the server checks that the new counter is *greater than* the stored one. If it's less than or equal, that's evidence the authenticator was cloned — someone produced a signature with a counter value the server has already seen, suggesting the credential is being used from two devices simultaneously.

This is replay protection. It doesn't catch all clone attacks (an attacker that just resets the counter could fool a naive verifier), but it raises the bar and is a standard WebAuthn defense.

### What is non-repudiation?

Non-repudiation is a property of cryptographic systems: the ability to prove someone took an action even if they later deny it.

For document signing, non-repudiation means: if the signature verifies under user X's public key, X cannot credibly claim "I didn't sign that." Three things contribute:

1. **The private key is hardware-bound.** It exists in only one place — the user's TPM. So if a signature verifies under X's public key, only someone with X's device could have produced it.
2. **User-verification was required.** The TPM required a PIN or biometric, so it wasn't enough to just have the device unlocked.
3. **The public key was registered through a Windows Hello ceremony.** The binding between user account and public key was itself attested by a Hello prompt at registration time.

Together, these three properties make it computationally and operationally implausible for a signature to be forged.

## 2.5 Infrastructure: Vercel, Brevo, environment variables

### What is Vercel?

Vercel is a hosting platform built by the company that makes Next.js. It's optimized for Next.js applications.

When you push code to your GitHub repository, Vercel automatically:

1. Builds the Next.js application.
2. Deploys it to a global edge network.
3. Issues an HTTPS certificate.
4. Provides a deployment URL.

Server components and API routes run as **serverless functions** — short-lived containers that spin up on demand to handle a request and shut down afterward. This is cheaper than running a constantly-on server, and scales automatically with traffic.

Static assets (images, the JavaScript bundle, the PDF worker file) are served from a CDN (Content Delivery Network) — copies of the files distributed across many servers worldwide, so the user downloads from a nearby location.

The trade-off: serverless functions have a **cold start** when they haven't been invoked recently. The first request after idle takes 100–300ms longer because the container has to spin up. Subsequent requests within ~10 minutes reuse the warm container.

### What is Brevo?

Brevo (formerly Sendinblue) is a **transactional email service**. Your application sends API requests to Brevo, which then sends emails to your users on your behalf.

Why not just use Node's built-in SMTP? Because actually delivering email to inboxes is hard:

- Gmail, Outlook, Yahoo, and others have spam filters that block email from servers without good reputation.
- You need SPF, DKIM, and DMARC DNS records to authenticate as a sender.
- You need IP warming, bounce handling, complaint feedback loops.

Brevo handles all of this. You send an HTTP POST with sender, recipient, subject, body. They handle delivery and reputation.

This project's `lib/email.ts` calls Brevo's REST API directly (without using their SDK, to keep dependencies small). Eight email types are defined, one per notification event (review assigned, approved, rejected, etc.). Each sender resolves the recipient's email through Supabase Auth (which has email-by-user-id lookup), formats an HTML body with a deep link, and posts to Brevo.

Emails are **best-effort**: a missing API key, a network error, or a Brevo outage logs a warning but doesn't fail the request. The in-app notification (which is in the database) is the source of truth.

### Environment variables

Environment variables are key-value pairs that the operating system makes available to running processes. They're the standard way to pass configuration and secrets to applications without putting them in code.

This project uses:

- `NEXT_PUBLIC_SUPABASE_URL` — the Supabase project URL. The `NEXT_PUBLIC_` prefix means this is *exposed to the browser*. URLs are not secrets.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the anon-key for the Supabase client. Also exposed to the browser. It's safe because it only allows what RLS policies allow.
- `SUPABASE_SERVICE_ROLE_KEY` — the service-role key. **Server-only** (no `NEXT_PUBLIC_` prefix). This key bypasses RLS, so it must never reach the browser.
- `OPENAI_API_KEY` — server-only. Charges to whichever account owns it.
- `OPENAI_MODEL` — the model identifier (default `gpt-5.4-mini`).
- `OPENAI_OCR_MODEL` — optional override for the OCR path.
- `BREVO_API_KEY` — server-only.
- `BREVO_FROM_EMAIL` — the verified sender address.
- `BREVO_FROM_NAME` — the display name.
- `NEXT_PUBLIC_APP_URL` — the public URL, used for building deep links in emails.

Locally, these live in `.env.local` (which is git-ignored — never committed to the repository). On Vercel, they're set in the project settings.

The principle: **secrets are environment variables, never hardcoded in source**. This means the source code can be public without exposing keys, and rotating a key is one environment variable change.

---

# Part 3 — The Database Schema

## 3.1 The ten tables and what each one stores

> Nine tables model the core domain; a tenth, `document_ai_messages`, is an auxiliary AI question/answer log. The report's Table 3.1 lists all ten.

### profiles

Stores per-user information that extends Supabase's built-in `auth.users` table. The `auth.users` table holds the authentication credentials (email, password hash); `profiles` holds everything else about the user.

Columns:
- `id` (UUID, primary key, foreign key to `auth.users.id`)
- `full_name` (text)
- `role` (text, one of `employee` / `reviewer` / `admin`)
- `status` (text, one of `pending` / `approved` / `rejected` — the admin gate)
- `created_at` (timestamp)

WebAuthn columns (populated when the user sets up signing). Note: the binary WebAuthn values are stored **base64/base64url-encoded as `text`**, not as raw `bytea` — this keeps them easy to pass through JSON APIs and the `@simplewebauthn` libraries, which decode them on demand:
- `webauthn_credential_id` (text, base64url credential id)
- `webauthn_public_key` (text, base64-encoded COSE key)
- `webauthn_counter` (integer)
- `webauthn_aaguid` (text — the AAGUID string, resolved to a friendly name via `lib/webauthn/aaguid-registry.ts`)
- `webauthn_device_type` (text — `singleDevice` or `multiDevice`)
- `webauthn_transports` (jsonb, e.g. `["internal"]`)
- `webauthn_registered_at` (timestamp)

When a new user signs up, Supabase Auth's `handle_new_user` trigger automatically creates a `profiles` row with `status = 'pending'`. The admin then approves or rejects via `/admin/users`.

### documents

The central table — one row per document.

Columns:
- `id` (UUID, primary key)
- `owner_id` (UUID, foreign key to profiles.id, not null, never changes)
- `title` (text)
- `description` (text)
- `status` (text, one of `draft` / `pending` / `approved` / `rejected`)
- `approved_hash` (text, nullable) — SHA-256 of the file at the moment of approval, used as a backup integrity record
- `created_at`, `updated_at` (timestamps)

The `owner_id` is set on creation and never changes — this reflects the rule that ownership doesn't transfer.

### document_versions

Every version of every document. When the owner uploads a new version, a new row is inserted; the old version is preserved.

Columns:
- `id` (UUID, primary key)
- `document_id` (foreign key to documents.id, cascading delete)
- `created_by` (foreign key to profiles.id, the uploader — usually the owner)
- `version_no` (integer, starting at 1)
- `file_path` (text, the path in Supabase Storage)
- `content_text` (text, the extracted text — populated by the AI pipeline)
- `content_hash` (text, SHA-256 — lazily populated on first signing or verification)
- `created_at` (timestamp)

(There is no `file_size` column — file size is validated transiently during upload but not stored.)

### approvals

Records each reviewer's decision in each review round.

Columns:
- `id` (UUID, primary key)
- `document_id` (foreign key to documents.id)
- `reviewer_id` (foreign key to profiles.id)
- `round_no` (integer)
- `status` (text, one of `pending` / `approved` / `rejected`)
- `comment` (text, required when rejecting)
- `due_at` (timestamp, nullable, the deadline)
- `last_reminded_at` (timestamp, nullable, when the overdue reminder last fired)
- `created_at`, `reviewed_at` (timestamps)

A composite unique constraint on `(document_id, reviewer_id, round_no)` prevents the same reviewer from being assigned twice in the same round.

### document_highlights

Passage-level comments on a specific version of a document.

Columns:
- `id` (UUID, primary key)
- `document_id` (foreign key to documents.id)
- `document_version_id` (foreign key to document_versions.id) — highlights are version-scoped
- `reviewer_id` (foreign key to profiles.id)
- `page_number` (integer, ≥ 1)
- `selected_text` (text)
- `comment` (text)
- `bounding_rects` (JSONB) — an array of `{x, y, width, height, pageWidth, pageHeight}` rectangles in page-relative percentages
- `created_at` (timestamp)

The percentages let highlights remain correctly positioned across changes in zoom level or screen size.

### document_signatures

One row per signing event. The signing log.

Columns (the WebAuthn assertion fields are stored as `text`, base64url-encoded — not `bytea`):
- `id` (UUID, primary key)
- `document_id` (foreign key to documents.id)
- `signer_id` (foreign key to profiles.id)
- `signature_role` (text, one of `owner_submission` / `reviewer_approval`; NULL on legacy hash-only rows)
- `round_no` (integer)
- `signature_hash` (text, SHA-256 of the file at signing time — this is the WebAuthn challenge)
- `signature_bytes` (text, the raw signature, base64url)
- `authenticator_data` (text, base64url)
- `client_data_json` (text)
- `credential_id` (text)
- `algorithm` (text — `WebAuthn-ES256` for new rows)
- `signed_at` (timestamp)

(There is no `document_version_id` on this table — a signature is tied to a document + round + the file hash at signing time, not to a version row. Legacy pre-WebAuthn rows may have only `signature_hash` populated.)

When the Verify Integrity check runs, it reads every signature for the document, reconstructs the WebAuthn challenge from `client_data_json`, and verifies the signature against the signer's stored public key.

### document_ai_results

Caches the AI-generated content for each document. The most recent row for a document is what's displayed.

Columns:
- `id` (UUID, primary key)
- `document_id` (foreign key to documents.id)
- `user_id` (foreign key to profiles.id, who triggered the generation)
- `summary` (text)
- `key_points` (text, joined with newlines)
- `risk_notes` (text, joined with newlines)
- `created_at` (timestamp)

### notifications

In-app notification entries. Each notification is for one user.

Columns:
- `id` (UUID, primary key)
- `user_id` (foreign key to profiles.id, the recipient)
- `document_id` (foreign key to documents.id, nullable)
- `type` (text, one of: `review_assigned`, `document_approved`, `document_rejected`, `review_progress`, `review_overdue`, `account_approved`, `account_rejected`, `new_user_registered`)
- `title` (text)
- `message` (text)
- `is_read` (boolean, default false)
- `created_at` (timestamp)

### audit_logs

Append-only log of significant actions.

Columns:
- `id` (UUID, primary key)
- `user_id` (foreign key to profiles.id, the actor)
- `action` (text, the action code — the real ones the code emits include `SUBMIT_FOR_REVIEW`, `APPROVE_DOCUMENT`, `REJECT_DOCUMENT`, `GENERATE_AI_SUMMARY`, `ASK_DOCUMENT_AI`, `DELETE_DRAFT_DOCUMENT`, `ADMIN_CHANGE_USER_STATUS`, `ADMIN_DELETE_DOCUMENT`)
- `target_id` (UUID, nullable, generic reference)
- `target_table` (text, nullable, which table target_id refers to)
- `metadata` (JSONB, action-specific details)
- `created_at` (timestamp)

The generic `target_id` + `target_table` lets one log row reference any entity in the system without requiring a separate foreign key column per table.

## 3.2 Foreign keys and relationships

The schema centers on two hub tables: `profiles` and `documents`.

`profiles` is referenced by almost every other table — as document owner in `documents`, as reviewer in `approvals` and `document_highlights`, as signer in `document_signatures`, as recipient in `notifications`, as actor in `audit_logs`.

`documents` cascades down to `document_versions`, `approvals`, `document_highlights`, `document_signatures`, `document_ai_results`, and (via document_id) `notifications` and `audit_logs`. Deleting a document deletes all dependent rows — this is enforced by `ON DELETE CASCADE`.

## 3.3 Why this schema (design decisions)

**Why separate `documents` and `document_versions`?** Because a document has a single identity (title, owner, status) but many versions (different uploaded files over time). Keeping them in one table would require duplicating the document metadata per version.

**Why is signing data on `profiles` instead of a separate `webauthn_credentials` table?** Because each user currently has exactly one credential. If multi-device support is added (it's in §8.2.2 future work), splitting into a separate table becomes appropriate. Designing for the simple case first is correct scope discipline.

**Why JSONB for `bounding_rects` and `metadata`?** Because the shape varies and isn't worth querying SQL-style. JSONB is Postgres's binary JSON type — it's queryable but flexible. For data that's stored and retrieved as a unit, JSONB is the right choice.

**Why store `content_hash` and `approved_hash` separately?** Defense in depth. `content_hash` is the cached SHA-256 of each version, used for signing operations. `approved_hash` is a snapshot at approval time stored on the documents row — a redundant integrity record. If one is tampered with, the other still proves the original state.

---

# Part 4 — The Security Architecture

## 4.1 Role-Based Access Control (RBAC)

RBAC means: users are assigned **roles**, and permissions are granted to roles, not directly to individual users. Three roles in this project:

- **employee** — can create, upload, submit, view their own documents, use the AI assistant on their documents.
- **reviewer** — can be assigned to review documents, approve or reject with comments, leave passage highlights, use the AI on assigned documents. A reviewer may also create their own documents (they have the employee permissions as a superset). In practice, this project gives each user one role, but the system supports the role being either.
- **admin** — system-wide access. Manages users (approve/reject accounts, change roles), oversees all documents, browses audit logs.

The role is stored in `profiles.role` and enforced via the `requireRole(['admin'])` helper at the top of every protected page or API route.

## 4.2 Row-Level Security (RLS) in depth

This is the database-level enforcement that complements RBAC.

### How RLS works mechanically

When you mark a table with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, Postgres starts checking policies on every query. By default, with RLS enabled but no policies defined, the table is invisible — no rows are returned to anyone.

You then define policies for specific operations (SELECT, INSERT, UPDATE, DELETE) and specific roles. A policy is a SQL expression that must evaluate to `TRUE` for the operation to be allowed on a given row.

For SELECT, the policy filters which rows are returned. For UPDATE, it filters which rows can be modified (using `USING (...)`) and what values can be assigned (using `WITH CHECK (...)`). For INSERT, it filters what values can be inserted. For DELETE, what rows can be removed.

### The documents SELECT policy

```sql
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
```

The role `TO authenticated` means this policy applies to authenticated users (anyone with a valid JWT). The `USING` clause is the predicate. `auth.uid()` is a Supabase-provided function that returns the current user's UUID, extracted from the JWT.

Three conditions, OR'd:
1. The user owns the document.
2. The user has an approvals row for the document (any round, any status — they were once assigned).
3. The user is an admin.

If none of these is true, the row is not returned.

### The document_versions SELECT policy

```sql
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

This looks permissive — `EXISTS` against `documents`. But because the documents SELECT policy is already in effect, that EXISTS only returns rows the user can see. So the version is visible only if the parent document is visible. Visibility cascades.

### Why write policies that look permissive

It's tempting to write the document_versions policy with explicit ownership checks, but that would duplicate the logic from documents. Inheriting via EXISTS keeps the rule in one place. If you change the documents policy, the versions policy automatically reflects the change.

### Why INSERT/UPDATE/DELETE policies are mostly missing

For most tables in this project, INSERT/UPDATE/DELETE through the anon-key client is **not allowed at all**. Writes happen only through API routes that use the service-role client. This is enforced by simply not creating INSERT/UPDATE/DELETE policies (or creating ones that always evaluate to false).

The exception is `document_highlights`, where authenticated users can INSERT their own highlights and DELETE their own highlights — these policies exist.

This split — declarative SELECT policies, imperative server-mediated writes — yields a clear and auditable security model.

## 4.3 The two-client pattern (anon-key vs service-role)

The server-side code has two ways to talk to Supabase, distinguished by which API key they use.

### The anon-key client

Created with the publishable `NEXT_PUBLIC_SUPABASE_ANON_KEY`. When used inside a server component (where a JWT cookie is present), the client passes that JWT to Supabase, and the database evaluates RLS policies as the authenticated user.

Effectively: queries through the anon-key client see only what the user is allowed to see.

This is what `lib/supabase/server.ts` exports. Every server component that reads data uses this client. The user's identity is automatically threaded through.

### The service-role client

Created with the secret `SUPABASE_SERVICE_ROLE_KEY`. This bypasses RLS entirely — queries return all rows regardless of policy.

This is what `lib/supabase/admin.ts` exports. It's only used inside API routes for privileged writes: inserting documents, updating approvals, sending notifications, processing admin actions. Each route that uses this client first calls `requireUser()` or `requireRole()` to verify the caller is authorized, then performs the write.

The principle: **the database protects against unauthorized reads via RLS; the application protects against unauthorized writes via explicit role checks before service-role operations**.

If you understand this pattern, you understand the security architecture.

## 4.4 JWT cookies and session security

When a user signs in, Supabase Auth issues a **JSON Web Token (JWT)** and the application stores it as an HTTP cookie.

### What is a JWT?

A JWT is a base64-encoded string with three parts separated by dots: `header.payload.signature`.

The **header** says what algorithm was used to sign it. The **payload** is a JSON object with claims like the user's UUID (`sub`), role (`role`), email, and expiration time (`exp`). The **signature** is a cryptographic signature over the header + payload, computed with Supabase's secret key.

Anyone who has the JWT and the secret can verify it's authentic and unaltered. The JWT itself doesn't need to be encrypted — it's signed, not secret. (However, possession of the JWT lets you act as the user, so it should be protected in transit.)

### What does HTTP-only mean?

The cookie is marked `HttpOnly`, which means JavaScript in the browser **cannot read it**. Only the browser itself can send it back to the server on subsequent requests.

This is the primary defense against **XSS-based session theft**. If an attacker successfully injected JavaScript into a page (which the project tries hard to prevent — see §4.5), they could not read the JWT cookie and steal the session. They could trigger requests as the user (the browser would attach the cookie), but they couldn't take the session to another machine.

### Why this matters

A traditional session cookie that's readable by JavaScript can be exfiltrated by any XSS. With HttpOnly + Secure + SameSite=Lax, the cookie is much harder to abuse. The combination is the modern standard for session security.

## 4.5 Defenses against specific attacks

### SQL injection

The Supabase client uses parameterized queries. When you write `.eq('id', userInput)`, the user input is bound as a parameter, not concatenated into SQL. So a value like `'; DROP TABLE--` is treated as a literal string and matched against the column — never interpreted as SQL.

Tested case: the admin search box accepts a search term that's used in `.ilike('title', `%${query}%`)`. The Supabase client parameterizes this — verified by passing `'; DROP TABLE--` and observing no SQL execution, just a literal match attempt.

### XSS (Cross-Site Scripting)

React escapes content by default. Anything rendered as `{user.name}` in JSX is HTML-encoded before being inserted into the DOM. The only way to render unescaped HTML is `dangerouslySetInnerHTML`, which is not used anywhere in this project.

The PDF viewer renders documents through `react-pdf`, which itself uses pdfjs — both have a long history of being audited for safety. They render to a canvas, not as HTML.

The AI-generated summary, key points, and risk notes are rendered as text inside styled containers. There's no HTML interpretation.

### CSRF (Cross-Site Request Forgery)

The Supabase Auth JWT cookie is set with `SameSite=Lax`, which blocks the cookie from being sent on cross-site POST requests. Combined with the application's CORS configuration (only same-origin requests are allowed), this prevents a malicious website from triggering authenticated actions as the user.

Additionally, every mutating API route verifies the caller's identity via `requireUser()` and checks the request body matches an authorized action. So even if a CSRF attempt got through, the route-level checks would reject it.

### File upload attacks

The staging-then-validate pipeline (described in detail in §5.2) ensures that no malformed file reaches the main storage area. The server uses an HTTP Range request (`bytes=0-7`) to download only the first few bytes of the staged file and verifies it begins with `%PDF-` (the PDF magic bytes, first 5 bytes). Files that fail are deleted; the request returns 400.

Path traversal is prevented because the file path is constructed server-side as `${user.id}/${document.id}/${timestamp}-${sanitized_name}`. The user-provided filename is sanitized to remove `/`, `..`, and special characters before being included.

### Admin account compromise

If an admin account is compromised, the attacker can:
- Read all documents (admins have unrestricted SELECT through their role).
- Delete documents (admin DELETE endpoint).
- Change user roles (admin endpoint).
- Approve / reject accounts (admin endpoint).

They **cannot**:
- Forge WebAuthn signatures. The private keys are in users' TPMs, not on the server. The admin can read public keys but not produce valid signatures under another user's key.
- Modify the audit logs without leaving a trace (the audit log records every admin action with actor + timestamp + target).

The mitigation for production would be: separation of duties (no single admin has both write access and audit-log access), log shipping to an external append-only store, multi-factor authentication for admin accounts, periodic audit log review.

---

# Part 5 — Every Feature, In Depth

## 5.1 Registration and admin approval

### The flow

1. **User visits `/register`.** They enter email, password, and full name.
2. **Client calls `supabase.auth.signUp()`.** Supabase Auth creates a row in `auth.users` with the hashed password.
3. **Database trigger fires.** A trigger called `handle_new_user` on `auth.users` automatically creates a corresponding `profiles` row with `status = 'pending'` and `role = 'employee'`.
4. **Client fires `POST /api/auth/register-notify`** with the new user's ID. This is fire-and-forget.
5. **Server validates the request.** It checks that the referenced profile was created within the previous 5 minutes and is still `status = 'pending'`. This is an anti-abuse window — outside it, the route is a no-op.
6. **Server fans out to admins.** It queries all profiles with `role = 'admin' AND status = 'approved'` and inserts a `new_user_registered` notification + sends an email for each.
7. **Client redirects to `/account-status`.** This page shows a "pending approval" message and a sign-out button.
8. **Admin sees the new user.** The `/admin/users` page sorts pending accounts to the top with a banner "X pending approvals". Each row has Approve / Reject buttons.
9. **Admin clicks Approve.** Client calls `PATCH /api/admin/users/[id]/status` with `{status: 'approved'}`. The server uses the service-role client to update the profiles row, inserts an audit log entry, inserts an `account_approved` notification for the user, and sends them a welcome email.
10. **User can now sign in.** On next attempt, `requireUser()` sees `status = 'approved'` and lets them through to `/dashboard`.

### Why this gate exists

Without admin approval, anyone could sign up and immediately access the system. For a graduation project that might be deployed for a small organization (a university department, an SME), the admin needs to control who has accounts. The pending state is a friction step that prevents abuse and gives admins explicit control.

### The grandfathering migration

When the `status` column was added to an existing database (during development), every existing profile was set to `approved` via `UPDATE profiles SET status = 'approved' WHERE status = 'pending'`. Otherwise, the migration would have locked out everyone including admins.

## 5.2 The document upload pipeline

This is the most carefully engineered pipeline in the project. Read every step.

### The challenge

Users upload files from their browser. The application needs to validate that the file is a real PDF (not an executable in disguise, not too large, not malicious). But downloading the entire file twice (once to the user's storage, once to the server for validation) is wasteful for 10MB files.

### The pattern: staging-then-validate

**Step 1 — Client preflight.** The browser checks:
- File extension is `.pdf` (or MIME type is `application/pdf`).
- File size is ≤ 10MB.

If either fails, the upload is rejected immediately with a friendly error, without consuming server resources.

**Step 2 — Client uploads to staging.** The file is uploaded directly to Supabase Storage at a path like `${user.id}/_staging/${uuid}/${safeName}`. The `_staging/` prefix marks it as not-yet-validated.

This upload uses the Supabase client's `upload()` method. The browser talks directly to Supabase Storage, not through the Next.js server, which saves bandwidth.

**Step 3 — Client POSTs to the server.** The browser sends `POST /api/documents` (for a new document) or `POST /api/documents/[id]/versions` (for a new version) with a JSON body containing:
- The staging path.
- The document title, description (for new documents).

**Step 4 — Server validates with HTTP Range.** The server calls `lib/pdf-validation.ts` which:
- Generates a signed URL for the staging file (valid for 60 seconds).
- Issues an HTTP Range request: `GET <signed-url>` with header `Range: bytes=0-7`. This downloads only the first 8 bytes.
- Reads the total file size from the `Content-Range` response header (the `/<total>` part) and verifies it is within the 10MB limit.
- Checks the first 5 bytes match `%PDF-` (the PDF magic number).

**Step 5a — Validation fails.** The server:
- Deletes the staging object via the Supabase service-role client.
- Returns HTTP 400 with a descriptive error message.

**Step 5b — Validation succeeds.** The server:
- Moves the file from staging to its final path: `${user.id}/${document.id}/${timestamp}-${sanitized_name}`. This is done by `move()` operation in Supabase Storage, which is essentially a rename.
- Inserts the corresponding row in `documents` or `document_versions` using the service-role client.
- Returns the document or version ID.

**Step 6 — Client confirms.** Browser receives the success response and navigates to the document detail page.

### Why this design is secure

The anon-key client used in the browser has **no permission** to insert directly into `documents` or `document_versions`. RLS doesn't allow it. So even if a malicious client uploads a non-PDF file with a fake `.pdf` extension to the staging area, they cannot create a database row that references it. The only way to create a document row is through the server-side route, and that route only succeeds if the file passes magic-byte validation.

This means: even if the validation logic had a bug, the worst that could happen is a malformed file sits in the user's staging area until it's eventually cleaned up. There's no way to create an "approved document" record pointing to a non-PDF file.

### Why HTTP Range matters

Downloading 8 bytes vs the full 10MB is a ~million-fold bandwidth savings on every upload. For a busy system, this is significant. The PDF magic number is in the first 5 bytes, and the total size comes from the `Content-Range` header — so there's no reason to download more for validation.

## 5.3 The AI assistant

### What the user sees

On the document detail page, the AI Workspace is a panel showing:
- A "Generate Summary" button.
- Once generated: a paragraph summary, a bulleted list of key points, a bulleted list of risk notes.
- An "Ask a Question" textarea + button.
- Once asked: the question and the AI's answer.

The AI Workspace remounts (loses its state) when a new document version is uploaded — this is enforced by `<AIWorkspace key={latestVersion.id} />`, which makes React unmount and remount the component when the version ID changes. Otherwise, the cached summary from the old version would persist visually after a new version is uploaded.

### The pipeline (when user clicks Generate Summary)

**Step 1 — Client POSTs `/api/documents/[id]/ai-summary`.**

**Step 2 — Server checks authorization.** `requireUser()` plus a check that the caller is allowed to access the document.

**Step 3 — Server loads the latest version.** Fetches the `document_versions` row with the highest `version_no` for this document.

**Step 4 — Server fetches the file from Storage.** Downloads the PDF as a Buffer.

**Step 5 — Server runs the hybrid extraction pipeline.**
- Call `pdf-parse(buffer)` to extract the text layer.
- If the returned text length is ≥ 100 characters, use it. Audit log records `path: 'text_layer'`.
- If the returned text is < 100 characters AND the PDF has ≤ 10 pages, fall back to OCR:
  - Upload the buffer to OpenAI Files API.
  - Call Chat Completions with the file ID and a prompt asking for the text content.
  - Use the returned text. Audit log records `path: 'ocr_vision'`.
- If the PDF has > 10 pages and < 100 chars of text layer, return HTTP 413 with an error message.

**Step 6 — Server truncates the text.** Caps to 12,000 characters. This is the cost-control mechanism — bounded input means bounded token cost.

**Step 7 — Server calls OpenAI with structured output.**
- Constructs the chat completion request with the document text in the user message and a system prompt instructing the model to summarize, extract key points, and identify risks.
- Includes the JSON schema as `response_format: { type: 'json_schema', json_schema: { ... } }`.
- The model returns a JSON object with `{summary, key_points, risk_notes}`.

**Step 8 — Server persists to `document_ai_results`.**
- Inserts a new row with the generated content.
- Inserts an `audit_logs` entry with the model name, token usage, extraction path.

**Step 9 — Server returns the result.** The client receives the JSON and renders it into the UI.

### The Q&A pipeline (when user asks a question)

**Step 1 — Client POSTs `/api/documents/[id]/ai-chat`** with the question (capped to 1000 characters client-side).

**Step 2 — Server loads the cached extracted text** from `document_versions.content_text`. If missing, runs the extraction pipeline first.

**Step 3 — Server constructs a grounded prompt.** Includes the document text + the user's question, with explicit instructions: "Answer based only on the provided document. If the answer isn't in the document, say so."

**Step 4 — Server calls OpenAI** (no structured output — just plain text).

**Step 5 — Server persists and returns the answer.** The question and the model's answer are inserted as a row in the `document_ai_messages` table (giving each document a chronological Q&A history), the call is logged to `audit_logs` with model + token usage, and the answer is returned to the client.

Note: this differs from the summary path, which writes to `document_ai_results`. Summaries are a cached structured artifact (one current summary per document); Q&A is an append-only history (many rows per document). Two tables, two shapes.

### Error mapping

The `lib/openai.ts` wrapper maps OpenAI's errors to specific HTTP status codes that the front-end handles with friendly messages:

- **503**: API key not configured. Message: "AI service is not configured."
- **429**: Rate limited. Message: "AI service is temporarily busy, please try again."
- **402**: Quota exhausted. Message: "AI service quota has been used up."
- **413**: OCR page cap exceeded. Message: "Document is too large for OCR. Please split it."

The application keeps working without AI — workflow, signing, approvals all function normally. AI is augmentation, not core.

## 5.4 The WebAuthn signing system (the centerpiece)

This is the most security-critical and most technically interesting feature. Read it carefully.

### One-time registration (when a user first signs anything)

**Step 1 — The user is about to sign for the first time.** They click "Submit for Review" on a document. The form notices they don't have a WebAuthn credential yet and shows the `SigningKeySetup` modal.

**Step 2 — The modal does a preflight check.** Calls `browserSupportsWebAuthn()` from `@simplewebauthn/browser` — if false, shows "This browser does not support WebAuthn." Then calls `platformAuthenticatorIsAvailable()` — if false, shows "Windows Hello (or equivalent) is not set up on this device" with instructions to enable a PIN in Settings → Accounts → Sign-in options.

**Step 3 — User clicks "Set up with Windows Hello".** Client calls `POST /api/profile/webauthn/register-options`.

**Step 4 — Server generates a registration challenge.**
- Calls `generateRegistrationOptions()` from `@simplewebauthn/server` with:
  - `rpName`: the application name.
  - `rpID`: the deployment domain.
  - `userID`: the user's UUID.
  - `userName`: the user's email.
  - `attestationType`: 'none' (we don't need device attestation).
  - `authenticatorSelection`: `{ authenticatorAttachment: 'platform', userVerification: 'required' }`.
- Returns the options to the client, also storing the expected challenge in a session/cookie so it can be verified later.

**Step 5 — Browser triggers Windows Hello.** Client calls `startRegistration(options)` from `@simplewebauthn/browser`, which calls `navigator.credentials.create()`.
- Windows Hello prompt appears.
- User authenticates with PIN, fingerprint, or face.
- TPM generates a new ECDSA P-256 keypair internally.
- Returns the public key (COSE-encoded), credential ID, AAGUID, and authenticator data.

**Step 6 — Client POSTs `/api/profile/webauthn/register`** with the registration response.

**Step 7 — Server verifies and stores.**
- Calls `verifyRegistrationResponse()` from `@simplewebauthn/server` with the expected challenge, origin, RP-ID.
- If valid, extracts the public key, credential ID, AAGUID, sign counter, device-type from the response.
- Updates the user's `profiles` row with all of this data.
- Returns success.

**Step 8 — UI dismisses the modal.** The user can now sign documents.

### Per-signing event (every subsequent signature)

This happens both when the owner submits and when a reviewer approves.

**Step 1 — User clicks the action button** (Submit for Review, or Approve in the review form).

**Step 2 — Client requests the file hash.** Calls `GET /api/documents/[id]/file-hash`.

**Step 3 — Server returns the cached SHA-256.**
- Reads `document_versions.content_hash` for the latest version.
- If null (first call), computes the hash from the file in Storage and caches it.
- Returns the hex hash.

This caching matters because computing SHA-256 of a 10MB PDF requires downloading the file from Storage and hashing it — about 6 seconds for a typical document. Caching saves this on every subsequent signing/verifying operation.

**Step 4 — Client builds the WebAuthn options itself (no server round-trip).** Unlike registration — which fetches options from `/api/profile/webauthn/register-options` and stores the challenge in an HttpOnly cookie — the *signing* ceremony does **not** call a server `authenticate-options` endpoint. There is no such route. Instead, `lib/webauthn/client.ts` (`signFileHashWithWebAuthn`) constructs the options object on the client:
  - `challenge`: **the file hash** from Step 3, converted hex → base64url. This is the key trick — the challenge *is* the data we're signing, not a random server nonce.
  - `allowCredentials`: the user's stored credential ID with `transports: ["internal"]`.
  - `userVerification: "required"`, `rpId` derived from the current hostname.

  This is safe because the server doesn't *trust* a client-built challenge — at verification time (Step 7) the server independently recomputes the expected challenge from its own cached file hash and rejects the assertion if they don't match. The challenge isn't a secret; it's the file hash, which the server already knows.

**Step 5 — Browser triggers Windows Hello.** Client calls `startAuthentication({ optionsJSON })` from `@simplewebauthn/browser`, which invokes `navigator.credentials.get()`.
- Windows Hello prompt appears.
- User authenticates.
- TPM signs `authenticatorData || SHA-256(clientDataJSON)` with the private key.
- Returns the raw signature bytes, authenticatorData, clientDataJSON.

The clientDataJSON includes the challenge, the origin, and the type. So by signing it, the TPM is effectively signing `challenge || origin || type`. The challenge in clientDataJSON is the file hash, so the signature cryptographically binds the file content to the signing event.

**Step 6 — Client POSTs to the action route** with the WebAuthn assertion + the action payload. For submission: `POST /api/documents/[id]/submit` with `{ reviewerIds, dueInDays, assertion }`. For review decision: `POST /api/approvals/[approvalId]/decide` with `{ status, comment, assertion }`.

**Step 7 — Server verifies the assertion.**
- Loads the user's public key from `profiles`.
- Calls `verifyAuthenticationResponse()` from `@simplewebauthn/server` with:
  - The response from the client.
  - The expected origin.
  - The expected RP-ID.
  - The expected challenge (the file hash).
  - The stored credential (public key + counter).
  - `requireUserVerification: true`.
- The library checks:
  - The challenge inside clientDataJSON matches the file hash.
  - The origin and RP-ID match.
  - The UV flag in authenticatorData is set.
  - The signature is mathematically valid under the public key.
  - The sign counter is greater than the stored value.

**Step 8 — If valid:**
- Update the stored sign counter to the new value.
- Insert a row into `document_signatures` with role (`owner_submission` or `reviewer_approval`), round number, file hash, raw signature, authenticatorData, clientDataJSON.
- Perform the action's state transition (open the round / record the decision).
- Insert notifications, update document status, audit log, etc.

**Step 9 — If invalid:**
- Return HTTP 400 with an error message.
- No state transition occurs.
- No signature is recorded.

This is the critical property: **only on positive signature verification does any state change happen**. A forged or malformed signature has no side effects beyond the failed response.

### The Verify Integrity button

On the document detail page, anyone with access can click Verify Integrity. The button calls `GET /api/documents/[id]/signature/verify`.

The server:
1. Recomputes the SHA-256 of the current file in Storage.
2. Fetches all signatures for the document.
3. For each signature, runs `verifyAuthenticationResponse()` against the signer's public key with the signature's recorded hash as the expected challenge.
4. Returns a result object: `{ currentFileHash, signatures: [{ signerName, role, signedAt, recordedHash, hashMatch, signatureValid }] }`.

The UI displays two judgments per signature:
- **Hash Match / Mismatch**: does the recorded hash equal the current file hash?
- **WebAuthn-ES256 Valid / Invalid**: was the signature cryptographically produced by the signer's key?

The combination is diagnostic. Hash Match + ES256 Valid = untampered, authentic. Hash Mismatch + ES256 Valid = tampering after signing (the file changed but the signature is still cryptographically real). Hash Match + ES256 Invalid = should never happen unless the database was directly modified. Hash Mismatch + ES256 Invalid = both file and signature were tampered.

### The Certificate page

Accessed at `/documents/[id]/certificate`. A printable page that:
- Shows the document title, owner, status.
- Shows each signature with: signer name, role, timestamp, AAGUID friendly name, UV flag confirmation, device-type, sign counter.
- Includes a live verification badge (re-runs the verify check on page load).
- Is styled for print (clean, no navigation, no buttons in print mode).

The AAGUID friendly name comes from `lib/webauthn/aaguid-registry.ts`, a hand-curated mapping of known AAGUIDs to readable names like "Windows Hello (Hardware, TPM)" or "Touch ID (Apple)".

## 5.5 The multi-round, multi-reviewer approval pipeline

### The model

A **round** is one cycle of submission → reviews → decision. A document can go through multiple rounds: submitted, rejected, owner revises, resubmitted (new round), etc. The `approvals.round_no` column tracks which round each approval belongs to.

Each round can have multiple reviewers. The aggregate decision rule:
- **Any one reviewer rejects** → document transitions to `rejected`, round is locked.
- **All reviewers approve** → document transitions to `approved`.
- **Otherwise** → document stays `pending`.

### The submission flow

**Step 1 — Owner opens the SubmitForm.** It's only visible if the document is in `draft` status and the caller is the owner.

**Step 2 — Owner selects reviewers and a deadline.** Reviewer list is a multi-select of all users with role `reviewer` or `admin`. Deadline is a preset selector (1 day, 3 days, 1 week, 2 weeks, 30 days), with 7 days as default.

**Step 3 — Owner clicks Submit.** The form first triggers the WebAuthn signing flow (§5.4). On success, it sends `POST /api/documents/[id]/submit` with `{ reviewerIds, deadline, webauthnResponse }`.

**Step 4 — Server verifies the WebAuthn assertion** (§5.4, step 7). If invalid, returns 400.

**Step 5 — Server computes the round number.** `SELECT MAX(round_no) FROM approvals WHERE document_id = $1`, plus 1. For a first-time submission, this is round 1; for a resubmission, it increments.

**Step 6 — Server inserts approvals rows.** For each selected reviewer:
```sql
INSERT INTO approvals (document_id, reviewer_id, round_no, status, due_at)
VALUES ($1, $2, $3, 'pending', $4);
```

**Step 7 — Server inserts the signature row.** Records the owner's signature with role `owner_submission`.

**Step 8 — Server updates document status to pending.**

**Step 9 — Server inserts notifications.** One `review_assigned` notification per reviewer, plus email via Brevo.

**Step 10 — Server inserts an audit log entry** with action `SUBMIT_FOR_REVIEW`.

**Step 11 — Client redirects to the document detail page.** The Submit form is now replaced with an Approval Progress card showing the round number, X/Y approved, per-reviewer status pills.

### The decision flow (when a reviewer approves or rejects)

**Step 1 — Reviewer opens the Review Actions form.** Only visible if the document is `pending`, the reviewer has an approvals row in the current round, and the row is still `pending`.

**Step 2a — For approval**: reviewer clicks Approve, optionally types a comment, the form triggers WebAuthn signing.

**Step 2b — For rejection**: reviewer types a required comment (mandatory by validation) and clicks Reject. No signature is captured (rejection terminates).

**Step 3 — Client posts to** `/api/approvals/[approvalId]/decide`.

**Step 4 — Server verifies the WebAuthn assertion** if approving.

**Step 5 — Server updates the approvals row.** Sets status, comment, reviewed_at.

**Step 6 — Server recomputes the aggregate.**
```sql
SELECT 
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'approved') AS approved,
  COUNT(*) FILTER (WHERE status = 'rejected') AS rejected
FROM approvals
WHERE document_id = $1 AND round_no = $2;
```

If `rejected > 0`: document → `rejected`.
If `approved = total`: document → `approved`, plus compute and store `approved_hash`.
Otherwise: document stays `pending`.

**Step 7 — Server records the signature** if approving.

**Step 8 — Server inserts notifications.**
- If terminal state: `document_approved` or `document_rejected` to the owner.
- Otherwise: `review_progress` to the owner ("X of Y reviewers have approved").

**Step 9 — Server inserts audit log entry**.

### Resubmission after rejection

If a document is rejected, the owner sees a Revision Required banner with the rejecting reviewer's comment. The owner uploads a new version (via the upload pipeline §5.2), which resets the document to `draft`. Then they submit again, which increments `round_no` and creates a new set of approvals. The old rounds are preserved in the database — the detail page shows the full history grouped by round.

## 5.6 Passage-level highlights and comments

### What the user sees

On the document detail page, the PDF is rendered inline. A reviewer can drag-select a passage of text in the PDF. A small popover appears with a textarea. The reviewer types a comment and clicks save. The selected passage is now highlighted in yellow, and the comment appears in a sidebar.

Clicking a highlight in the sidebar scrolls the PDF to that page. Authors of highlights can delete their own; admins can delete any.

### The implementation

**Drag-select detection.** When the user releases the mouse after selecting text, a JavaScript event handler captures the selection range. It walks the DOM nodes within the selection and groups them by page (because the text layer is rendered as `<div>` elements absolutely positioned over each page's canvas).

**Coordinate normalization.** For each selected range on each page, the bounding rectangle is computed in pixel coordinates. These pixels are then divided by the page width and height to produce **page-relative percentages**. So a highlight at (100px, 200px) on a 1000×1300 page becomes (10%, 15.4%) in stored form.

The reason: the user might zoom in/out, or open the document on a different screen size. The pixel coordinates would be different, but the percentages remain valid. When rendering, the application multiplies by the current page dimensions.

**Storage.** `document_highlights.bounding_rects` is a JSONB array:
```json
[
  {"x": 0.10, "y": 0.154, "width": 0.30, "height": 0.02, "pageWidth": 1.0, "pageHeight": 1.0}
]
```

Multiple rectangles per highlight handle the case where a selection spans multiple lines (each line becomes its own rectangle).

**Access control.** The POST route checks the user has an approvals row in the current round before allowing highlight creation. RLS on the table also enforces this.

**Version scoping.** Highlights reference a specific `document_version_id`, so they don't carry forward when a new version is uploaded. This is intentional — old highlights might no longer apply to revised content.

## 5.7 Review deadlines and lazy reminders

### Deadlines

When the owner submits, they pick a deadline from a preset list. The server stamps `approvals.due_at` on every approval row in the new round.

The dashboard and `/reviews` queue color-code each pending row:
- **Red**: deadline is in the past (overdue).
- **Amber**: deadline is in the next 24 hours.
- **Teal (normal)**: otherwise.

Both lists sort by `due_at` ascending so urgent items appear first.

### Lazy reminders

The naive solution would be a cron job that periodically scans for overdue approvals and sends reminders. But cron requires external infrastructure — either a Vercel cron job, a separate scheduler, or polling from somewhere.

The **lazy reminder** pattern avoids all of this. When a reviewer loads `/dashboard` or `/reviews`, a small helper module (`lib/review-reminders.ts`) fires:

```typescript
for each pending approval for this user:
  if due_at < now() AND (last_reminded_at IS NULL OR last_reminded_at < now() - 24h):
    insert notification with type 'review_overdue'
    update approvals.last_reminded_at = now()
    send email via Brevo
```

The check runs in the background while the page renders — no user-visible latency.

The advantage: no cron required. The downside: a reviewer who never opens the application will never see a reminder. The email channel partially closes this gap (emails go even if the user isn't online), and the 24-hour throttle on `last_reminded_at` ensures the reminder doesn't fire every page load.

## 5.8 Notifications (in-app, email, realtime)

### In-app notifications

Every notification is a row in the `notifications` table. The notification bell in the header shows unread notifications and the badge count.

Notification types:
- `review_assigned` — to the reviewer when assigned to a new document.
- `document_approved` — to the owner when the document reaches approved.
- `document_rejected` — to the owner when any reviewer rejects.
- `review_progress` — to the owner on intermediate approvals.
- `review_overdue` — to the reviewer when their deadline has passed.
- `account_approved` — to the user when admin approves their account.
- `account_rejected` — to the user when admin rejects their account.
- `new_user_registered` — to all admins when someone signs up.

### Email mirror

For every in-app notification, an email is also sent via Brevo. The mapping is in Table 5.2 of the report. Each email has a deep-link back to the relevant page (e.g., the document detail page) using `NEXT_PUBLIC_APP_URL` as the base.

Emails are best-effort: failures are logged but don't propagate. The in-app notification is the source of truth.

The known limitation: emails are sent from a free Gmail address, and Gmail's spam filter routes them to Spam until the recipient marks one as not-spam. Domain authentication in Brevo would fix this (§7.4 and §8.2.4).

### Realtime updates

`NotificationBell` subscribes to the `notifications` table filtered by `user_id`. On INSERT, the new notification is prepended to the local list and the badge increments. On UPDATE, the `is_read` flag is patched in place.

`DashboardRealtime` (an invisible component mounted at the top of `/dashboard`) subscribes to `notifications`, `approvals`, and `documents`. On any event, it triggers a 400ms-debounced `router.refresh()`, which causes Next.js to re-fetch the dashboard's server components, refreshing all metric cards, charts, and lists.

The websocket events are gated by RLS — the database only delivers events for rows the user could SELECT. So a user can't subscribe to changes for documents they're not authorized to see.

## 5.9 Admin panel features

### User management (`/admin/users`)

- Lists all users with full name, email, role, status, created_at.
- Sorts pending accounts to the top with a banner "X pending approvals."
- Each row has a StatusSelector component (Approve / Reject buttons) and a role dropdown (employee / reviewer / admin).
- Actions go through `PATCH /api/admin/users/[id]/status` and `PATCH /api/admin/users/[id]/role`.
- Service-role client is used for writes. Audit log + notification + email are inserted.

### Document oversight (`/admin/documents`)

- Lists all documents across the system.
- Advanced search box that matches on title, description, AND the extracted text (`content_text` column on document_versions, using `ILIKE`).
- A "Matched in extracted text" badge appears on results that matched only in the content.
- Filters: status, owner, date range.
- Delete action removes the document and cascades to all dependent rows + Storage files.

### Audit logs (`/admin/audit-logs`)

- Lists all audit_logs entries.
- Filters: action type, user, document, date range.
- Each row shows actor, action code, target, timestamp, metadata (rendered as JSON).
- Useful for incident review: "show me all `ADMIN_CHANGE_USER_STATUS` actions in the last month."

## 5.10 Dashboard analytics

The dashboard has three charts implemented as pure CSS (no library):

- **Documents by Status** — horizontal bar chart of count per state.
- **Documents by Month** — bar chart of monthly document creation over the last 6 months.
- **Approval / Rejection Ratio** — two-segment stacked bar of terminal-decision proportions.

Each chart is a server component running a single aggregate SQL query and rendering the result as `<div>` elements with inline percentage widths. No charting library, no extra JavaScript shipped to the browser.

The dashboard is wrapped in `<DashboardRealtime>`, so when the underlying data changes (notifications, approvals, documents), the charts re-render via `router.refresh()`.

---

# Part 6 — How the Code is Organized

```
ai-document-bot/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Sign-in, sign-up pages
│   ├── account-status/           # Pending/rejected landing
│   ├── admin/                    # Admin panel (role-gated)
│   │   ├── users/
│   │   ├── documents/
│   │   └── audit-logs/
│   ├── api/                      # API routes
│   │   ├── auth/
│   │   ├── profile/webauthn/
│   │   ├── documents/
│   │   ├── approvals/
│   │   └── admin/
│   ├── dashboard/                # User dashboard
│   ├── documents/                # Document list and detail
│   ├── reviews/                  # Reviewer queue
│   ├── notifications/            # Full notification inbox
│   ├── globals.css               # Tailwind + custom design system
│   └── layout.tsx                # Root layout (header, sidebar)
├── components/                   # Reusable UI components
│   ├── AIWorkspace.tsx
│   ├── NotificationBell.tsx
│   ├── PdfViewer.tsx
│   ├── SigningKeySetup.tsx
│   ├── SubmitForReviewForm.tsx
│   ├── ReviewActions.tsx
│   ├── DashboardRealtime.tsx
│   └── ... (many more)
├── lib/                          # Cross-cutting utilities
│   ├── supabase/
│   │   ├── server.ts             # Anon-key client for server components
│   │   ├── admin.ts              # Service-role client for API routes
│   │   └── auth.ts               # requireUser, requireRole helpers
│   ├── webauthn/                 # WebAuthn (signing) — a folder, not one file
│   │   ├── config.ts             # rpID + expected origin
│   │   ├── verify.ts             # verifyWebAuthnSignature, hexToBase64Url
│   │   ├── client.ts             # browser signing helper (startAuthentication)
│   │   ├── authenticator-data.ts # decode UV/UP/BE flags + sign counter
│   │   └── aaguid-registry.ts    # friendly names for known AAGUIDs
│   ├── openai.ts                 # OpenAI wrapper: summary/Q&A/OCR + structured outputs + extractTextFromPdf
│   ├── pdf-validation.ts         # Magic-byte + size check (Range request)
│   ├── document-hash.ts          # getOrComputeLatestVersionHash (content_hash cache)
│   ├── email.ts                  # Brevo integration (8 senders)
│   └── review-reminders.ts       # Lazy reminder fan-out
│   # (lib/crypto/ — key-storage.ts + signing.ts — is the DISCARDED in-browser
│   #  ECDSA design from before WebAuthn; left in the tree but not used by the workflow)
├── types/                        # TypeScript type definitions
├── migrations/                   # SQL migration files (run once each)
├── scripts/
│   └── copy-pdf-worker.mjs       # Post-install hook for pdfjs worker
├── public/                       # Static assets
│   └── pdf.worker.min.mjs        # Copied by the post-install script
├── PROJECT_STATE.md              # Live feature inventory
├── SUPABASE_CONTEXT.md           # Database schema documentation
├── DEFENSE_PREP.md               # Q&A for defense (cheat sheet)
└── PROJECT_GUIDE.md              # This file (deep dive)
```

The principle: route segments are organized by user-facing area, not by feature. So everything about documents lives under `app/documents/`, everything about admin lives under `app/admin/`. This makes the URL structure visible in the source tree.

API routes are grouped by resource: documents, approvals, admin, etc. Each API route is a small file that exports HTTP method handlers.

The `lib/` folder is where cross-cutting code lives — anything used by multiple routes or components. The `components/` folder is for UI components.

---

# Part 7 — Glossary of Terms

**AAGUID** — Authenticator Attestation GUID. 128-bit identifier for the model of WebAuthn authenticator.

**Anon-key** — The publishable Supabase API key. RLS-respecting. Used in server components for reads.

**App Router** — Next.js 16's file-system routing system based on the `app/` directory.

**Approved_hash** — SHA-256 of the file computed and stored at the moment all reviewers approve. Backup integrity record.

**BaaS** — Backend-as-a-Service. A hosted platform that provides multiple backend services (database, auth, storage, realtime) as one package.

**Bcrypt** — A password hashing algorithm with a built-in salt and adjustable cost factor. Used by Supabase Auth.

**CBOR** — Concise Binary Object Representation. Binary serialization format. WebAuthn uses CBOR for COSE keys.

**Client Component** — A React component that runs in the browser. Marked with `"use client"`. Has access to state, effects, and browser APIs.

**Cold start** — The initial latency of a serverless function on first invocation after idle. 100–300ms on Vercel.

**Content_hash** — SHA-256 of a document version's file. Cached on the `document_versions` row.

**COSE** — CBOR Object Signing and Encryption. The format WebAuthn uses for public keys.

**CSRF** — Cross-Site Request Forgery. Attack where a malicious site triggers requests to your site as a logged-in user. Mitigated by SameSite cookies.

**Decree 13/2023/NĐ-CP** — Vietnam's Personal Data Protection regulation. Restricts cross-border transfer of Vietnamese personal data.

**ECDSA** — Elliptic Curve Digital Signature Algorithm. The signing algorithm used by WebAuthn in this project.

**Edge network** — A CDN that serves content from servers geographically close to the user. Vercel uses an edge network for static assets.

**eIDAS** — EU regulation on electronic identification and trust services. DocuSign-style products are eIDAS-certified.

**FIDO2** — Fast Identity Online v2. The broader specification suite that includes WebAuthn + CTAP.

**HTTP-only cookie** — A cookie that JavaScript cannot read. Sent automatically by the browser on requests. Protects against XSS-based session theft.

**JSON Schema** — A specification language for describing the structure of JSON data. Used in OpenAI's structured outputs to constrain LLM responses.

**JWT** — JSON Web Token. A signed JSON object containing user claims. Used as the authentication token in HTTP cookies.

**LLM** — Large Language Model. A neural network trained on text that can generate, summarize, and answer questions.

**Multimodal model** — An LLM that accepts non-text inputs (images, PDFs) in addition to text. Used for OCR fallback.

**Non-repudiation** — Cryptographic property: the ability to prove someone took an action even if they later deny it.

**OCR** — Optical Character Recognition. Extracting text from images.

**P-256** — A specific elliptic curve (secp256r1). The default curve used by WebAuthn ECDSA.

**PAdES** — PDF Advanced Electronic Signatures. The standard for embedding signatures inside PDF files. Not implemented in this project — future work.

**Parameterized query** — A SQL query where user values are bound as parameters, not concatenated. Prevents SQL injection.

**PKI** — Public Key Infrastructure. A system of certificate authorities that issue X.509 certificates binding identities to public keys. VNPT-CA is an example.

**PostgreSQL (Postgres)** — Open-source relational database. The "P" in many BaaS providers.

**Public-key cryptography** — Cryptographic system using a keypair: a private key (kept secret) and a public key (shared). Foundation of digital signatures.

**RBAC** — Role-Based Access Control. Authorization model where users have roles, and permissions are attached to roles.

**Realtime** — Supabase's websocket-based service that broadcasts database changes to subscribed clients.

**RLS** — Row-Level Security. PostgreSQL feature where SQL predicates determine row visibility per user.

**Server Component** — A React component that runs only on the server. Never ships JavaScript to the browser.

**Service-role key** — The secret Supabase API key that bypasses RLS. Server-only.

**SHA-256** — Secure Hash Algorithm with 256-bit output. The standard cryptographic hash function used in this project.

**Signed URL** — A temporary URL granting time-limited access to a Storage file.

**Staging-then-validate** — Upload pattern where files are first uploaded to a staging area, then validated server-side before being moved to their final location.

**Structured outputs** — OpenAI's feature that constrains LLM responses to a specified JSON schema. Critical for the AI summary endpoint.

**Supabase** — The Backend-as-a-Service used in this project. Provides Postgres, Auth, Storage, Realtime.

**TPM** — Trusted Platform Module. A hardware chip that stores cryptographic keys and performs signing operations. Where the WebAuthn private key lives on Windows machines.

**Vercel** — The hosting platform for this project. Built by the makers of Next.js.

**WebAuthn** — Web Authentication API. W3C standard for cryptographic authentication in browsers.

**XSS** — Cross-Site Scripting. Attack where malicious JavaScript is injected into your site. Mitigated by React's default escaping.

---

*End of project deep-dive guide. Read alongside `DEFENSE_PREP.md` for full coverage.*
