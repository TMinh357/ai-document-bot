import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";
import NotificationBell from "@/components/NotificationBell";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default async function AdminApprovalsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (callerProfile?.role !== "admin") redirect("/dashboard");

  const [{ data: approvals }, { data: documents }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("approvals")
        .select("id, document_id, reviewer_id, status, comment, created_at, reviewed_at")
        .order("created_at", { ascending: false }),
      supabase.from("documents").select("id, title"),
      supabase.from("profiles").select("id, full_name"),
    ]);

  const docMap = new Map((documents ?? []).map((d) => [d.id, d.title]));
  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name])
  );

  return (
    <main className="page-shell text-gray-900">
      <div className="page-container">
        <div className="topbar mb-8">
          <div>
            <p className="eyebrow">Administration</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900">
              All Approvals
            </h1>
            <p className="muted-copy mt-2">
              Every approval request and decision across all reviewers.
            </p>
          </div>

          <div className="topbar-nav">
            <Link href="/admin" className="button-secondary">
              Admin Panel
            </Link>
            <NotificationBell />
            <LogoutButton />
          </div>
        </div>

        <div className="section-card overflow-hidden rounded-[2rem]">
          <div className="border-b border-gray-200/70 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-900">
              Approvals{" "}
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({approvals?.length ?? 0})
              </span>
            </h2>
          </div>

          <div className="data-list">
            {approvals && approvals.length > 0 ? (
              approvals.map((approval) => (
                <div
                  key={approval.id}
                  className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-start md:justify-between"
                >
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900">
                      {docMap.get(approval.document_id) ?? "Unknown Document"}
                    </h3>

                    <div className="mt-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.14em] text-gray-400">
                      <span>
                        Reviewer:{" "}
                        <span className="font-medium text-gray-600">
                          {profileMap.get(approval.reviewer_id) ?? "Unknown"}
                        </span>
                      </span>
                      <span>
                        Requested:{" "}
                        {new Date(approval.created_at).toLocaleString()}
                      </span>
                      {approval.reviewed_at && (
                        <span>
                          Reviewed:{" "}
                          {new Date(approval.reviewed_at).toLocaleString()}
                        </span>
                      )}
                    </div>

                    {approval.comment && (
                      <p className="mt-3 rounded-xl border border-gray-200 bg-white/60 px-4 py-3 text-sm text-gray-700">
                        <span className="font-medium text-gray-500">
                          Comment:{" "}
                        </span>
                        {approval.comment}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_COLORS[approval.status] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {approval.status}
                    </span>
                    <Link
                      href={`/documents/${approval.document_id}`}
                      className="button-secondary text-sm"
                    >
                      View Doc
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-10 text-center text-gray-600">
                No approvals found.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
