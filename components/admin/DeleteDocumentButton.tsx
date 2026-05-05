"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DeleteDocumentButtonProps = {
  documentId: string;
  documentTitle: string;
};

export default function DeleteDocumentButton({
  documentId,
  documentTitle,
}: DeleteDocumentButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setIsLoading(true);
    setError("");

    const response = await fetch(`/api/admin/documents/${documentId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || "Failed to delete document.");
      setIsLoading(false);
      return;
    }

    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-xl border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        Delete
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <span className="text-xs text-red-600">
        Delete &quot;{documentTitle}&quot;? This cannot be undone.
      </span>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isLoading}
          className="rounded-xl bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
        >
          {isLoading ? "Deleting..." : "Confirm"}
        </button>

        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError("");
          }}
          disabled={isLoading}
          className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>

      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
