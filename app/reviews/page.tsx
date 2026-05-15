import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import NotificationBell from "@/components/NotificationBell";
import UserBadge from "@/components/UserBadge";
import ActiveLink from "@/components/ActiveLink";
import { requireRole } from "@/lib/supabase/auth";
import { fireOverdueReminders } from "@/lib/review-reminders";

const NEAR_DUE_HOURS = 24;

export default async function ReviewsPage() {
  const { supabase, user, profile, role } = await requireRole([
    "reviewer",
    "admin",
  ]);

  await fireOverdueReminders(user.id);

  const { data: approvals } = await supabase
    .from("approvals")
    .select(
      `
      id,
      status,
      created_at,
      due_at,
      round_no,
      document:documents (
        id,
        title,
        description,
        status,
        created_at
      )
    `
    )
    .eq("reviewer_id", user.id)
    .eq("status", "pending")
    .order("due_at", { ascending: true, nullsFirst: false });

  return (
    <main className="page-shell text-gray-900">
      <div className="page-container">
        <div className="topbar mb-8">
          <div>
            <p className="eyebrow">Reviewer Queue</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900">
              Review Queue
            </h1>

            <p className="muted-copy mt-2">
              Documents assigned to you for review.
            </p>
          </div>

          <div className="topbar-nav">
            <ActiveLink href="/dashboard" className="button-secondary">
              Dashboard
            </ActiveLink>

            <UserBadge
              fullName={profile?.full_name}
              email={user.email}
              role={role}
            />

            <NotificationBell />

            <LogoutButton />
          </div>
        </div>

        <div className="section-card overflow-hidden rounded-[2rem]">
          <div className="border-b border-gray-200/70 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-900">
              Pending Reviews
            </h2>
          </div>

          <div className="data-list">
            {approvals && approvals.length > 0 ? (
              approvals.map((approval) => {
                const document = Array.isArray(approval.document)
                  ? approval.document[0]
                  : approval.document;

                if (!document) {
                  return null;
                }

                const nowMs = Date.now();
                const dueMs = approval.due_at
                  ? new Date(approval.due_at).getTime()
                  : null;
                const isOverdue = dueMs !== null && dueMs < nowMs;
                const isDueSoon =
                  dueMs !== null &&
                  dueMs >= nowMs &&
                  dueMs - nowMs <= NEAR_DUE_HOURS * 60 * 60 * 1000;

                let dueLabel: string;
                let dueClass: string;

                if (dueMs === null) {
                  dueLabel = "No deadline";
                  dueClass = "bg-gray-100 text-gray-700";
                } else if (isOverdue) {
                  const days = Math.floor(
                    (nowMs - dueMs) / (24 * 60 * 60 * 1000)
                  );
                  dueLabel = `Overdue by ${days === 0 ? "<1 day" : `${days} day${days === 1 ? "" : "s"}`}`;
                  dueClass = "bg-red-100 text-red-800";
                } else if (isDueSoon) {
                  const hours = Math.max(
                    1,
                    Math.floor((dueMs - nowMs) / (60 * 60 * 1000))
                  );
                  dueLabel = `Due in ${hours}h`;
                  dueClass = "bg-amber-100 text-amber-800";
                } else {
                  const days = Math.ceil(
                    (dueMs - nowMs) / (24 * 60 * 60 * 1000)
                  );
                  dueLabel = `Due in ${days} day${days === 1 ? "" : "s"}`;
                  dueClass = "bg-teal-50 text-teal-800";
                }

                return (
                  <div
                    key={approval.id}
                    className={`flex flex-col gap-5 px-6 py-5 md:flex-row md:items-center md:justify-between ${
                      isOverdue ? "bg-red-50/40" : ""
                    }`}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {document.title}
                        </h3>
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-700">
                          Round {approval.round_no ?? 1}
                        </span>
                      </div>

                      <p className="muted-copy mt-2 text-sm leading-6">
                        {document.description || "No description provided"}
                      </p>

                      <p className="mt-2 text-xs uppercase tracking-[0.14em] text-gray-500">
                        Assigned at:{" "}
                        {new Date(approval.created_at).toLocaleString()}
                        {approval.due_at && (
                          <>
                            {" · "}Deadline:{" "}
                            {new Date(approval.due_at).toLocaleString()}
                          </>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${dueClass}`}
                      >
                        {dueLabel}
                      </span>

                      <Link
                        href={`/documents/${document.id}`}
                        className="button-primary text-sm"
                      >
                        Review
                      </Link>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-6 py-10 text-center text-gray-600">
                No pending reviews assigned to you.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
