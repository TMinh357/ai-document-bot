import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import NotificationBell from "@/components/NotificationBell";
import UserBadge from "@/components/UserBadge";
import ActiveLink from "@/components/ActiveLink";
import DashboardCharts from "@/components/DashboardCharts";
import DashboardRealtime from "@/components/DashboardRealtime";
import FormattedDate from "@/components/FormattedDate";
import { requireUser } from "@/lib/supabase/auth";
import { fireOverdueReminders } from "@/lib/review-reminders";

const NEAR_DUE_HOURS = 24;

export default async function DashboardPage() {
  const { supabase, user, profile, role } = await requireUser();

  const isAdmin = role === "admin";
  const canReview = role === "reviewer" || role === "admin";

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

  // All queries below are independent, so run them in parallel.
  const documentCountQuery = supabase
    .from("documents")
    .select("*", { count: "exact", head: true });
  const documentCountPromise = isAdmin
    ? documentCountQuery
    : documentCountQuery.eq("owner_id", user.id);

  const pendingReviewsPromise = canReview
    ? supabase
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
    : Promise.resolve({ data: [] as PendingReviewRow[] });

  const unreadPromise = supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  // Always owner-scoped (every role), so the "Awaiting Review" / "Needs
  // Revision" quick-action cards count the user's OWN documents and therefore
  // match the owner-scoped /documents?status=... page they deep-link to. This
  // is distinct from chartDocs, which is system-wide for admins.
  const ownedStatusPromise = supabase
    .from("documents")
    .select("status")
    .eq("owner_id", user.id);

  const chartDocsQuery = supabase
    .from("documents")
    .select("status, created_at");
  const chartDocsPromise = isAdmin
    ? chartDocsQuery
    : chartDocsQuery.eq("owner_id", user.id);

  const approvalRatioQuery = supabase.from("approvals").select("status");
  const approvalRatioPromise = canReview
    ? isAdmin
      ? approvalRatioQuery
      : approvalRatioQuery.eq("reviewer_id", user.id)
    : Promise.resolve({ data: null as { status: string }[] | null });

  // Fire-and-forget: reminders are side effects, the dashboard doesn't need to wait.
  if (canReview) {
    void fireOverdueReminders(user.id);
  }
  const remindersPromise = Promise.resolve();

  const [
    documentCountResult,
    pendingReviewsResult,
    unreadResult,
    chartDocsResult,
    approvalRatioResult,
    ownedStatusResult,
  ] = await Promise.all([
    documentCountPromise,
    pendingReviewsPromise,
    unreadPromise,
    chartDocsPromise,
    approvalRatioPromise,
    ownedStatusPromise,
    remindersPromise,
  ]);

  const documentCount = documentCountResult.count;
  const pendingReviews = (pendingReviewsResult.data || []) as PendingReviewRow[];
  const unreadCount = unreadResult.count ?? 0;
  const chartDocs = chartDocsResult.data;
  const ratioData = approvalRatioResult.data;

  // Owner-scoped counts for the quick-action cards (the user's own documents).
  const ownedDocs = (ownedStatusResult.data ?? []) as { status: string }[];
  const ownedPending = ownedDocs.filter((d) => d.status === "pending").length;
  const ownedRejected = ownedDocs.filter((d) => d.status === "rejected").length;

  const pendingReviewCount = pendingReviews.length;
  const now = new Date();
  const nowMs = now.getTime();
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

  const documentsCaption = isAdmin
    ? "Total documents in the system"
    : "Documents you own";
  const dashboardIntro = isAdmin
    ? "Monitor academic submissions, reviewer workload, approvals, and audit activity across the department."
    : canReview
      ? "Review assigned academic submissions, add feedback, and record approval decisions."
      : "Track your research proposals, project reports, and academic submissions through review.";

  const statusCounts = {
    draft: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  };

  (chartDocs ?? []).forEach((d) => {
    if (d.status in statusCounts) {
      statusCounts[d.status as keyof typeof statusCounts]++;
    }
  });

  const monthlyCounts: { key: string; label: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const month = d.toLocaleDateString("en-US", { month: "short" });
    const yearShort = d.getFullYear().toString().slice(-2);
    const label = `${month} '${yearShort}`;
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
            <p className="muted-copy mt-2">{dashboardIntro}</p>
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

        <div
          className={`grid gap-4 ${canReview ? "md:grid-cols-3" : "md:grid-cols-2"}`}
        >
          <div className="metric-card rounded-[1.75rem] p-6">
            <h2 className="text-sm font-medium text-gray-500">
              Documents
            </h2>

            <p className="mt-3 text-4xl font-semibold text-gray-900">
              {documentCount ?? 0}
            </p>

            <p className="muted-copy mt-2 text-sm">{documentsCaption}</p>
          </div>

          {canReview && (
            <div className="metric-card rounded-[1.75rem] p-6">
              <h2 className="text-sm font-medium text-gray-500">
                Pending Reviews
              </h2>

              <p className="mt-3 text-4xl font-semibold text-gray-900">
                {pendingReviewCount}
              </p>

              <p className="muted-copy mt-2 text-sm">
                Documents assigned to you for review
                {overdueCount > 0 && (
                  <>
                    {" - "}
                    <span className="font-semibold text-red-600">
                      {overdueCount} overdue
                    </span>
                  </>
                )}
                {dueSoonCount > 0 && (
                  <>
                    {" - "}
                    <span className="font-semibold text-amber-600">
                      {dueSoonCount} due soon
                    </span>
                  </>
                )}
              </p>
            </div>
          )}

          <div className="metric-card rounded-[1.75rem] p-6">
            <h2 className="text-sm font-medium text-gray-500">
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
                        {row.due_at ? (
                          <>
                            Deadline: <FormattedDate value={row.due_at} />
                          </>
                        ) : (
                          "No deadline set"
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
              })}
            </div>
          </div>
        )}

        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
          <p className="muted-copy mt-1 text-sm">
            Continue the academic document approval workflow.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {canReview && (
              <Link href="/reviews" className="metric-card p-5">
                <h3 className="text-base font-semibold text-gray-900">
                  Review Queue
                </h3>
                <p className="muted-copy mt-1.5 text-sm leading-6">
                  Open academic documents awaiting your decision.
                </p>
              </Link>
            )}

            <Link href="/documents/new" className="metric-card p-5">
              <h3 className="text-base font-semibold text-gray-900">
                Create Academic Document
              </h3>
              <p className="muted-copy mt-1.5 text-sm leading-6">
                Upload a proposal, project report, or internship report and
                start the review workflow.
              </p>
            </Link>

            <Link href="/documents" className="metric-card p-5">
              <h3 className="text-base font-semibold text-gray-900">
                Manage Academic Documents
              </h3>
              <p className="muted-copy mt-1.5 text-sm leading-6">
                View submitted documents, versions, review status, and
                approval evidence.
              </p>
            </Link>

            <Link href="/documents?status=pending" className="metric-card p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">
                  Awaiting Review
                </h3>
                <span className="inline-flex min-w-6 items-center justify-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  {ownedPending}
                </span>
              </div>
              <p className="muted-copy mt-1.5 text-sm leading-6">
                Your documents currently in review, pending a decision.
              </p>
            </Link>

            {ownedRejected > 0 && (
              <Link
                href="/documents?status=rejected"
                className="metric-card p-5"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900">
                    Needs Revision
                  </h3>
                  <span className="inline-flex min-w-6 items-center justify-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                    {ownedRejected}
                  </span>
                </div>
                <p className="muted-copy mt-1.5 text-sm leading-6">
                  Documents a reviewer rejected. Upload a new version to resubmit.
                </p>
              </Link>
            )}

            {canReview && (
              <div className="metric-card p-5">
                <h3 className="text-base font-semibold text-gray-900">
                  Review Guidance
                </h3>
                <p className="muted-copy mt-1.5 text-sm leading-6">
                  Add passage comments, explain rejection reasons, and approve
                  only after verifying the current version.
                </p>
              </div>
            )}

            {isAdmin && (
              <Link
                href="/admin"
                className="metric-card p-5 md:col-span-2"
              >
                <h3 className="text-base font-semibold text-gray-900">
                  Admin Panel
                </h3>
                <p className="muted-copy mt-1.5 text-sm leading-6">
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
