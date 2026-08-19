# Presentation Script — Defense

**Project:** AI-Assisted Document Approval System with Integrity Verification and Digital Signatures
**Author:** Tran Minh (23BI14290), USTH
**Pairs with:** [SLIDE_BRIEF.md](SLIDE_BRIEF.md) (slide content) — this file is what you SAY out loud.

> **How to use:** Don't memorize word-for-word — internalize the ideas, then say them in your own words. The timing target is ~13 minutes of talking + ~2 minutes demo buffer = 15 total. Rehearse with a timer at least 3 times. Lead with calm confidence on the signing slides (7–8); that's where the panel will probe.

**Total target: ~15 min.** Times per slide are in [brackets].

---

## Slide 1 — Title [0:20]
"Good morning. My name is Tran Minh, and this is my graduation project: an AI-Assisted Document Approval System with Integrity Verification and Digital Signatures. It was supervised by Dr. Giang Anh Tuan and Eng. Vu Ngoc Diep. Over the next fifteen minutes or so I'll walk you through the problem it solves, how it's built, a live demonstration, and the results."

## Slide 2 — Problem & Motivation [1:00]
"In most organizations, document review still happens through email attachments, printed copies, and paper signatures. This creates four recurring problems. First, there's no workflow visibility — an author can't easily see who has approved or rejected, or when. Second, accountability is weak — approvals are informal email replies that can be lost or forged. Third, there's no integrity guarantee — once a document is approved, nothing proves the file someone holds later is the same file that was approved. And fourth, there's no intelligent assistance — reviewers must read long PDFs entirely, with no way to get a quick summary or ask a question.

Existing tools each solve only one piece. E-signature platforms sign PDFs but have no AI. Document management systems handle workflow but bolt signing on. AI assistants summarize but have no concept of review or signing. My project integrates all three concerns into one application."

## Slide 3 — What I Built (three pillars) [0:50]
"The system rests on three pillars. The first is a multi-role workflow — employee, reviewer, and administrator — with a multi-round, multi-reviewer approval pipeline. The second is an AI assistant powered by OpenAI that extracts text, generates structured summaries with key points and risk notes, and answers grounded questions about the document. The third, and the most novel, is multi-party digital signing using WebAuthn — the owner signs at submission, and each reviewer signs at approval, with keys bound to the device's hardware. The rest of this presentation drills into each pillar."

## Slide 4 — Tech Stack & Architecture [1:15]
"The system is a three-tier web application. The front end and server are a single Next.js 16 application deployed on Vercel; the data layer is Supabase, which gives me managed PostgreSQL with Row-Level Security, authentication, and file storage. The AI assistant calls the OpenAI API, always server-side, so the API key never reaches the browser.

The most important architectural decision is on this diagram: I use two different database clients on the server. The anon-key client respects Row-Level Security and handles all reads — the database automatically filters results to what the user is allowed to see. The service-role client bypasses Row-Level Security and is used only inside API routes for privileged writes, and only after the route has verified the caller's identity. So reads are governed declaratively by the database, and writes imperatively by server code — the browser can never bypass either."

## Slide 5 — The Workflow [1:10]
"A document moves through a state machine with four states: draft, pending, approved, and rejected. When the owner submits, the document goes to pending and a review round opens. The rule is unanimous approval — every assigned reviewer must approve for the document to be approved. Any single rejection ends the round immediately, and the owner can upload a new version, which opens a fresh round with the history preserved.

One design point I want to highlight is separation of duties. Approval authority doesn't come from a job title — it comes from being assigned as a reviewer on that specific document. And the submission route blocks the owner from assigning themselves as a reviewer, so no one can approve their own document."

## Slide 6 — AI Assistant [1:10]
"For the AI to work, I first need text out of the PDF. I use a hybrid extraction pipeline: first I try pdf-parse to read the text layer, which is free, local, and works for a document of any length. If that returns almost nothing — under a hundred characters, meaning it's probably a scanned image — I fall back to OCR through OpenAI's multimodal model. That OCR path is the expensive one, so it's capped at ten pages to keep cost predictable; text-based PDFs of any length are unaffected.

Once I have the text, the assistant does two things. It generates a structured summary — and the key technique here is JSON-schema-constrained output, which forces the model to return exactly the fields my interface expects, so I never parse free-form text. And it answers grounded questions, where the prompt instructs the model to base its answer only on the document. The AI is assistance, not authority — the human reviewer always makes the final decision."

## Slide 7 — Digital Signing (CENTERPIECE) [1:50]
"This is the core contribution, so I'll spend a little more time here. The signing uses WebAuthn — the same standard behind passkeys and modern banking apps. It's multi-party: the owner signs when they submit, to attest 'this is the file I'm sending,' and each reviewer signs when they approve, to attest 'this is the file I'm endorsing.'

Three properties make this strong. First, the private key is generated inside the device's TPM — the hardware security chip — and is non-extractable; it physically never leaves the device, not even to the user. Second, every signature requires a fresh Windows Hello check — a PIN or fingerprint — at the moment of signing, so it proves a person consciously signed, not just that a session cookie was present. Third, the challenge that gets signed is the SHA-256 hash of the file itself, so each signature is cryptographically bound to the exact bytes of that document.

Together these give authenticity, integrity, and non-repudiation. And critically — even a fully compromised server administrator cannot forge a signature, because the server only ever stores public keys. Compare this to just storing a SHA-256 hash, where a database admin could swap both the file and the hash undetectably; or to keeping keys in the browser, where an XSS attack could steal them. WebAuthn defeats both."

