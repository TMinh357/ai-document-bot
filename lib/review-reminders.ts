import { createAdminClient } from "@/lib/supabase/admin";
import { sendReviewOverdueEmail } from "@/lib/email";

const REMINDER_THROTTLE_HOURS = 24;

type OverdueRow = {
  id: string;
  document_id: string;
  due_at: string | null;
  last_reminded_at: string | null;
  documents: { title: string | null } | { title: string | null }[] | null;
};

export async function fireOverdueReminders(reviewerId: string): Promise<void> {
  const admin = createAdminClient();

  const nowIso = new Date().toISOString();
  const throttleCutoffIso = new Date(
    Date.now() - REMINDER_THROTTLE_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data: overdueRows } = await admin
    .from("approvals")
    .select(
      "id, document_id, due_at, last_reminded_at, documents(title)"
    )
    .eq("reviewer_id", reviewerId)
    .eq("status", "pending")
    .not("due_at", "is", null)
    .lt("due_at", nowIso)
    .or(
      `last_reminded_at.is.null,last_reminded_at.lt.${throttleCutoffIso}`
    );

  if (!overdueRows || overdueRows.length === 0) {
    return;
  }

  const now = new Date();

  for (const row of overdueRows as OverdueRow[]) {
    const document = Array.isArray(row.documents)
      ? row.documents[0]
      : row.documents;

    const title = document?.title || "(untitled)";
    const dueAt = row.due_at ? new Date(row.due_at) : null;
    const overdueDays = dueAt
      ? Math.max(
          1,
          Math.floor((now.getTime() - dueAt.getTime()) / (24 * 60 * 60 * 1000))
        )
      : 0;

    await admin.from("notifications").insert({
      user_id: reviewerId,
      type: "review_overdue",
      title: "Review Overdue",
      message: `Your review of "${title}" is overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}. Please complete it as soon as possible.`,
      document_id: row.document_id,
    });

    await sendReviewOverdueEmail({
      reviewerId,
      documentId: row.document_id,
      documentTitle: title,
      overdueDays,
    });

    await admin
      .from("approvals")
      .update({ last_reminded_at: now.toISOString() })
      .eq("id", row.id);
  }
}
