"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Approve or reject a device-approval request as an administrator. This is the
// recovery path for someone who lost the only device holding their signing
// key, so the countersign-with-existing-key route is not open to them.

type Props = {
  requestId: string;
  userName: string;
  pairingCode: string;
};

export default function DeviceRequestDecision({
  requestId,
  userName,
  pairingCode,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<"approve" | "reject" | null>(
    null
  );

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/device-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save the decision.");

      setConfirming(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (confirming === "approve") {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
        <p className="text-sm font-semibold text-amber-900">
          Confirm you have verified who this is
        </p>
        <p className="mt-1 text-xs text-amber-900">
          Approving lets <strong>{userName}</strong> register a new signing key,
          which means signing documents in their name. Confirm their identity
          outside this system first — in person, by phone, or through a channel
          you trust. Code on their screen should read{" "}
          <strong>{pairingCode}</strong>.
        </p>

        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => decide("approved")}
            disabled={busy}
            className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {busy ? "Saving..." : "Yes, I verified them — approve"}
          </button>
          <button
            onClick={() => setConfirming(null)}
            disabled={busy}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => setConfirming("approve")}
        disabled={busy}
        className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50"
      >
        Approve
      </button>
      <button
        onClick={() => decide("rejected")}
        disabled={busy}
        className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? "..." : "Reject"}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
