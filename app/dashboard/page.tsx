import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import NotificationPanel from "@/components/NotificationPanel";
import { requireUser } from "@/lib/supabase/auth";

export default async function DashboardPage() {
  const { supabase, user, profile, role } = await requireUser();

  const isAdmin = role === "admin";
  const canReview = role === "reviewer" || role === "admin";

  const documentCountQuery = supabase
    .from("documents")
    .select("*", { count: "exact", head: true });

  const { count: documentCount } = isAdmin
    ? await documentCountQuery
    : await documentCountQuery.eq("owner_id", user.id);

  const { count: pendingReviewCount } = canReview
    ? await supabase
        .from("approvals")
        .select("*", { count: "exact", head: true })
        .eq("reviewer_id", user.id)
        .eq("status", "pending")
    : { count: 0 };

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, type, title, message, document_id, is_read, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const unreadCount = (notifications ?? []).filter((n) => !n.is_read).length;

  const documentsCaption = isAdmin
    ? "Total documents in the system"
    : "Documents you own";

  return (
    <main className="page-shell text-gray-900">
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
            <Link href="/documents" className="button-secondary">
              Documents
            </Link>

            {canReview && (
              <Link href="/reviews" className="button-secondary">
                Reviews
              </Link>
            )}

            {isAdmin && (
              <Link href="/admin" className="button-primary">
                Admin Panel
              </Link>
            )}

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
                {pendingReviewCount ?? 0}
              </p>

              <p className="muted-copy mt-2 text-sm">
                Documents assigned to you for review
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

        <div className="mt-6">
          <NotificationPanel initial={notifications ?? []} />
        </div>
      </div>
    </main>
  );
}
