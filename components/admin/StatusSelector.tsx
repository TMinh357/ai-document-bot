"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = "pending" | "approved" | "rejected";

interface Props {
  userId: string;
  currentStatus: Status;
  isSelf: boolean;
}

const PILL_CLASS: Record<Status, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default function StatusSelector({
  userId,
  currentStatus,
  isSelf,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<Status | null>(null);
  const [feedback, setFeedback] = useState<"saved" | "error" | null>(null);

  async function setStatus(next: Status) {
    if (next === currentStatus || isSelf) return;
    setLoading(next);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
      setFeedback("saved");
      router.refresh();
    } catch {
      setFeedback("error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ${PILL_CLASS[currentStatus]}`}
      >
        {currentStatus}
      </span>

      {!isSelf && currentStatus !== "approved" && (
        <button
          onClick={() => setStatus("approved")}
          disabled={loading !== null}
          className="rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs font-semibold text-green-800 hover:bg-green-100 disabled:opacity-50"
        >
          {loading === "approved" ? "…" : "Approve"}
        </button>
      )}

      {!isSelf && currentStatus !== "rejected" && (
        <button
          onClick={() => setStatus("rejected")}
          disabled={loading !== null}
          className="rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
        >
          {loading === "rejected" ? "…" : "Reject"}
        </button>
      )}

      {feedback === "saved" && (
        <span className="text-xs font-semibold text-green-600">Saved</span>
      )}
      {feedback === "error" && (
        <span className="text-xs font-semibold text-red-600">Error</span>
      )}
    </div>
  );
}
