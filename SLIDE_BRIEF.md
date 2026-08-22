# Slide Brief — Defense Presentation

**Project:** AI-Assisted Document Approval System with Integrity Verification and Digital Signatures
**Author:** Tran Minh (23BI14290), USTH BSc ICT
**Supervisors:** Dr. Giang Anh Tuan (internal), Eng. Vu Ngoc Diep (external)
**Target:** 12–15 minute defense, technical examiner panel. 14 slides. Minimal text per slide (talking points, not paragraphs).

> **How to use this file:** Build the deck in Canva from this brief. Each slide gives the heading, the bullets to show, the figure/visual to place, and (in *italics*) what to say out loud. Section/figure references match the FINAL report (5 chapters; figures renumbered to 3.x and 4.x). Lead with the three pillars, and spend the most time on the multi-party WebAuthn signing — it is the most novel part.

---

## Second-defense positioning

Use this framing before the existing slide notes:

An AI-assisted internal document approval system for university departments and research groups that still review academic PDFs through email, chat, or shared folders. Students and researchers upload proposals, reports, and academic documents; assigned supervisors and department reviewers approve or reject them in multi-round workflows; an OpenAI assistant summarizes each document and answers grounded questions about it. Every approved document carries a multi-party WebAuthn digital signature tied to the file hash, so the department can later verify both signer authenticity and whether the approved file was changed.

The deck should make the target audience visible by Slide 2. Do not present the project as a generic enterprise SaaS or as a replacement for legal e-signature products. Present it as a focused academic workflow tool for departments and research groups that need more accountability than email or Google Drive, but less complexity than enterprise document-management software.

Recommended Slide 2 changes:

- Target setting: university departments and research groups reviewing academic PDFs.
- Current workflow: email attachments, Google Drive/shared folders, chat messages, and informal approval replies.
- Pain points: unclear supervisor/reviewer responsibility, scattered feedback/version history, no integrity guarantee, and no intelligent reading help.
- Practical value: know who is responsible, which version was approved, what feedback was given, and whether the approved file later changed.

Recommended optional Slide 2A:

- Title: Target Users and Scenario.
- Users: student/researcher, supervisor, department reviewer, administrator.
- Scenario: a student submits a research proposal or internship report for supervisor and department review.
- Visual: Student -> Supervisor -> Department reviewer -> approved certificate.

---


## The 30-second framing (memorize this; it drives the whole deck)
An AI-assisted internal document approval system for university departments and research groups. Students or researchers upload academic PDFs such as research proposals and internship reports; supervisors and department reviewers approve or reject them in multi-round workflows; an OpenAI assistant summarizes each document and answers grounded questions about it. Every approved document carries multi-party WebAuthn signature evidence tied to the file hash, so the department can verify both approval responsibility and file integrity. Stack: Next.js 16 + Supabase (Postgres + RLS + Auth + Storage) + OpenAI, deployed on Vercel.

Three pillars to repeat throughout: **Workflow · AI assistance · Hardware-bound signing.**

**Timing target:** ~10 min talk + ~3–4 min demo + Q&A. Times per slide are in [brackets] below; they sum to ~13 min including the demo.

---

## Slide 1 — Title [0:20]
- Project title, author + student ID, supervisors, USTH, July 2026.
- Visual: USTH logo; clean title layout.
- *Say: one sentence on what the system is — "an app that lets a small organization review, approve, and cryptographically sign documents, with an AI assistant built in."*

## Slide 2 — Problem & Motivation [1:00]
- Traditional document review = email attachments + printed copies + paper signatures + ad-hoc tracking.
- Four pain points: no workflow visibility · weak accountability · no integrity guarantee · no intelligent reading help.
- The gap: existing tools each solve only ONE of workflow / AI / signing; none integrate all three.
- Visual: simple "before" cluster (email / paper / scattered threads) → arrow → "after" (one unified app).
- *Say: e-signature tools have no AI; document systems bolt signing on; AI assistants have no concept of review or signing. The opportunity is to combine all three in one low-overhead app.* (Source: §1.1–1.2, §2.5)

## Slide 3 — What I Built (the three pillars) [0:50]
- Three columns: **Multi-role Workflow** | **AI Assistant** | **Multi-party Digital Signing**.
- One line each: Submitter / Reviewer / Administrator with multi-round approval · summary + key points + risk notes + grounded Q&A · WebAuthn signatures by the Submitter and each reviewer.
- Visual: 3-column layout, one icon per pillar.
- *Say: this is the whole project in one slide; the rest of the talk drills into each pillar, then shows results.*

