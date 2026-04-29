"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Reviewer = {
  id: string;
  full_name: string | null;
  role: string;
};

type SubmitForReviewFormProps = {
  documentId: string;
  currentStatus: string;
  reviewers: Reviewer[];
};

export default function SubmitForReviewForm({
  documentId,
  currentStatus,
  reviewers,
}: SubmitForReviewFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [reviewerId, setReviewerId] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (currentStatus !== "draft" && currentStatus !== "rejected") {
    return null;
  }

  async function handleSubmitForReview(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setIsLoading(true);

    if (!reviewerId) {
      setMessage("Please select a reviewer.");
      setIsLoading(false);
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setMessage("You must be signed in.");
      setIsLoading(false);
      return;
    }

    const { error: approvalError } = await supabase.from("approvals").insert({
      document_id: documentId,
      reviewer_id: reviewerId,
      status: "pending",
    });

    if (approvalError) {
      setMessage(approvalError.message);
      setIsLoading(false);
      return;
    }

    const { error: documentError } = await supabase
      .from("documents")
      .update({
        status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    if (documentError) {
      setMessage(documentError.message);
      setIsLoading(false);
      return;
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "SUBMIT_FOR_REVIEW",
      target_table: "documents",
      target_id: documentId,
      metadata: {
        reviewer_id: reviewerId,
        status: "pending",
      },
    });

    router.refresh();
  }

  return (
    <div className="section-card mt-6 rounded-[2rem] p-6 md:p-8">
      <h2 className="text-2xl font-semibold text-gray-900">
        Submit for Review
      </h2>

      <p className="muted-copy mt-2 text-sm">
        Select a reviewer and move this document to the pending review stage.
      </p>

      {reviewers.length === 0 ? (
        <p className="mt-4 text-sm text-red-600">
          No reviewers are available. Please set at least one user role to
          reviewer or admin in the profiles table.
        </p>
      ) : (
        <form onSubmit={handleSubmitForReview} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">
              Reviewer
            </label>

            <select
              className="select-field"
              value={reviewerId}
              onChange={(e) => setReviewerId(e.target.value)}
              required
            >
              <option value="">Select a reviewer</option>

              {reviewers.map((reviewer) => (
                <option key={reviewer.id} value={reviewer.id}>
                  {reviewer.full_name || reviewer.id} ({reviewer.role})
                </option>
              ))}
            </select>
          </div>

          {message && <p className="text-sm text-red-600">{message}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="button-primary disabled:opacity-60"
          >
            {isLoading ? "Submitting..." : "Submit for Review"}
          </button>
        </form>
      )}
    </div>
  );
}
