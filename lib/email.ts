import { createAdminClient } from "@/lib/supabase/admin";

// Send transactional email via Brevo's REST API (no SDK — keeps deps small).
// All senders are best-effort: the in-app notification row is the source of
// truth, so an email failure must never break the calling request.

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

function getFrom(): { email: string; name: string } | null {
  const email = process.env.BREVO_FROM_EMAIL;
  if (!email) return null;
  return {
    email,
    name: process.env.BREVO_FROM_NAME || "AI Document Review",
  };
}

export function buildAppUrl(path: string = "/"): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const trimmedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const trimmedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${trimmedPath}`;
}

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

async function sendEmail(args: SendArgs): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const from = getFrom();

  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[email] BREVO_API_KEY or BREVO_FROM_EMAIL not set — skipping email to ${args.to} (${args.subject})`
      );
    }
    return;
  }

  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: from,
        to: [{ email: args.to }],
        subject: args.subject,
        htmlContent: args.html,
        textContent: args.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(
        `[email] Brevo returned ${response.status}: ${body.slice(0, 500)}`
      );
    }
  } catch (err) {
    console.error("[email] Brevo fetch threw:", err);
  }
}

async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user?.email) return null;
    return data.user.email;
  } catch (err) {
    console.error("[email] Failed to fetch user email:", err);
    return null;
  }
}

