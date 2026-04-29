"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ReviewActionsProps = {
  documentId: string;
  approvalId: string;
};

export default function ReviewActions({
  documentId,
  approvalId,
}: ReviewActionsProps) {
  const router = useRouter();
  const supabase = createClient();

  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleReview(status: "approved" | "rejected") {
    setMessage("");
    setIsLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setMessage("You must be signed in.");
      setIsLoading(false);
      return;
    }

    const { error: approvalError } = await supabase
      .from("approvals")
      .update({
        status,
        comment,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", approvalId);

    if (approvalError) {
      setMessage(approvalError.message);
      setIsLoading(false);
      return;
    }

    const { error: documentError } = await supabase
      .from("documents")
      .update({
        status,
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
      action: status === "approved" ? "APPROVE_DOCUMENT" : "REJECT_DOCUMENT",
      target_table: "documents",
      target_id: documentId,
      metadata: {
        approval_id: approvalId,
        status,
        comment,
      },
    });

    router.refresh();
  }

  return (
    <div className="section-card mt-6 rounded-[2rem] p-6 md:p-8">
      <h2 className="text-2xl font-semibold text-gray-900">Review Decision</h2>

      <p className="muted-copy mt-2 text-sm">
        Approve or reject this document based on its content and requirements.
      </p>

      <div className="mt-4">
        <label className="mb-1 block text-sm font-medium text-gray-800">
          Review Comment
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
