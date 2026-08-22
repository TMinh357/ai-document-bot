import Link from "next/link";
import { redirect } from "next/navigation";
import SubmitForReviewForm from "@/components/SubmitForReviewForm";
import ReviewActions from "@/components/ReviewActions";
import StatusBadge from "@/components/StatusBadge";
import AIWorkspace from "@/components/AIWorkspace";
import SignDocumentPanel from "@/components/SignDocumentPanel";
import UploadNewVersionForm from "@/components/UploadNewVersionForm";
import DeleteDraftButton from "@/components/DeleteDraftButton";
import PdfViewerLoader from "@/components/PdfViewerLoader";
import type { Highlight } from "@/components/InlinePdfViewer";
import DocumentTimeline, {
  type TimelineEvent,
} from "@/components/DocumentTimeline";
import FormattedDate from "@/components/FormattedDate";
import { requireUser } from "@/lib/supabase/auth";
import { REVIEW_CONTEXT_FALLBACK } from "@/lib/document-copy";

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

type VerificationMetadata = {
  file_missing?: boolean;
  all_hashes_match?: boolean;
  all_crypto_valid?: boolean;
};

function workflowStepClass(status: string): string {
  if (status === "Completed") {
    return "border-green-200 bg-green-50 text-green-800";
  }
  if (status === "Current") {
    return "border-teal-300 bg-teal-50 text-teal-900";
  }
  return "border-gray-200 bg-white text-gray-500";
}

function isCompletedVerification(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const verification = metadata as VerificationMetadata;
  return (
    verification.file_missing === false &&
    verification.all_hashes_match === true &&
    verification.all_crypto_valid === true
  );
}

