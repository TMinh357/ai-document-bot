import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SubmitForReviewForm from "@/components/SubmitForReviewForm";
import ReviewActions from "@/components/ReviewActions";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type ReviewerProfile = {
  id: string;
  full_name: string | null;
  role: string;
};

export default async function DocumentDetailPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: document } = await supabase
    .from("documents")
    .select("id, title, description, status, created_at, updated_at, owner_id")
    .eq("id", id)
    .single();

  if (!document) {
    redirect("/documents");
  }

  const { data: versions } = await supabase
    .from("document_versions")
    .select("id, version_no, file_path, created_at")
    .eq("document_id", id)
    .order("version_no", { ascending: false });

  const versionsWithUrls = await Promise.all(
    (versions || []).map(async (version) => {
      if (!version.file_path) {
        return {
          ...version,
          signedUrl: null,
        };
      }

      const { data } = await supabase.storage
        .from("documents")
        .createSignedUrl(version.file_path, 60 * 10);

      return {
        ...version,
        signedUrl: data?.signedUrl || null,
      };
    })
  );

  const { data: reviewers } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .in("role", ["reviewer", "admin"])
    .neq("id", user.id);

  const { data: approvals } = await supabase
    .from("approvals")
    .select("id, reviewer_id, status, comment, created_at, reviewed_at")
    .eq("document_id", id)
    .order("created_at", { ascending: false });

  const reviewerIds = Array.from(
    new Set((approvals || []).map((approval) => approval.reviewer_id))
  );

  let reviewerProfiles: ReviewerProfile[] = [];

  if (reviewerIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("id", reviewerIds);

    reviewerProfiles = data || [];
  }

  const reviewerNameMap = new Map(
    reviewerProfiles.map((profile) => [
      profile.id,
      profile.full_name || profile.id,
    ])
  );

  const { data: currentApproval } = await supabase
    .from("approvals")
    .select("id, status, reviewer_id, comment")
    .eq("document_id", id)
    .eq("reviewer_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  const { data: auditLogs } = await supabase
    .from("audit_logs")
    .select("id, action, created_at, metadata")
    .eq("target_table", "documents")
    .eq("target_id", id)
    .order("created_at", { ascending: false });

  const isOwner = document.owner_id === user.id;
  const canReview =
    document.status === "pending" && currentApproval?.status === "pending";

  return (
    <main className="min-h-screen bg-gray-100 p-8 text-gray-900">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/documents" className="text-sm text-blue-600 hover:underline">
            ← Back to Documents
          </Link>

          <Link
            href="/dashboard"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 hover:bg-gray-50"
          >
            Dashboard
          </Link>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {document.title}
              </h1>

              <p className="mt-2 text-gray-600">
                {document.description || "No description provided"}
              </p>
            </div>

            <span className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-800">
              {document.status}
            </span>
          </div>

          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-gray-300 p-4">
              <p className="text-sm text-gray-600">Created At</p>
              <p className="font-medium text-gray-900">
                {new Date(document.created_at).toLocaleString()}
              </p>
            </div>

            <div className="rounded-xl border border-gray-300 p-4">
              <p className="text-sm text-gray-600">Last Updated</p>
              <p className="font-medium text-gray-900">
                {new Date(document.updated_at).toLocaleString()}
              </p>
            </div>

            <div className="rounded-xl border border-gray-300 p-4">
              <p className="text-sm text-gray-600">Document ID</p>
              <p className="break-all font-mono text-sm text-gray-900">
                {document.id}
              </p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              Uploaded Files
            </h2>

            <div className="divide-y divide-gray-200 rounded-xl border border-gray-300">
              {versionsWithUrls.length > 0 ? (
                versionsWithUrls.map((version) => (
                  <div
                    key={version.id}
                    className="flex items-center justify-between gap-4 p-4"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        Version {version.version_no}
                      </p>

                      <p className="text-xs text-gray-600">
                        Uploaded at:{" "}
                        {new Date(version.created_at).toLocaleString()}
                      </p>

                      <p className="mt-1 break-all text-xs text-gray-500">
                        {version.file_path}
                      </p>
                    </div>

                    {version.signedUrl ? (
                      <a
                        href={version.signedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                      >
                        View PDF
                      </a>
                    ) : (
                      <span className="text-sm text-gray-500">
                        No file available
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-4 text-gray-600">
                  No uploaded files available.
                </div>
              )}
            </div>
          </div>

          {isOwner && (
            <SubmitForReviewForm
              documentId={document.id}
              currentStatus={document.status}
              reviewers={reviewers || []}
            />
          )}

          {canReview && currentApproval && (
            <ReviewActions
              documentId={document.id}
              approvalId={currentApproval.id}
            />
          )}

          <div className="mt-8 rounded-xl border border-gray-300 p-5">
            <h2 className="text-xl font-semibold text-gray-900">
              Approval History
            </h2>

            <p className="mt-1 text-sm text-gray-600">
              Review requests and decisions related to this document.
            </p>

            <div className="mt-4 divide-y divide-gray-200 rounded-xl border border-gray-200">
              {approvals && approvals.length > 0 ? (
                approvals.map((approval) => (
                  <div key={approval.id} className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium text-gray-900">
                          Reviewer:{" "}
                          {reviewerNameMap.get(approval.reviewer_id) ||
                            approval.reviewer_id}
                        </p>

                        <p className="text-sm text-gray-600">
                          Requested at:{" "}
                          {new Date(approval.created_at).toLocaleString()}
                        </p>

                        {approval.reviewed_at && (
                          <p className="text-sm text-gray-600">
                            Reviewed at:{" "}
                            {new Date(approval.reviewed_at).toLocaleString()}
                          </p>
                        )}
                      </div>

                      <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-800">
                        {approval.status}
                      </span>
                    </div>

                    {approval.comment && (
                      <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                        {approval.comment}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-4 text-gray-600">
                  No approval history available.
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-gray-300 p-5">
            <h2 className="text-xl font-semibold text-gray-900">
              Activity Log
            </h2>

            <p className="mt-1 text-sm text-gray-600">
              System actions recorded for this document.
            </p>

            <div className="mt-4 divide-y divide-gray-200 rounded-xl border border-gray-200">
              {auditLogs && auditLogs.length > 0 ? (
                auditLogs.map((log) => (
                  <div key={log.id} className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-medium text-gray-900">
                        {log.action}
                      </p>

                      <p className="text-sm text-gray-600">
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-gray-600">
                  No activity logs available.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}