## Slide 4 — Tech Stack & Architecture [1:15]
- Stack badges: Next.js 16 (App Router, RSC) · React 19 · Tailwind v4 · Supabase (Postgres + RLS + Auth + Storage) · OpenAI gpt-5.4-mini · Vercel.
- Key idea: **three-tier** — browser → Next.js server → Supabase; the AI is called server-side only, so the API key never reaches the browser.
- Visual: **Figure 3.1** (the three-tier architecture diagram) from the report.
- *Say: the key architectural decision is the two database clients — the anon-key client respects Row-Level Security for all reads, and the service-role client does privileged writes only inside API routes after an auth check. Reads are governed by the database, writes by server code.* (Source: §3.1)

## Slide 5 — The Workflow (state machine) [1:10]
- States: **draft → pending → approved / rejected**. Unanimous approval; any single rejection ends the round; resubmission opens a new round (round_no + 1), history preserved.
- Visual: **Figure 3.4** (document state machine).
- *Say: separation of duties — approval authority comes from being ASSIGNED as a reviewer on that specific document, and the submit route blocks the owner from assigning themselves, so no one can approve their own document.* (Source: §3.4)

## Slide 6 — AI Assistant [1:10]
- Hybrid extraction: pdf-parse text layer first (free, any length) → OCR fallback via OpenAI Files API when text < 100 chars, capped at 10 pages to control cost.
- Structured output (JSON schema) → reliable summary / key_points / risk_notes, no fragile string parsing. Grounded Q&A persisted to history.
- Visual: **Figure 3.6** (hybrid extraction pipeline) — or the §4.5 AI-panel screenshot (Figure 4.4) once captured.
- *Say: structured outputs were the most useful technique — the model is forced to return exactly the fields the UI expects. The AI assists; the human reviewer always makes the final decision.* (Source: §3.5)

## Slide 7 — Digital Signing (THE CENTERPIECE — spend the most time here) [1:50]
- Multi-party WebAuthn / FIDO2. The owner signs at submission; each reviewer signs at approval.
- Signing uses a **registered WebAuthn platform credential**; every signature requests PIN or biometric user verification (`userVerification: "required"`).
- The **file's SHA-256 hash is the WebAuthn challenge** → each signature is cryptographically bound to the exact file bytes.
- Three technical guarantees: **signer authenticity · file integrity · auditability**. A server admin cannot produce a valid WebAuthn assertion for another registered credential because the server only stores public keys.
- Visual: a clean 3-step flow (Register key via Hello → Sign file hash → Server verifies with verifyAuthenticationResponse). Keep it simple.
- *Say: contrast with "just a SHA-256 hash" (a database admin could swap both the file and the stored hash) and with browser-held keys (more exposed to XSS or local browser compromise). WebAuthn improves this because signing is delegated to the registered authenticator and verified server-side.* (Source: §3.6, §2.3)

## Slide 8 — Tamper Detection (the visual "wow") [1:30]
- Two independent judgments per signature: **Hash Match / Mismatch** (did the file change?) AND **WebAuthn-ES256 Valid / Invalid** (is the signer authentic?).
- Three scenarios: (a) untampered → all Hash Match + Valid; (b) tampered between submit and approval → owner sig Hash Mismatch but still Valid; (c) tampered after approval → both Mismatch but both Valid.
- Visual: **Figure 3.7** (the three real screenshots a/b/c) — your strongest single visual; use it big, ideally a full slide.
- *Say: the combination is what makes it powerful. A valid-but-mismatched signature tells you exactly what happened — nobody was impersonated, but the file changed after it was signed. A plain hash check could never make that distinction.* (Source: §3.6, Figure 3.7)

## Slide 9 — Layered Security [1:00]
- Defense in depth, three layers: page/route role guards (requireUser / requireRole) + database Row-Level Security + service-role-only writes after auth checks.
- Even if the UI or an app-level check is bypassed, the database still refuses rows the user isn't entitled to see.
- Visual: simple layered diagram, or reuse the attack-scenario table (Table 4.3).
- *Say: the RLS is real, not decorative — I tested it by deliberately removing the app-level check in a test branch and confirming the database still blocked the read.* (Source: §3.1–3.2, §4.3, Table 4.3)

## Slide 10 — Live Demo [2:00 incl. demo]
- Big text: "LIVE DEMO" + the deployed Vercel URL.
- Mini agenda: register + approve account → upload + AI summary → submit (Windows Hello sign) → reviewer approves (sign) → **tamper the stored file → Verify Integrity** → certificate page.
- *Say: have a backup screen recording ready in case of network issues. Rehearse with a timer.* (Source: DEFENSE_PREP)

