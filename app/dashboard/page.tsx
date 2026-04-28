import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const { count: documentCount } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true });

  const { count: pendingReviewCount } = await supabase
    .from("approvals")
    .select("*", { count: "exact", head: true })
    .eq("reviewer_id", user.id)
    .eq("status", "pending");

  return (
    <main className="min-h-screen bg-gray-100 p-8 text-gray-900">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>

            <p className="text-gray-600">
              Welcome, {profile?.full_name || user.email}
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/documents"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 hover:bg-gray-50"
            >
              Documents
            </Link>

            <Link
              href="/reviews"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 hover:bg-gray-50"
            >
              Reviews
            </Link>

            <LogoutButton />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-6 shadow">
            <h2 className="font-semibold text-gray-900">Documents</h2>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {documentCount ?? 0}
            </p>

            <p className="text-sm text-gray-600">
              Total documents in the system
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow">
            <h2 className="font-semibold text-gray-900">Pending Reviews</h2>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {pendingReviewCount ?? 0}
            </p>

            <p className="text-sm text-gray-600">
              Documents assigned to you for review
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow">
            <h2 className="font-semibold text-gray-900">User Role</h2>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {profile?.role || "employee"}
            </p>

            <p className="text-sm text-gray-600">
              Current permission level
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-white p-6 shadow">
          <h2 className="text-xl font-semibold text-gray-900">Quick Actions</h2>

          <p className="mt-1 text-sm text-gray-600">
            Access the main features of the document review system.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Link
              href="/documents"
              className="rounded-xl border border-gray-300 p-5 transition hover:bg-gray-50"
            >
              <h3 className="font-semibold text-gray-900">
                Manage Documents
              </h3>

              <p className="mt-1 text-sm text-gray-600">
                Create, view, upload, and manage document records.
              </p>
            </Link>

            <Link
              href="/reviews"
              className="rounded-xl border border-gray-300 p-5 transition hover:bg-gray-50"
            >
              <h3 className="font-semibold text-gray-900">Review Queue</h3>

              <p className="mt-1 text-sm text-gray-600">
                View documents assigned to you and make review decisions.
              </p>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}