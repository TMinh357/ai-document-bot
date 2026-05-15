import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import NotificationBell from "@/components/NotificationBell";
import UserBadge from "@/components/UserBadge";
import ActiveLink from "@/components/ActiveLink";
import DashboardCharts from "@/components/DashboardCharts";
import DashboardRealtime from "@/components/DashboardRealtime";
import { requireUser } from "@/lib/supabase/auth";
import { fireOverdueReminders } from "@/lib/review-reminders";

const NEAR_DUE_HOURS = 24;

export default async function DashboardPage() {
  const { supabase, user, profile, role } = await requireUser();

  const isAdmin = role === "admin";
  const canReview = role === "reviewer" || role === "admin";

  if (canReview) {
    await fireOverdueReminders(user.id);
  }

  const documentCountQuery = supabase
    .from("documents")
    .select("*", { count: "exact", head: true });

  const { count: documentCount } = isAdmin
    ? await documentCountQuery
    : await documentCountQuery.eq("owner_id", user.id);

  const { data: myPendingReviews } = canReview
    ? await supabase
        .from("approvals")
        .select(
          `
          id,
          due_at,
          round_no,
          created_at,
          document:documents (
            id,
            title,
            status
          )
        `
        )
        .eq("reviewer_id", user.id)
        .eq("status", "pending")
        .order("due_at", { ascending: true, nullsFirst: false })
    : { data: [] };

  type PendingReviewRow = {
    id: string;
    due_at: string | null;
    round_no: number | null;
    created_at: string;
    document:
      | { id: string; title: string | null; status: string }
      | { id: string; title: string | null; status: string }[]
      | null;
  };

  const pendingReviews = (myPendingReviews || []) as PendingReviewRow[];
  const pendingReviewCount = pendingReviews.length;
  const nowMs = Date.now();
  const nearDueMs = NEAR_DUE_HOURS * 60 * 60 * 1000;

  const overdueCount = pendingReviews.filter(
    (r) => r.due_at && new Date(r.due_at).getTime() < nowMs
  ).length;
  const dueSoonCount = pendingReviews.filter(
    (r) =>
      r.due_at &&
      new Date(r.due_at).getTime() >= nowMs &&
      new Date(r.due_at).getTime() - nowMs <= nearDueMs
  ).length;

  const { count: unreadNotificationCount } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  const unreadCount = unreadNotificationCount ?? 0;

  const documentsCaption = isAdmin
    ? "Total documents in the system"
    : "Documents you own";

  const chartDocsQuery = supabase
    .from("documents")
    .select("status, created_at");

  const { data: chartDocs } = isAdmin
    ? await chartDocsQuery
    : await chartDocsQuery.eq("owner_id", user.id);

  const statusCounts = {
    draft: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    signed: 0,
  };

  (chartDocs ?? []).forEach((d) => {
    if (d.status in statusCounts) {
      statusCounts[d.status as keyof typeof statusCounts]++;
    }
  });

  const now = new Date();
  const monthlyCounts: { key: string; label: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });
    monthlyCounts.push({ key, label, count: 0 });
  }

  (chartDocs ?? []).forEach((d) => {
    const date = new Date(d.created_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthlyCounts.find((m) => m.key === key);
    if (bucket) bucket.count++;
  });

  let approvalRatio: {
    approved: number;
    rejected: number;
    pending: number;
  } | null = null;

  if (canReview) {
    const approvalsRatioQuery = supabase.from("approvals").select("status");

    const { data: ratioData } = isAdmin
      ? await approvalsRatioQuery
      : await approvalsRatioQuery.eq("reviewer_id", user.id);

    approvalRatio = { approved: 0, rejected: 0, pending: 0 };

    (ratioData ?? []).forEach((a) => {
      if (
        a.status === "approved" ||
        a.status === "rejected" ||
        a.status === "pending"
      ) {
        approvalRatio![a.status as keyof typeof approvalRatio]++;
      }
    });
  }

  return (
    <main className="page-shell text-gray-900">
      <DashboardRealtime userId={user.id} isAdmin={isAdmin} />
      <div className="page-container">
        <div className="topbar mb-8">
          <div>
            <p className="eyebrow">Workspace Overview</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900">
              Dashboard
            </h1>

            <p className="muted-copy mt-2">
              Welcome, {profile?.full_name || user.email}
            </p>
          </div>

          <div className="topbar-nav">
            <ActiveLink href="/documents" className="button-secondary">
              Documents
            </ActiveLink>

            {canReview && (
              <ActiveLink href="/reviews" className="button-secondary">
                Reviews
              </ActiveLink>
            )}

            {isAdmin && (
              <ActiveLink href="/admin" className="button-primary">
                Admin Panel
              </ActiveLink>
            )}

            <UserBadge
              fullName={profile?.full_name}
              email={user.email}
              role={role}
            />

            <NotificationBell />

            <LogoutButton />
          </div>
        </div>

        <section className="hero-panel rounded-[2rem] p-8 md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="eyebrow">Review Workspace</p>
              <h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-gray-900">
                Keep submissions, reviews, and decisions moving without losing
                context.
              </h2>

              <p className="muted-copy mt-5 max-w-2xl text-lg leading-8">
                Your review pipeline is organized into clear action areas so
                pending work stands out immediately.
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-white/50 bg-white/60 p-6">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-teal-800">
                Signed in as
              </p>
              <p className="mt-3 text-2xl font-semibold text-gray-900">
                {profile?.full_name || user.email}
              </p>
              <p className="muted-copy mt-2 text-sm">
                Role: {role}
              </p>
            </div>
          </div>
        </section>

        <div
          className={`mt-6 grid gap-4 ${canReview ? "md:grid-cols-3" : "md:grid-cols-2"}`}
        >
          <div className="metric-card rounded-[1.75rem] p-6">
            <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-gray-600">
              Documents
            </h2>

            <p className="mt-3 text-4xl font-semibold text-gray-900">
              {documentCount ?? 0}
            </p>

            <p className="muted-copy mt-2 text-sm">{documentsCaption}</p>
          </div>

          {canReview && (
            <div className="metric-card rounded-[1.75rem] p-6">
              <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-gray-600">
                Pending Reviews
              </h2>

              <p className="mt-3 text-4xl font-semibold text-gray-900">
                {pendingReviewCount}
              </p>

              <p className="muted-copy mt-2 text-sm">
                Documents assigned to you for review
                {overdueCount > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold text-red-600">
                      {overdueCount} overdue
                    </span>
                  </>
                )}
                {dueSoonCount > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold text-amber-600">
                      {dueSoonCount} due soon
                    </span>
                  </>
                )}
              </p>
            </div>
          )}

          <div className="metric-card rounded-[1.75rem] p-6">
            <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-gray-600">
              Notifications
            </h2>

            <p className="mt-3 text-4xl font-semibold text-gray-900">
              {unreadCount}
            </p>

            <p className="muted-copy mt-2 text-sm">Unread notifications</p>
          </div>
        </div>

        <DashboardCharts
          statusCounts={statusCounts}
          monthlyCounts={monthlyCounts}
          approvalRatio={approvalRatio}
        />

        {canReview && pendingReviews.length > 0 && (
          <div className="mt-6 section-card rounded-[2rem] p-6 md:p-8">
            <h2 className="text-2xl font-semibold text-gray-900">
              My Pending Reviews
            </h2>
            <p className="muted-copy mt-2 text-sm">
              Sorted by deadline. Overdue reviews are flagged red.
            </p>

            <div className="mt-5 divide-y divide-gray-200 rounded-2xl border border-gray-200">
              {pendingReviews.map((row) => {
                const document = Array.isArray(row.document)
                  ? row.document[0]
                  : row.document;
                if (!document) return null;

                const dueMs = row.due_at
                  ? new Date(row.due_at).getTime()
                  : null;
                const isOverdue = dueMs !== null && dueMs < nowMs;
                const isDueSoon =
                  dueMs !== null &&
                  dueMs >= nowMs &&
                  dueMs - nowMs <= nearDueMs;

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
                    key={row.id}
                    className={`flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between ${
                      isOverdue ? "bg-red-50/40" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900">
                          {document.title || "(untitled)"}
                        </p>
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-700">
                          Round {row.round_no ?? 1}
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-gray-600">
                        {row.due_at
                          ? `Deadline: ${new Date(row.due_at).toLocaleString()}`
                          : "No deadline set"}
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
              })}
            </div>
          </div>
        )}

        <div className="mt-6 section-card rounded-[2rem] p-6 md:p-8">
          <h2 className="text-2xl font-semibold text-gray-900">Quick Actions</h2>

          <p className="muted-copy mt-2 text-sm">
            Access the main features of the document review system.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Link
              href="/documents"
              className="metric-card rounded-[1.5rem] p-5 hover:-translate-y-0.5"
            >
              <h3 className="text-lg font-semibold text-gray-900">
                Manage Documents
              </h3>

              <p className="muted-copy mt-2 text-sm leading-6">
                Create, view, upload, and manage document records.
              </p>
            </Link>

            {canReview && (
              <Link
                href="/reviews"
                className="metric-card rounded-[1.5rem] p-5 hover:-translate-y-0.5"
              >
                <h3 className="text-lg font-semibold text-gray-900">
                  Review Queue
                </h3>

                <p className="muted-copy mt-2 text-sm leading-6">
                  View documents assigned to you and make review decisions.
                </p>
              </Link>
            )}

            {isAdmin && (
              <Link
                href="/admin"
                className="metric-card rounded-[1.5rem] p-5 hover:-translate-y-0.5 md:col-span-2"
              >
                <h3 className="text-lg font-semibold text-teal-700">
                  Admin Panel
                </h3>

                <p className="muted-copy mt-2 text-sm leading-6">
                  Manage users, roles, view all documents, approvals, and audit logs.
                </p>
              </Link>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}