## Slide 11 — Results [1:10]
- All **17 functional requirements** and **8 non-functional requirements** implemented and verified by manual testing (Table 4.1).
- Performance (production build, Ryzen 7 6800H / 32 GB, Supabase in Singapore): dashboard ~600 ms · document detail ~700 ms · AI summary ~4.2 s · Verify Integrity ~1.1 s · WebAuthn verify ~150 ms.
- AI cost (real, from audit_logs token usage): ~0.33¢ / summary · ~0.22¢ / question · ~1.41¢ / OCR → under $2/month for 100 documents.
- Visual: a clean metrics table or stat cards. (Source: §4.1–4.2, Table 4.1, Table 4.2, §1.4)

## Slide 12 — Research Questions Answered [0:50]
- RQ1 (workflow as a state machine) ✓ — expressive for multi-reviewer rounds, simple to maintain.
- RQ2 (useful, cost-controlled, gracefully-degrading AI) ✓ — structured outputs + hybrid extraction + cost caps.
- RQ3 (layered security holds even vs. a malicious client) ✓ — confirmed by the bypass tests.
- Visual: 3 RQs, each with a check and a one-line verdict. (Source: §4.4)

## Slide 13 — Limitations & Future Work [0:50]
- Honest limitations: platform-authenticator only (Linux desktop gap) · OCR 10-page cap · external AI dependency (data sovereignty) · no automated test suite yet.
- High-priority future work: **PAdES PDF-embedded signatures** (verify in Adobe Reader), **Trusted Timestamp Authority (RFC 3161)**; also Playwright tests, self-hosted model, dedicated OCR service.
- *Say: framing these as known trade-offs shows maturity. Note: a per-user AI rate limit is already implemented (Postgres-backed, 20 calls / 10 min, fails open).* (Source: §4.6, §5.2)

## Slide 14 — Conclusion [0:35]
- One unified app integrates three normally-separate concerns — structured workflow, real LLM assistance, and WebAuthn-based multi-party signing — built end-to-end by a single student on free-tier infrastructure.
- Restate the three pillars; thank the panel; invite questions.
- Visual: clean closing; optionally the three-pillar icons again.

---

## Numbers to get right (do NOT improvise these)
- States: draft → pending → approved / rejected (NO "signed" state).
- DB: **ten tables** (nine core + document_ai_messages).
- Model: **gpt-5.4-mini** (everything; OCR may override via OPENAI_OCR_MODEL).
- Perf hardware: **AMD Ryzen 7 6800H, 32 GB** (NOT i7 / 16 GB). Always say "production build."
- AI cost: 0.33¢ summary / 0.22¢ question / 1.41¢ OCR; under $2/month @ 100 docs.
- Signature algorithm label in the UI: **WebAuthn-ES256** (ECDSA P-256).
- **17 functional requirements (FR1–FR17)** + **8 non-functional (NFR1–NFR8)**, all implemented.
- Rate limit: **20 AI calls / 10 minutes** per user, Postgres-backed, fails open.

## Figure map (final report numbering — use these on the slides)
- **Figure 3.1** — three-tier architecture → Slide 4.
- **Figure 3.4** — document state machine → Slide 5.
- **Figure 3.6** — hybrid text-extraction pipeline → Slide 6.
- **Figure 3.7** — tamper-detection verification panels (a/b/c) → Slide 8 (full slide).
- **Figures 4.1–4.5** — UI screenshots (login, dashboard, document detail, AI panel, certificate) → optional on Slides 6/10/11. NOTE: these are the screenshots you still need to capture from the live app.
- Figures 3.2 (ERD), 3.3 (upload sequence), 3.5 (submission sequence) exist in the report but are too detailed for slides — skip them or keep as backup slides for Q&A.

## Design guidance for Canva
- Minimal text per slide; the report has the prose, the slides have the talking points.
- Reuse the report's real figures (3.1, 3.4, 3.6, 3.7) rather than redrawing — they're already accurate and consistent with the report.
- Consistent color: a calm primary + one accent reserved for the security/signing slides (7, 8, 9) so the centerpiece stands out.
- Figure 3.7 (tamper panels) deserves a full slide — it's the most persuasive visual in the whole deck.
- Capture the UI screenshots (Figures 4.1–4.5) from the live app before the defense; they double as demo backups.

## Backup / Q&A slides (optional, place after Slide 14)
- ERD (Figure 3.2) — if asked about the data model / ten tables.
- Upload pipeline (Figure 3.3) — if asked "how do you stop a malicious upload?"
- Rate-limit detail — if asked "how do you stop AI cost blowup?" (Postgres SECURITY DEFINER, atomic check-and-increment, fails open).
- See DEFENSE_PREP.md for the full Q&A bank.