## Slide 8 — Tamper Detection (the visual) [1:30]
"This slide shows why the design is powerful in practice. When you click Verify Integrity, the system makes two independent judgments per signature. One: does the current file's hash match what was signed? Two: is the signature itself cryptographically valid for that signer?

Panel (a) is the healthy state — both signatures show Hash Match and valid. Panel (b) is a file tampered between submission and approval: the owner's signature is still cryptographically valid — the math proves the owner produced it — but the hash no longer matches, so the tampering is flagged before the reviewer ever approves. Panel (c) is tampering after final approval: both signatures show hash mismatch but remain valid.

That combination tells you exactly what happened. Valid-but-mismatched means nobody was impersonated, but the file was altered after it was signed. A plain hash check could never distinguish those cases."

## Slide 9 — Layered Security [1:00]
"Security here is defense in depth, with three layers. At the application layer, every protected page and API route calls a guard that checks the user's role. At the database layer, Row-Level Security policies mean the database itself refuses to return rows a user isn't entitled to. And all privileged writes go only through server routes using the service-role client, after identity checks.

I want to stress that the Row-Level Security is real, not decorative. I tested it by deliberately removing the application-level check in a test branch and sending a direct request — and the database still blocked the read. So even if a bug bypasses the app logic, the data stays protected."

## Slide 10 — Live Demo [2:00 incl. demo]
"Now I'll show it live. I'll register an account and approve it as admin; upload a PDF and generate an AI summary; submit it for review, which triggers a Windows Hello signature; approve it as the reviewer, with another signature; and then — the important part — I'll tamper with the stored file and click Verify Integrity, so you can see the system detect it. Finally I'll show the certificate page."

*(If the demo breaks: "The live environment is having a connectivity issue — here's the recorded walkthrough I prepared." Then play the backup video.)*

## Slide 11 — Results [1:10]
"All seventeen functional requirements and all eight non-functional requirements are implemented and were verified through manual testing. On performance, measured on a production build: the dashboard loads in about six hundred milliseconds, an AI summary takes around four seconds — most of that is the OpenAI call itself — and a WebAuthn signature verifies server-side in about a hundred and fifty milliseconds.

On cost, these aren't estimates — they're from the token usage I log on every AI call. A summary costs about a third of a US cent, a question about a fifth of a cent, and an OCR extraction about one and a half cents. For a small organization processing a hundred documents a month, the total AI cost is under two US dollars."

## Slide 12 — Research Questions [0:50]
"This lets me answer my three research questions. RQ1, on modeling a multi-role workflow as a state machine — answered positively; it's expressive enough for multi-reviewer rounds and resubmission, yet simple enough for one developer to maintain. RQ2, on integrating an LLM usefully and cost-controllably — yes, with structured outputs as the key enabler and graceful degradation when the model fails. And RQ3, on whether layered security holds against a malicious client — confirmed by the bypass tests I just described."

## Slide 13 — Limitations & Future Work [0:50]
"I'll be honest about the limitations. Signing requires a platform authenticator, so a Linux desktop without one can't sign directly. OCR is capped at ten pages. The AI depends on an external service, which matters for data sovereignty. And I don't yet have an automated test suite.

The highest-priority future work is embedding the signatures into the PDF itself using the PAdES standard, so they're verifiable in Adobe Reader without my application, and adding a trusted timestamp authority for non-repudiation that survives database tampering."

## Slide 14 — Conclusion [0:35]
"To conclude: I built a single application that integrates structured workflow, real LLM assistance, and hardware-bound multi-party signing — three things that are normally separate products — and deployed it end-to-end on free-tier infrastructure as a solo developer. Thank you. I'm happy to take your questions."

---

## Q&A survival notes
- If you don't know something: "I don't have a confident answer to that. My best guess is X, but I'd want to verify before stating it as fact." The panel respects honesty over bluffing.
- The most likely hard questions and short answers:
  - **"Why not just a hash?"** A DB admin could replace both file and hash; WebAuthn binds a person's hardware key to the bytes, and the server can't forge it.
  - **"Why not certmgr / a real CA?"** Browsers can't read the Windows cert store (security boundary); WebAuthn is the modern equivalent and the key can't be exported. A real CA costs money and needs PKI integration — noted as future work.
  - **"How do you stop AI abuse / cost blowup?"** Per-user rate limit (Postgres-backed, 20 calls/10 min), plus 12k-char input cap and 10-page OCR cap.
  - **"Why cap OCR at 10 pages — can't you handle longer documents?"** A limit is normal — every OCR service has one (Google Vision, AWS Textract, Azure all cap pages/size). The cap is OCR-only: text-based PDFs of any length extract fine via the free local path. It's conservative at 10 because my OCR runs through a general-purpose model, not a dedicated OCR engine, so it's pricier per page; the production fix is a dedicated OCR service (Tesseract / cloud OCR), which is in future work §5.2. It only affects *scanned* PDFs over 10 pages, which is uncommon for born-digital org documents.
  - **"What stops approving your own document?"** Submit route blocks self-assignment; reviewers need an approvals row; RLS reinforces it.
  - **"Did you really build all this?"** Yes — git history shows the progression; signing went through three iterations (hash-only → public-key → multi-party WebAuthn) driven by supervisor feedback.
- Full Q&A bank: see DEFENSE_PREP.md.
