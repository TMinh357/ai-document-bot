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
            <Link href="/dashboard" className="button-secondary">
              Dashboard
            </Link>

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

                return (
                  <div
                    key={approval.id}
                    className="flex flex-col gap-5 px-6 py-5 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {document.title}
                      </h3>

                      <p className="muted-copy mt-2 text-sm leading-6">
                        {document.description || "No description provided"}
                      </p>

                      <p className="mt-2 text-xs uppercase tracking-[0.14em] text-gray-500">
                        Assigned at:{" "}
                        {new Date(approval.created_at).toLocaleString()}
                      </p>
                    </div>

                    <Link
                      href={`/documents/${document.id}`}
                      className="button-primary text-sm"
                    >
                      Review
                    </Link>
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
