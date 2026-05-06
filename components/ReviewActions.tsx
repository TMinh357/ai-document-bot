"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ReviewActionsProps = {
  approvalId: string;
  approvedCount: number;
  totalCount: number;
};

export default function ReviewActions({
  approvalId,
  approvedCount,
  totalCount,
}: ReviewActionsProps) {
  const router = useRouter();

  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleReview(decision: "approved" | "rejected") {
    setMessage("");

    if (decision === "rejected" && !comment.trim()) {
      setMessage("A comment is required when rejecting a document.");
      return;
    }

    setIsLoading(true);

    const response = await fetch(`/api/approvals/${approvalId}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: decision, comment }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result?.error || "Failed to record your decision.");
      setIsLoading(false);
      return;
    }

    router.refresh();
  }

  const remaining = Math.max(0, totalCount - approvedCount);

  return (
    <div className="section-card mt-6 rounded-[2rem] p-6 md:p-8">
      <h2 className="text-2xl font-semibold text-gray-900">Review Decision</h2>

      <p className="muted-copy mt-2 text-sm">
        Approve or reject this document. The document is approved only after
        all {totalCount} reviewer{totalCount === 1 ? "" : "s"} approve; a
        single rejection ends the round.
      </p>

      <p className="mt-2 inline-flex items-center rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
        {approvedCount} of {totalCount} approved · {remaining} remaining
      </p>

      <div className="mt-4">
        <label className="mb-1 block text-sm font-medium text-gray-800">
          Review Comment{" "}
          <span className="text-xs font-normal text-gray-500">
            (optional for approval, required for rejection)
          </span>
        </label>

        <textarea
          className="textarea-field min-h-28"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Enter your review comment"
        />
      </div>

      {message && <p className="mt-3 text-sm text-red-600">{message}</p>}

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          disabled={isLoading}
          onClick={() => handleReview("approved")}
          className="button-success disabled:opacity-60"
        >
          Approve
        </button>

        <button
          type="button"
          disabled={isLoading}
          onClick={() => handleReview("rejected")}
          className="button-danger disabled:opacity-60"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
