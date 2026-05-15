"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Reviewer = {
  id: string;
  full_name: string | null;
  role: string;
};

type SubmitForReviewFormProps = {
  documentId: string;
  currentStatus: string;
  reviewers: Reviewer[];
  latestVersionNo: number | null;
};

export default function SubmitForReviewForm({
  documentId,
  currentStatus,
  reviewers,
  latestVersionNo,
}: SubmitForReviewFormProps) {
  const router = useRouter();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dueInDays, setDueInDays] = useState(7);
  const [filterText, setFilterText] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (currentStatus !== "draft") {
    return null;
  }

  function toggleReviewer(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSubmitForReview(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    const reviewerIds = Array.from(selectedIds);

    if (reviewerIds.length === 0) {
      setMessage("Select at least one reviewer.");
      return;
    }

    setIsLoading(true);

    const response = await fetch(`/api/documents/${documentId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewerIds, dueInDays }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result?.error || "Failed to submit for review.");
      setIsLoading(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="section-card mt-6 rounded-[2rem] p-6 md:p-8">
      <h2 className="text-2xl font-semibold text-gray-900">
        Submit for Review
      </h2>

      <p className="muted-copy mt-2 text-sm">
        Select one or more reviewers. The document will be approved only when
        every selected reviewer approves; a single rejection ends this round.
      </p>

      {latestVersionNo !== null && (
        <p className="mt-2 inline-flex items-center rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
          Version {latestVersionNo} (latest) will be submitted
        </p>
      )}

      {reviewers.length === 0 ? (
        <p className="mt-4 text-sm text-red-600">
          No reviewers are available. Please set at least one user role to
          reviewer or admin in the profiles table.
        </p>
      ) : (
        <form onSubmit={handleSubmitForReview} className="mt-4 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-800">
              Due in
            </label>

            <select
              className="select-field"
              value={dueInDays}
              onChange={(e) => setDueInDays(Number(e.target.value))}
            >
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days (default)</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>

            <p className="muted-copy mt-1 text-xs">
              Each reviewer&apos;s deadline. Overdue reviews are flagged red on
              the dashboard, and the system sends a reminder notification once
              past the deadline.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-800">
              Reviewers ({selectedIds.size} selected)
            </label>

            <div className="space-y-2 rounded-2xl border border-gray-200 p-3">
              {reviewers.length > 4 && (
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Search reviewers by name or role…"
                  className="mb-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
              )}

              {(() => {
                const q = filterText.trim().toLowerCase();
                const filtered = q
                  ? reviewers.filter(
                      (r) =>
                        (r.full_name ?? "").toLowerCase().includes(q) ||
                        r.role.toLowerCase().includes(q)
                    )
                  : reviewers;

                if (filtered.length === 0) {
                  return (
                    <p className="px-3 py-2 text-sm text-gray-500">
                      No reviewers match &quot;{filterText}&quot;.
                    </p>
                  );
                }

                return filtered.map((reviewer) => {
                  const checked = selectedIds.has(reviewer.id);
                  return (
                    <label
                      key={reviewer.id}
                      className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleReviewer(reviewer.id)}
                        className="h-4 w-4"
                      />
                      <span className="text-sm text-gray-900">
                        {reviewer.full_name || reviewer.id}{" "}
                        <span className="text-xs text-gray-500">
                          ({reviewer.role})
                        </span>
                      </span>
                    </label>
                  );
                });
              })()}
            </div>
          </div>

          {message && <p className="text-sm text-red-600">{message}</p>}

          <button
            type="submit"
            disabled={isLoading || selectedIds.size === 0}
            className="button-primary disabled:opacity-60"
          >
            {isLoading
              ? "Submitting..."
              : `Submit for Review (${selectedIds.size} reviewer${selectedIds.size === 1 ? "" : "s"})`}
          </button>
        </form>
      )}
    </div>
  );
}
