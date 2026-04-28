import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";

export default async function ReviewsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: approvals } = await supabase
    .from("approvals")
    .select(
      `
      id,
      status,
      created_at,
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
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-gray-100 p-8 text-gray-900">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Review Queue
            </h1>

            <p className="text-gray-600">
              Documents assigned to you for review.
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 hover:bg-gray-50"
            >
              Dashboard
            </Link>

            <LogoutButton />
          </div>
        </div>

        <div className="rounded-2xl bg-white shadow">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900">Pending Reviews</h2>
          </div>

          <div className="divide-y divide-gray-200">
            {approvals && approvals.length > 0 ? (
              approvals.map((approval) => {
                const document = Array.isArray(approval.document)
                  ? approval.document[0]
                  : approval.document;

                if (!document) {
                  return null;
                }

                return (
                  <div
                    key={approval.id}
                    className="flex items-center justify-between gap-4 p-4"
                  >
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {document.title}
                      </h3>

                      <p className="text-sm text-gray-600">
                        {document.description || "No description provided"}
                      </p>

                      <p className="mt-1 text-xs text-gray-500">
                        Assigned at:{" "}
                        {new Date(approval.created_at).toLocaleString()}
                      </p>
                    </div>

                    <Link
                      href={`/documents/${document.id}`}
                      className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                    >
                      Review
                    </Link>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-gray-600">
                No pending reviews assigned to you.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}