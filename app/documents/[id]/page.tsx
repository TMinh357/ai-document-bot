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
    <main className="page-shell text-gray-900">
      <div className="page-container max-w-6xl">
        <div className="topbar mb-6">
          <Link
            href="/documents"
            className="text-sm font-medium text-teal-700 hover:text-teal-800"
          >
            Back to Documents
          </Link>

          <Link href="/dashboard" className="button-secondary">
            Dashboard
          </Link>
        </div>

        <section className="hero-panel rounded-[2rem] p-8 md:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="eyebrow">Document Detail</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-gray-900 md:text-5xl">
                {document.title}
              </h1>

              <p className="muted-copy mt-4 text-lg leading-8">
                {document.description || "No description provided"}
              </p>
            </div>

            <span className="status-pill self-start">{document.status}</span>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="metric-card rounded-[1.5rem] p-5">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-gray-600">
                Created At
              </p>
              <p className="mt-3 font-medium text-gray-900">
                {new Date(document.created_at).toLocaleString()}
              </p>
            </div>

            <div className="metric-card rounded-[1.5rem] p-5">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-gray-600">
                Last Updated
              </p>
              <p className="mt-3 font-medium text-gray-900">
                {new Date(document.updated_at).toLocaleString()}
              </p>
            </div>

            <div className="metric-card rounded-[1.5rem] p-5">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-gray-600">
                Document ID
              </p>
              <p className="mt-3 break-all font-mono text-sm text-gray-900">
                {document.id}
              </p>
            </div>
          </div>
        </section>

        <section className="section-card mt-6 rounded-[2rem] p-6 md:p-8">
          <h2 className="text-2xl font-semibold text-gray-900">Uploaded Files</h2>

          <div className="data-list mt-5 overflow-hidden rounded-[1.5rem] border border-gray-200/70">
            {versionsWithUrls.length > 0 ? (
              versionsWithUrls.map((version) => (
                <div
                  key={version.id}
                  className="flex flex-col gap-5 px-5 py-5 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-lg font-semibold text-gray-900">
                      Version {version.version_no}
                    </p>

                    <p className="muted-copy mt-2 text-sm">
                      Uploaded at: {new Date(version.created_at).toLocaleString()}
                    </p>

                    <p className="mt-2 break-all font-mono text-xs text-gray-500">
                      {version.file_path}
                    </p>
                  </div>

                  {version.signedUrl ? (
                    <a
                      href={version.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="button-primary text-sm"
                    >
                      View PDF
                    </a>
                  ) : (
                    <span className="text-sm text-gray-500">No file available</span>
                  )}
                </div>
              ))
            ) : (
              <div className="px-5 py-6 text-gray-600">
                No uploaded files available.
              </div>
            )}
          </div>
        </section>

        {isOwner && (
          <SubmitForReviewForm
            documentId={document.id}
            currentStatus={document.status}
            reviewers={reviewers || []}
          />
        )}

        {canReview && currentApproval && (
          <ReviewActions documentId={document.id} approvalId={currentApproval.id} />
        )}

        <section className="section-card mt-6 rounded-[2rem] p-6 md:p-8">
          <h2 className="text-2xl font-semibold text-gray-900">
            Approval History
          </h2>

          <p className="muted-copy mt-2 text-sm">
            Review requests and decisions related to this document.
          </p>

          <div className="data-list mt-5 overflow-hidden rounded-[1.5rem] border border-gray-200/70">
            {approvals && approvals.length > 0 ? (
              approvals.map((approval) => (
                <div key={approval.id} className="px-5 py-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-gray-900">
                        Reviewer:{" "}
                        {reviewerNameMap.get(approval.reviewer_id) ||
                          approval.reviewer_id}
                      </p>

                      <p className="muted-copy mt-2 text-sm">
                        Requested at: {new Date(approval.created_at).toLocaleString()}
                      </p>

                      {approval.reviewed_at && (
                        <p className="muted-copy mt-1 text-sm">
                          Reviewed at:{" "}
                          {new Date(approval.reviewed_at).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <span className="status-pill self-start">{approval.status}</span>
                  </div>

                  {approval.comment && (
                    <p className="mt-4 rounded-[1.25rem] bg-white/70 p-4 text-sm leading-6 text-gray-700">
                      {approval.comment}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <div className="px-5 py-6 text-gray-600">
                No approval history available.
              </div>
            )}
          </div>
        </section>

        <section className="section-card mt-6 rounded-[2rem] p-6 md:p-8">
          <h2 className="text-2xl font-semibold text-gray-900">Activity Log</h2>

          <p className="muted-copy mt-2 text-sm">
            System actions recorded for this document.
          </p>

          <div className="data-list mt-5 overflow-hidden rounded-[1.5rem] border border-gray-200/70">
            {auditLogs && auditLogs.length > 0 ? (
              auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-col gap-2 px-5 py-5 md:flex-row md:items-center md:justify-between"
                >
                  <p className="font-semibold text-gray-900">{log.action}</p>

                  <p className="muted-copy text-sm">
                    {new Date(log.created_at).toLocaleString()}
                  </p>
                </div>
              ))
            ) : (
              <div className="px-5 py-6 text-gray-600">
                No activity logs available.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