function renderEmail(opts: {
  heading: string;
  body: string;
  cta?: { label: string; url: string };
}): string {
  const cta = opts.cta
    ? `<p style="margin: 24px 0 0 0;">
         <a href="${opts.cta.url}" style="display: inline-block; padding: 10px 18px; background: #0f766e; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">${opts.cta.label}</a>
       </p>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin: 0; padding: 24px; background: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937;">
    <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <h1 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #0f172a;">${opts.heading}</h1>
      <div style="font-size: 15px; line-height: 1.6; color: #334155;">${opts.body}</div>
      ${cta}
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 16px 0;" />
      <p style="font-size: 12px; color: #94a3b8; margin: 0;">AI Document Review Assistant — automated message, please do not reply.</p>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Per-notification senders ──────────────────────────────────────────────

export async function sendReviewAssignedEmail(args: {
  reviewerId: string;
  documentId: string;
  documentTitle: string;
  roundNo: number;
  reviewerCount: number;
  dueAt: string;
}): Promise<void> {
  const to = await getUserEmail(args.reviewerId);
  if (!to) return;

  const title = escapeHtml(args.documentTitle);
  const dueLabel = new Date(args.dueAt).toLocaleDateString();
  const url = buildAppUrl(`/documents/${args.documentId}`);

  await sendEmail({
    to,
    subject: `Review requested: ${args.documentTitle}`,
    html: renderEmail({
      heading: "You have a new document to review",
      body: `
        <p>You have been assigned to review <strong>${title}</strong>.</p>
        <ul style="padding-left: 20px;">
          <li>Round ${args.roundNo}</li>
          <li>${args.reviewerCount} reviewer${args.reviewerCount === 1 ? "" : "s"} in this round</li>
          <li>Due by <strong>${escapeHtml(dueLabel)}</strong></li>
        </ul>
      `,
      cta: { label: "Open document", url },
    }),
    text: `You have been assigned to review "${args.documentTitle}" (round ${args.roundNo}). Due ${dueLabel}. Open: ${url}`,
  });
}

export async function sendDocumentApprovedEmail(args: {
  ownerId: string;
  documentId: string;
  documentTitle: string;
  totalReviewers: number;
}): Promise<void> {
  const to = await getUserEmail(args.ownerId);
  if (!to) return;

  const title = escapeHtml(args.documentTitle);
  const url = buildAppUrl(`/documents/${args.documentId}`);
  const plural = args.totalReviewers === 1 ? "" : "s";

  await sendEmail({
    to,
    subject: `Approved: ${args.documentTitle}`,
    html: renderEmail({
      heading: "Your document was approved",
      body: `<p>All ${args.totalReviewers} reviewer${plural} approved <strong>${title}</strong>. The document has been signed and is ready to download.</p>`,
      cta: { label: "View document", url },
    }),
    text: `"${args.documentTitle}" was approved by all ${args.totalReviewers} reviewer${plural}. ${url}`,
  });
}

export async function sendDocumentRejectedEmail(args: {
  ownerId: string;
  documentId: string;
  documentTitle: string;
  comment: string | null;
}): Promise<void> {
  const to = await getUserEmail(args.ownerId);
  if (!to) return;

  const title = escapeHtml(args.documentTitle);
  const url = buildAppUrl(`/documents/${args.documentId}`);
  const commentBlock = args.comment
    ? `<p style="margin-top: 12px; padding: 12px 16px; background: #fef2f2; border-left: 3px solid #dc2626; color: #991b1b;">${escapeHtml(args.comment)}</p>`
    : "";

  await sendEmail({
    to,
    subject: `Revision requested: ${args.documentTitle}`,
    html: renderEmail({
      heading: "Your document needs revision",
      body: `<p><strong>${title}</strong> was rejected by a reviewer. You can upload a new version and resubmit.</p>${commentBlock}`,
      cta: { label: "Open and revise", url },
    }),
    text: `"${args.documentTitle}" was rejected.${args.comment ? ` Reason: ${args.comment}` : ""} ${url}`,
  });
}

export async function sendReviewProgressEmail(args: {
  ownerId: string;
  documentId: string;
  documentTitle: string;
  approvedCount: number;
  totalCount: number;
}): Promise<void> {
  const to = await getUserEmail(args.ownerId);
  if (!to) return;

  const title = escapeHtml(args.documentTitle);
  const url = buildAppUrl(`/documents/${args.documentId}`);

  await sendEmail({
    to,
    subject: `Review progress: ${args.documentTitle}`,
    html: renderEmail({
      heading: "Review progress update",
      body: `<p><strong>${args.approvedCount}</strong> of <strong>${args.totalCount}</strong> reviewers have approved <strong>${title}</strong>.</p>`,
      cta: { label: "View progress", url },
    }),
    text: `"${args.documentTitle}" — ${args.approvedCount} of ${args.totalCount} reviewers approved. ${url}`,
  });
}

export async function sendReviewOverdueEmail(args: {
  reviewerId: string;
  documentId: string;
  documentTitle: string;
  overdueDays: number;
}): Promise<void> {
  const to = await getUserEmail(args.reviewerId);
  if (!to) return;

  const title = escapeHtml(args.documentTitle);
  const url = buildAppUrl(`/documents/${args.documentId}`);
  const dayLabel = `${args.overdueDays} day${args.overdueDays === 1 ? "" : "s"}`;

  await sendEmail({
    to,
    subject: `Overdue review: ${args.documentTitle}`,
    html: renderEmail({
      heading: "A review is overdue",
      body: `<p>Your review of <strong>${title}</strong> is overdue by <strong>${dayLabel}</strong>. Please complete it as soon as possible.</p>`,
      cta: { label: "Review now", url },
    }),
    text: `Your review of "${args.documentTitle}" is overdue by ${dayLabel}. ${url}`,
  });
}

export async function sendAccountApprovedEmail(args: {
  userId: string;
}): Promise<void> {
  const to = await getUserEmail(args.userId);
  if (!to) return;

  const url = buildAppUrl("/dashboard");

  await sendEmail({
    to,
    subject: "Your account has been approved",
    html: renderEmail({
      heading: "Welcome — your account is active",
      body: `<p>An administrator approved your account. You can now sign in and start using the system.</p>`,
      cta: { label: "Go to dashboard", url },
    }),
    text: `Your account has been approved. Sign in: ${url}`,
  });
}

export async function sendAccountRejectedEmail(args: {
  userId: string;
}): Promise<void> {
  const to = await getUserEmail(args.userId);
  if (!to) return;

  await sendEmail({
    to,
    subject: "Your account registration was not approved",
    html: renderEmail({
      heading: "Account registration declined",
      body: `<p>An administrator did not approve your account at this time. If you believe this is a mistake, please contact your administrator.</p>`,
    }),
    text: "Your account registration was not approved. Please contact your administrator if you believe this is a mistake.",
  });
}

export async function sendAdminNewUserEmail(args: {
  adminId: string;
  newUserName: string;
  newUserEmail: string;
}): Promise<void> {
  const to = await getUserEmail(args.adminId);
  if (!to) return;

  const name = escapeHtml(args.newUserName || "(no name provided)");
  const email = escapeHtml(args.newUserEmail);
  const url = buildAppUrl("/admin/users");

  await sendEmail({
    to,
    subject: `New user registration: ${args.newUserName || args.newUserEmail}`,
    html: renderEmail({
      heading: "A new user is awaiting approval",
      body: `
        <p>A new user just registered and is waiting for an administrator to approve their account.</p>
        <ul style="padding-left: 20px;">
          <li><strong>Name:</strong> ${name}</li>
          <li><strong>Email:</strong> ${email}</li>
        </ul>
      `,
      cta: { label: "Review pending users", url },
    }),
    text: `A new user (${args.newUserName || args.newUserEmail}) is awaiting approval. Open: ${url}`,
  });
}