export default async function DocumentDetailPage({ params }: PageProps) {
  const { id } = await params;

  const { supabase, user, role } = await requireUser();

  // Fetch everything that doesn't depend on anything else in parallel.
  // RLS will return empty for unauthorised rows so this is safe to fan out.
  const [
    { data: currentProfile },
    { data: document },
    { data: assignedApprovals },
    { data: versions },
    { data: reviewers },
    { data: approvals },
    { data: latestAIResult },
    { data: aiMessages },
    { data: signatures },
    { data: latestVerificationLog },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("webauthn_credential_id")
      .eq("id", user.id)
      .single(),
    supabase
      .from("documents")
      .select(
        "id, title, description, status, created_at, updated_at, owner_id, approved_hash"
      )
      .eq("id", id)
      .single(),
    supabase
      .from("approvals")
      .select("id")
      .eq("document_id", id)
      .eq("reviewer_id", user.id)
      .limit(1),
    supabase
      .from("document_versions")
      .select(
        "id, version_no, file_path, content_text, created_at, created_by"
      )
      .eq("document_id", id)
      .order("version_no", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("role", ["reviewer", "admin"])
      .neq("id", user.id),
    supabase
      .from("approvals")
      .select(
        "id, reviewer_id, status, comment, round_no, due_at, created_at, reviewed_at"
      )
      .eq("document_id", id)
      .order("round_no", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("document_ai_results")
      .select("summary, key_points, risk_notes, created_at")
      .eq("document_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("document_ai_messages")
      .select("id, question, answer, created_at")
      .eq("document_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("document_signatures")
      .select(
        "id, signer_id, signature_hash, signature_bytes, algorithm, signed_at"
      )
      .eq("document_id", id)
      .order("signed_at", { ascending: false }),
    supabase
      .from("audit_logs")
      .select("metadata, created_at")
      .eq("target_table", "documents")
      .eq("target_id", id)
      .in("action", ["VERIFY_INTEGRITY", "VERIFY_DOCUMENT_SIGNATURE"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const webAuthnCredentialId = currentProfile?.webauthn_credential_id ?? null;

  if (!document) {
    redirect("/documents");
  }

  const isOwner = document.owner_id === user.id;
  const isAdmin = role === "admin";
  const isAssignedReviewer = !!(assignedApprovals && assignedApprovals.length > 0);

  if (!isOwner && !isAdmin && !isAssignedReviewer) {
    redirect("/documents");
  }

  const latestVersion = versions?.[0];

  // Sign storage URLs for every version in parallel.
  const versionsWithUrls = await Promise.all(
    (versions || []).map(async (version) => {
      if (!version.file_path) {
        return { ...version, signedUrl: null };
      }
      const { data } = await supabase.storage
        .from("documents")
        .createSignedUrl(version.file_path, 60 * 10);
      return { ...version, signedUrl: data?.signedUrl || null };
    })
  );

  const allApprovals = approvals || [];
  const currentRound = allApprovals.reduce(
    (max, a) => Math.max(max, a.round_no ?? 1),
    0
  );
  const currentRoundApprovals = allApprovals.filter(
    (a) => (a.round_no ?? 1) === currentRound
  );
  const currentApproval = currentRoundApprovals.find(
    (a) => a.reviewer_id === user.id && a.status === "pending"
  );
  const approvedCount = currentRoundApprovals.filter(
    (a) => a.status === "approved"
  ).length;
  const pendingCount = currentRoundApprovals.filter(
    (a) => a.status === "pending"
  ).length;
  const rejectedCount = currentRoundApprovals.filter(
    (a) => a.status === "rejected"
  ).length;
  const totalReviewers = currentRoundApprovals.length;

  const { data: rawHighlights } = latestVersion
    ? await supabase
        .from("document_highlights")
        .select(
          "id, document_version_id, reviewer_id, page_number, selected_text, comment, bounding_rects, created_at"
        )
        .eq("document_version_id", latestVersion.id)
        .order("created_at", { ascending: true })
    : { data: [] };

  const canHighlight = !!currentRoundApprovals.find(
    (a) => a.reviewer_id === user.id
  );

  const participantIds = Array.from(
    new Set([
      document.owner_id,
      ...allApprovals.map((a) => a.reviewer_id),
      ...(signatures || []).map((s) => s.signer_id),
      ...(versions || [])
        .map((v) => v.created_by)
        .filter((id): id is string => !!id),
      ...((rawHighlights || []) as Array<{ reviewer_id: string }>).map(
        (h) => h.reviewer_id
      ),
    ])
  );

  let participantProfiles: ReviewerProfile[] = [];

  if (participantIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("id", participantIds);

    participantProfiles = data || [];
  }

  const reviewerNameMap = new Map(
    participantProfiles.map((profile) => [
      profile.id,
      profile.full_name || profile.id,
    ])
  );

  const ownerName = reviewerNameMap.get(document.owner_id) || "Owner";

  const highlights: Highlight[] = ((rawHighlights || []) as Array<{
    id: string;
    document_version_id: string;
    reviewer_id: string;
    page_number: number;
    selected_text: string;
    comment: string;
    bounding_rects: unknown;
    created_at: string;
  }>).map((h) => ({
    id: h.id,
    document_version_id: h.document_version_id,
    reviewer_id: h.reviewer_id,
    reviewer_name: reviewerNameMap.get(h.reviewer_id) || h.reviewer_id,
    page_number: h.page_number,
    selected_text: h.selected_text,
    comment: h.comment,
    bounding_rects: Array.isArray(h.bounding_rects)
      ? (h.bounding_rects as Highlight["bounding_rects"])
      : [],
    created_at: h.created_at,
  }));

  const latestVersionWithUrl = versionsWithUrls.find(
    (v) => v.id === latestVersion?.id
  );

  const timelineEvents: TimelineEvent[] = [];

  timelineEvents.push({
    id: `created-${document.id}`,
    type: "created",
    title: "Document created",
    by: ownerName,
    timestamp: document.created_at,
  });

  (versions || []).forEach((v) => {
    timelineEvents.push({
      id: `uploaded-${v.id}`,
      type: "uploaded",
      title: `Version ${v.version_no} uploaded`,
      by: v.created_by ? reviewerNameMap.get(v.created_by) : undefined,
      timestamp: v.created_at,
    });
  });

  const approvalsByRound = new Map<number, typeof allApprovals>();
  for (const a of allApprovals) {
    const round = a.round_no ?? 1;
    const list = approvalsByRound.get(round) || [];
    list.push(a);
    approvalsByRound.set(round, list);
  }

  for (const [round, roundApprovals] of approvalsByRound.entries()) {
    const earliest = roundApprovals.reduce(
      (min, a) => (a.created_at < min ? a.created_at : min),
      roundApprovals[0].created_at
    );

    const reviewerNames = roundApprovals
      .map((a) => reviewerNameMap.get(a.reviewer_id) || a.reviewer_id)
      .join(", ");

    timelineEvents.push({
      id: `submitted-round-${round}`,
      type: "submitted",
      title: `Submitted for review (round ${round})`,
      by: `To: ${reviewerNames}`,
      timestamp: earliest,
    });

    for (const a of roundApprovals) {
      if (
        a.reviewed_at &&
        (a.status === "approved" || a.status === "rejected")
      ) {
        timelineEvents.push({
          id: `decision-${a.id}`,
          type: a.status as "approved" | "rejected",
          title:
            a.status === "approved"
              ? `Approved (round ${round})`
              : `Rejected (round ${round})`,
          by: reviewerNameMap.get(a.reviewer_id) || a.reviewer_id,
          comment: a.comment,
          timestamp: a.reviewed_at,
        });
      }
    }
  }

  (signatures || []).forEach((s) => {
    if (s.signed_at) {
      timelineEvents.push({
        id: `signed-${s.id}`,
        type: "signed",
        title: "Document signed",
        by: reviewerNameMap.get(s.signer_id) || s.signer_id,
        timestamp: s.signed_at,
      });
    }
  });

  timelineEvents.sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const canReview =
    document.status === "pending" && !!currentApproval;

  const latestRejection =
    document.status === "rejected"
      ? currentRoundApprovals.find((a) => a.status === "rejected")
      : null;
  const hasAiPrecheck = Boolean(
    latestAIResult?.summary || latestVersion?.content_text
  );
  const hasReviewRound = totalReviewers > 0;
  const hasReviewerDecision = currentRoundApprovals.some(
    (a) => a.status === "approved" || a.status === "rejected"
  );
  const hasSignatureEvidence = (signatures || []).length > 0;
  const hasCompletedVerification = isCompletedVerification(
    latestVerificationLog?.metadata
  );
  const verificationStatus = hasCompletedVerification
    ? "Verified"
    : document.status === "approved" && hasSignatureEvidence
      ? "Ready to verify"
      : "Not available yet";
  const workflowSteps = [
    {
      label: "Upload",
      status: latestVersion ? "Completed" : "Current",
    },
    {
      label: "AI pre-check",
      status: hasAiPrecheck
        ? "Completed"
        : latestVersion
          ? "Current"
          : "Not started",
    },
    {
      label: "Assign reviewers",
      status: hasReviewRound
        ? "Completed"
        : latestVersion && !hasAiPrecheck
          ? "Not started"
          : "Current",
    },
    {
      label: "Review",
      status:
        document.status === "approved" ||
        document.status === "rejected" ||
        hasReviewerDecision
          ? "Completed"
          : hasReviewRound
            ? "Current"
            : "Not started",
    },
    {
      label: "Sign",
      status: hasSignatureEvidence
        ? "Completed"
        : document.status === "pending"
          ? "Current"
          : "Not started",
    },
    {
      label: "Verify",
      status:
        hasCompletedVerification
          ? "Completed"
          : document.status === "approved" && hasSignatureEvidence
          ? "Current"
          : "Not started",
    },
  ];
  const roundDeadline = currentRoundApprovals[0]?.due_at ?? null;
  const nowMs = new Date().getTime();

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-gray-900 lg:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/documents" className="text-sm font-medium text-blue-600 hover:underline">
            Back to Documents
          </Link>

          <Link
            href="/dashboard"
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            Dashboard
          </Link>
        </div>

        <section className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-teal-700">
                Document Detail
              </p>

              <h1 className="mt-3 text-4xl font-bold text-gray-900">
                {document.title}
              </h1>

              <p className="mt-3 max-w-3xl text-gray-600">
                {document.description || REVIEW_CONTEXT_FALLBACK}
              </p>
            </div>

            <StatusBadge status={document.status} />
          </div>

          <div className="mt-6 flex flex-wrap gap-2 text-xs text-gray-600">
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Document type: Academic PDF
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Submitter: {ownerName}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Version: {latestVersion?.version_no ?? "None"}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Review round: {currentRound || "Not assigned"}
            </span>
            {roundDeadline && (
              <span className="rounded-full bg-slate-100 px-3 py-1">
                Deadline: <FormattedDate value={roundDeadline} />
              </span>
            )}
          </div>

          <div className="mt-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
              Workflow
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              {workflowSteps.map((step, index) => (
                <div
                  key={step.label}
                  className={`rounded-2xl border px-3 py-3 text-sm ${workflowStepClass(step.status)}`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.12em]">
                    {index + 1}. {step.label}
                  </p>
                  <p className="mt-1 text-xs">{step.status}</p>
                </div>
              ))}
            </div>
            {document.status === "approved" && hasSignatureEvidence && (
              <p className="mt-3 text-sm font-medium text-gray-700">
                Verification status:{" "}
                <span className="text-teal-700">{verificationStatus}</span>
              </p>
            )}
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 p-5">
              <p className="text-sm text-gray-600">Created At</p>
              <p className="mt-1 font-semibold text-gray-900">
                <FormattedDate value={document.created_at} />
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 p-5">
              <p className="text-sm text-gray-600">Last Updated</p>
              <p className="mt-1 font-semibold text-gray-900">
                <FormattedDate value={document.updated_at} />
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 p-5">
              <p className="text-sm text-gray-600">Document ID</p>
              <p className="mt-1 break-all font-mono text-xs text-gray-900">
                {document.id}
              </p>
            </div>
          </div>
        </section>

        {isOwner && latestRejection && (
          <section className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-red-700">
                  Revision Required
                </p>
                <h2 className="mt-2 text-xl font-bold text-red-900">
                  This document was rejected
                </h2>
                <p className="mt-1 text-sm text-red-800">
                  Reviewer:{" "}
                  <span className="font-semibold">
                    {reviewerNameMap.get(latestRejection.reviewer_id) ||
                      latestRejection.reviewer_id}
                  </span>
                  {latestRejection.reviewed_at && (
                    <>
                      {" - "}
                      <FormattedDate value={latestRejection.reviewed_at} />
                    </>
                  )}
                </p>
              </div>
            </div>

            {latestRejection.comment && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
                  Reviewer Feedback
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-800">
                  {latestRejection.comment}
                </p>
              </div>
            )}

            <p className="mt-4 text-sm text-red-800">
              Upload a revised PDF below. The document will reset to draft so
              you can submit it for review again. The rejection history is kept.
            </p>
          </section>
        )}

        <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Uploaded Files</h2>

          <div className="mt-5 divide-y divide-gray-200 rounded-2xl border border-gray-200">
            {versionsWithUrls.length > 0 ? (
              versionsWithUrls.map((version) => {
                const isLatest = version.id === latestVersion?.id;

                return (
                  <div
                    key={version.id}
                    className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900">
                          Version {version.version_no}
                        </p>

                        {isLatest ? (
                          <>
                            <span className="inline-flex items-center rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
                              Latest
                            </span>
                            <StatusBadge status={document.status} />
                          </>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                            Superseded
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-xs text-gray-600">
                        Uploaded at: <FormattedDate value={version.created_at} />
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
                        className="button-secondary text-sm"
                      >
                        View PDF
                      </a>
                    ) : (
                      <span className="text-sm text-gray-500">
                        No file available
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-gray-600">
                No uploaded files available.
              </div>
            )}
          </div>

          {isOwner && latestVersion && (
            <UploadNewVersionForm
              documentId={document.id}
              documentStatus={document.status}
              latestVersionNo={latestVersion.version_no}
            />
          )}

          {isOwner && document.status === "draft" && (
            <div className="mt-6 border-t border-gray-200 pt-5">
              <p className="text-sm font-medium text-gray-700">Delete draft</p>
              <p className="muted-copy mt-1 text-sm">
                Permanently remove this draft and its files. Available only while
                the document is in draft; once submitted, only an admin can
                delete it.
              </p>
              <div className="mt-3">
                <DeleteDraftButton
                  documentId={document.id}
                  documentTitle={document.title}
                />
              </div>
            </div>
          )}
        </section>

        {latestVersion && latestVersionWithUrl?.signedUrl && (
          <PdfViewerLoader
            documentId={document.id}
            versionId={latestVersion.id}
            signedUrl={latestVersionWithUrl.signedUrl}
            externalUrl={latestVersionWithUrl.signedUrl}
            initialHighlights={highlights}
            canHighlight={canHighlight}
            currentUserId={user.id}
          />
        )}

        <AIWorkspace
          key={latestVersion?.id}
          documentId={document.id}
          initialExtractedText={latestVersion?.content_text || ""}
          initialSummary={latestAIResult?.summary || ""}
          initialKeyPoints={latestAIResult?.key_points || ""}
          initialRiskNotes={latestAIResult?.risk_notes || ""}
          initialMessages={aiMessages || []}
        />

        {isOwner && (
          <SubmitForReviewForm
            documentId={document.id}
            currentStatus={document.status}
            reviewers={reviewers || []}
            latestVersionNo={latestVersion?.version_no ?? null}
            userId={user.id}
            webAuthnCredentialId={webAuthnCredentialId}
          />
        )}

        {document.status === "pending" && totalReviewers > 0 && (
          <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-teal-700">
                  Approval Progress - Round {currentRound}
                </p>
                <h2 className="mt-2 text-xl font-bold text-gray-900">
                  {approvedCount} of {totalReviewers} reviewers approved
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  {pendingCount} pending - {approvedCount} approved -{" "}
                  {rejectedCount} rejected
                </p>
                {currentRoundApprovals[0]?.due_at && (
                  <p className="mt-1 text-sm text-gray-600">
                    Round deadline:{" "}
                    <span className="font-semibold text-gray-900">
                      <FormattedDate value={currentRoundApprovals[0].due_at} />
                    </span>
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {currentRoundApprovals.map((approval) => {
                const dueMs = approval.due_at
                  ? new Date(approval.due_at).getTime()
                  : null;
                const isOverdue =
                  approval.status === "pending" &&
                  dueMs !== null &&
                  dueMs < nowMs;

                return (
                  <div
                    key={approval.id}
                    className={`flex items-center justify-between rounded-xl border px-4 py-2 ${
                      isOverdue
                        ? "border-red-300 bg-red-50/50"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {reviewerNameMap.get(approval.reviewer_id) ||
                          approval.reviewer_id}
                      </p>
                      {isOverdue && (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-800">
                          Overdue
                        </span>
                      )}
                    </div>
                    <StatusBadge status={approval.status} />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {canReview && currentApproval && (
          <ReviewActions
            approvalId={currentApproval.id}
            documentId={document.id}
            userId={user.id}
            webAuthnCredentialId={webAuthnCredentialId}
            approvedCount={approvedCount}
            totalCount={totalReviewers}
          />
        )}

        <SignDocumentPanel
          documentId={document.id}
          signatureCount={(signatures || []).length}
        />

        <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Approval History</h2>

          {allApprovals.length === 0 ? (
            <p className="mt-4 text-gray-600">
              No approval history available.
            </p>
          ) : (
            <div className="mt-5 space-y-6">
              {Array.from(approvalsByRound.entries())
                .sort(([a], [b]) => b - a)
                .map(([round, roundApprovals]) => (
                  <div key={round}>
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-gray-600">
                      Round {round}
                      {round === currentRound && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
                          Current
                        </span>
                      )}
                    </p>

                    <div className="divide-y divide-gray-200 rounded-2xl border border-gray-200">
                      {roundApprovals.map((approval) => (
                        <div key={approval.id} className="p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="font-semibold text-gray-900">
                                Reviewer:{" "}
                                {reviewerNameMap.get(approval.reviewer_id) ||
                                  approval.reviewer_id}
                              </p>

                              <p className="mt-1 text-sm text-gray-600">
                                Requested at: <FormattedDate value={approval.created_at} />
                              </p>

                              {approval.reviewed_at && (
                                <p className="mt-1 text-sm text-gray-600">
                                  Reviewed at: <FormattedDate value={approval.reviewed_at} />
                                </p>
                              )}
                            </div>

                            <StatusBadge status={approval.status} />
                          </div>

                          {approval.comment && (
                            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-gray-700">
                              {approval.comment}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>

        <DocumentTimeline events={timelineEvents} />
      </div>
    </main>
  );
}
