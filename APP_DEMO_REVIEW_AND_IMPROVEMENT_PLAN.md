# Vercel Demo Review and Improvement Plan

## Scope Reviewed

Deployment reviewed: `https://ai-document-bot.vercel.app/`

Roles checked:

- Submitter account
- Reviewer account
- Administrator account

Reviewed flows:

- Login and logout
- Submitter dashboard
- Document list and empty state
- Create document form
- Reviewer dashboard and review queue
- Administrator dashboard
- User management
- All documents
- Document detail page
- AI summary and extracted text preview
- Approval progress
- Verify Integrity
- Certificate page
- Mobile viewport check on the document detail page

## Overall Verdict

The deployed application works and demonstrates the main project ideas well: role-based access, PDF review, AI assistance, approval workflow, WebAuthn-based signatures, integrity verification, and certificate output.

The main weakness is not broken functionality. The main weakness is demo readiness. The current deployed data still looks like development/test data, and some UI labels still expose the internal role name `employee`, while the report now positions the user as a `submitter`. This mismatch can make the project look less practical than it really is.

## Implementation Status

### Completed in the Codebase

- Public login copy now presents the product as an academic document approval workspace.
- UI role labels now map the implementation role `employee` to the academic label `Submitter`.
- Submitter document list, dashboard copy, and Create Academic Document form now use academic workflow wording.
- Reviewer dashboard and Review Queue now emphasize assigned academic reviews.
- Document detail now includes a workflow stepper and a compact metadata strip.
- Audit logs now show human-readable action labels, with raw JSON under Technical metadata.
- Certificate wording has been softened into a technical verification record, with practical summary questions before hash/signature details.
- WebAuthn copy no longer overclaims universal TPM, hardware-bound, PAdES, or legal non-repudiation guarantees.
- Login fields now include appropriate autocomplete attributes.

### Still Needed Before Defense

- Clean the deployed demo data on Vercel/Supabase.
- Prepare one realistic academic PDF for the main walkthrough.
- Make sure the reviewer demo account has at least one pending assigned review.
- Keep deadlines fresh: one normal future deadline, optionally one overdue example.
- Redeploy the updated code to Vercel after checking the local version.

## Original Must-Fix Notes

### 1. Display `Submitter` Instead of `employee`

The database and API can keep the internal enum value `employee`, but the UI should display `Submitter` to match the report and defense story.

Status: implemented in the local codebase.

Observed places:

- Top-right user badge: `demo@gmail.com · employee`
- Admin User Management role badge
- Admin User Management role dropdown
- Certificate page: `Role: employee`

Recommended implementation:

- Add a small role-label helper, for example `formatRoleLabel(role)`.
- Return:
  - `employee` -> `Submitter`
  - `reviewer` -> `Reviewer`
  - `admin` -> `Administrator`
- Use the helper only for display.
- Keep API values unchanged: `employee`, `reviewer`, `admin`.

Likely files:

- `components/UserBadge.tsx`
- `components/admin/RoleSelector.tsx`
- `app/admin/users/page.tsx`
- `app/documents/[id]/certificate/page.tsx`
- Possibly `components/SubmitForReviewForm.tsx`

### 2. Prepare Professional Demo Data

Current demo data includes titles such as:

- `demo5`
- `scan 1`
- `scan 2`
- `doc 1`
- `testtt`
- `No description`

This weakens the practical-value story.

Status: still needed in the deployed database.

Recommended academic demo dataset:

| Status | Example Title | Purpose |
|---|---|---|
| Draft | `Research Proposal - AI-Assisted Academic Document Review` | Show upload and draft state |
| Pending | `Internship Report - Document Workflow Prototype` | Show reviewer queue and pending approval |
| Rejected | `Thesis Outline - Version 1` | Show rejection, comment, and resubmission |
| Approved | `Research Proposal - Final Approved Version` | Show certificate and integrity verification |

Recommended users:

| Role | Display Name |
|---|---|
| Submitter | `Student Submitter` or `Minh Tran` |
| Reviewer | `Academic Reviewer` |
| Admin | `Department Administrator` |

### 3. Use an Academic PDF for the Main Demo

The current opened documents include a fax sample and an algebra lecture slide deck. They technically prove PDF extraction, but they do not strongly match the report's target scenario.

Use one main demo PDF that looks like a realistic academic submission:

- Research proposal
- Internship report
- Thesis outline
- Academic progress report

The AI summary should then produce outputs about objectives, methodology, missing sections, risks, and revision needs. That directly supports the claim that reviewers can read faster.

Status: still needed for the live demo dataset.

### 4. Make Reviewer Account Demonstrate Real Work

The reviewer account currently has no pending reviews. For defense, this is a problem because reviewer workflow is one of the main project claims.

Recommended:

- Assign at least one pending academic document to the reviewer demo account.
- Set the deadline to a near future date, not an old overdue date.
- Add one document with a previous rejection and resubmission round.

Status: still needed in the deployed database.

### 5. Avoid Old Overdue Demo Dates

The admin account shows items overdue by many days. This is useful for proving overdue detection, but it can also make the demo look stale.

Recommended:

- Keep one overdue item if you want to demonstrate overdue styling.
- Add one normal pending item due tomorrow or next week.
- In the defense demo, lead with the normal pending item.

Status: still needed in the deployed database.

### 6. Adjust Certificate Wording

The certificate page works well, but the heading `Document Signed` can be slightly misleading for pending documents that only have the owner submission signature.

Recommended heading:

> Signature Certificate

Recommended subtitle:

> This certificate records the WebAuthn signatures currently attached to the document. A document is fully approved only after all assigned reviewers have approved and signed.

This makes the certificate correct for both pending and approved documents.

Status: implemented in the local codebase.

### 7. Add Login Autocomplete Attributes

The browser console reports a warning that the password input should have an autocomplete attribute.

Recommended:

- Email input: `autoComplete="email"`
- Password input on login: `autoComplete="current-password"`
- Password input on registration: `autoComplete="new-password"`
- Full name input: `autoComplete="name"`

Likely file:

- `app/login/page.tsx`

Status: implemented in the local codebase.

## Good Findings

- Login, logout, and redirects work for all tested roles.
- No frontend console errors appeared during the tested flows.
- Supabase auth and app requests returned successful statuses during the tested flows.
- Admin dashboard gives a strong overview of system activity.
- Document detail page is feature-rich and supports the defense narrative.
- `Verify Integrity` worked and returned a valid result.
- The certificate page shows useful evidence: file hash, signer, signing time, authenticator, user verification, and WebAuthn validity.
- Mobile layout on the top of the document detail page looked clean, with no obvious overlap.

## Recommended Defense Demo Flow

1. Login as submitter.
2. Show a draft academic document.
3. Upload or open a research proposal PDF.
4. Generate AI summary and point out key points/risk notes.
5. Submit to supervisor/reviewer with a deadline.
6. Login as reviewer.
7. Open Review Queue and inspect the assigned document.
8. Add a passage-level comment.
9. Reject once to show resubmission, or approve to show the happy path.
10. Login as admin.
11. Show user management, all documents, all approvals, and audit logs.
12. Open an approved document.
13. Click Verify Integrity.
14. Open the certificate and explain the hash + WebAuthn evidence.

## Implementation Priority

1. Redeploy the updated code to Vercel.
2. Demo data cleanup.
3. Prepare the academic PDF and one complete submitter-to-reviewer workflow.
4. Optional: create a seed/demo reset script for defense preparation.
