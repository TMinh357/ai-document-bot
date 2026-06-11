"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DeleteDraftButtonProps = {
  documentId: string;
  documentTitle: string;
};

// Owner-facing delete for DRAFT documents only. Navigates back to the document
// list on success, since the detail page it lives on no longer exists after
// deletion.
export default function DeleteDraftButton({
  documentId,
  documentTitle,
}: DeleteDraftButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setIsLoading(true);
    setError("");

    const response = await fetch(`/api/documents/${documentId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || "Failed to delete document.");
      setIsLoading(false);
      return;
    }

    router.push("/documents");
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        Delete Draft
      </button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <span className="text-sm text-red-700">
        Delete &quot;{documentTitle}&quot;? This permanently removes the draft
        and its uploaded files. This cannot be undone.
      </span>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isLoading}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
        >
          {isLoading ? "Deleting..." : "Confirm Delete"}
        </button>

        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError("");
          }}
          disabled={isLoading}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>

      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
