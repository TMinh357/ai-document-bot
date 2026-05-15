import LogoutButton from "@/components/LogoutButton";
import NotificationPanel from "@/components/NotificationPanel";
import NotificationBell from "@/components/NotificationBell";
import UserBadge from "@/components/UserBadge";
import ActiveLink from "@/components/ActiveLink";
import { requireUser } from "@/lib/supabase/auth";

export default async function NotificationsPage() {
  const { supabase, user, profile, role } = await requireUser();

  const isAdmin = role === "admin";
  const canReview = role === "reviewer" || role === "admin";

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, type, title, message, document_id, is_read, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="page-shell text-gray-900">
      <div className="page-container">
        <div className="topbar mb-8">
          <div>
            <p className="eyebrow">Inbox</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900">
              All Notifications
            </h1>

            <p className="muted-copy mt-2">
              Recent activity across your documents and reviews.
            </p>
          </div>

          <div className="topbar-nav">
            <ActiveLink href="/dashboard" className="button-secondary">
              Dashboard
            </ActiveLink>

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

        <NotificationPanel initial={notifications ?? []} />
      </div>
    </main>
  );
}
