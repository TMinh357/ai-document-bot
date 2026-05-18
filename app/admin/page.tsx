import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import NotificationBell from "@/components/NotificationBell";
import UserBadge from "@/components/UserBadge";
import ActiveLink from "@/components/ActiveLink";
import { requireRole } from "@/lib/supabase/auth";

export default async function AdminPage() {
  const { supabase, user, profile, role } = await requireRole(["admin"]);

  const [
    { count: userCount },
    { count: documentCount },
    { count: pendingCount },
    { count: logCount },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("documents").select("*", { count: "exact", head: true }),
    supabase
      .from("approvals")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase.from("audit_logs").select("*", { count: "exact", head: true }),
  ]);

  return (
    <main className="page-shell text-gray-900">
      <div className="page-container">
        <div className="topbar mb-8">
          <div>
            <p className="eyebrow">Administration</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900">
              Admin Panel
            </h1>
            <p className="muted-copy mt-2">
              System management for {profile?.full_name || user.email}
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

        <div className="grid gap-4 md:grid-cols-4">
          <div className="metric-card rounded-[1.75rem] p-6">
            <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-gray-600">
              Users
            </h2>
            <p className="mt-3 text-4xl font-semibold text-gray-900">
              {userCount ?? 0}
            </p>
            <p className="muted-copy mt-2 text-sm">Registered accounts</p>
          </div>

          <div className="metric-card rounded-[1.75rem] p-6">
            <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-gray-600">
              Documents
            </h2>
            <p className="mt-3 text-4xl font-semibold text-gray-900">
              {documentCount ?? 0}
            </p>
            <p className="muted-copy mt-2 text-sm">All documents in system</p>
          </div>

          <div className="metric-card rounded-[1.75rem] p-6">
            <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-gray-600">
              Pending Reviews
            </h2>
            <p className="mt-3 text-4xl font-semibold text-gray-900">
              {pendingCount ?? 0}
            </p>
            <p className="muted-copy mt-2 text-sm">Awaiting reviewer action</p>
          </div>

          <div className="metric-card rounded-[1.75rem] p-6">
            <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-gray-600">
              Audit Logs
            </h2>
            <p className="mt-3 text-4xl font-semibold text-gray-900">
              {logCount ?? 0}
            </p>
            <p className="muted-copy mt-2 text-sm">Total recorded actions</p>
          </div>
        </div>

        <div className="mt-6 section-card rounded-[2rem] p-6 md:p-8">
          <h2 className="text-2xl font-semibold text-gray-900">
            Management Sections
          </h2>
          <p className="muted-copy mt-2 text-sm">
            Navigate to each section to manage the system.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Link
              href="/admin/users"
              className="metric-card rounded-[1.5rem] p-5 hover:-translate-y-0.5"
            >
              <h3 className="text-lg font-semibold text-gray-900">
                User Management
              </h3>
              <p className="muted-copy mt-2 text-sm leading-6">
                View all users, see their roles, and change permissions.
              </p>
            </Link>

            <Link
              href="/admin/documents"
              className="metric-card rounded-[1.5rem] p-5 hover:-translate-y-0.5"
            >
              <h3 className="text-lg font-semibold text-gray-900">
                All Documents
              </h3>
              <p className="muted-copy mt-2 text-sm leading-6">
                Browse every document in the system regardless of owner.
              </p>
            </Link>

            <Link
              href="/admin/approvals"
              className="metric-card rounded-[1.5rem] p-5 hover:-translate-y-0.5"
            >
              <h3 className="text-lg font-semibold text-gray-900">
                All Approvals
              </h3>
              <p className="muted-copy mt-2 text-sm leading-6">
                Monitor every approval request and decision across reviewers.
              </p>
            </Link>

            <Link
              href="/admin/audit-logs"
              className="metric-card rounded-[1.5rem] p-5 hover:-translate-y-0.5"
            >
              <h3 className="text-lg font-semibold text-gray-900">
                Audit Logs
              </h3>
              <p className="muted-copy mt-2 text-sm leading-6">
                Full activity history of every action taken in the system.
              </p>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
