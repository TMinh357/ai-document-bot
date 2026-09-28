"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Lets an administrator revoke every signing key on a compromised account.
//
// Suspending an account stops it being used, but a stolen device holding a live
// key is what can still produce signatures in the victim's name. Only the
// account holder could revoke a key until now, which is no help when they are
// the one who lost the device.

export default function RevokeUserKeys({
  userId,
  activeKeyCount,
  isSelf,
}: {
  userId: string;
  activeKeyCount: number;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (isSelf || activeKeyCount === 0) return null;

  async function revoke() {
    setBusy(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/users/${userId}/credentials`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not revoke the keys.");

      setConfirming(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke.");
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <div className="text-right">
        {error && <p className="mb-1 text-xs text-red-700">{error}</p>}
        <button
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          Revoke signing keys ({activeKeyCount})
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xs rounded-xl border border-red-200 bg-red-50 p-3 text-right">
      <p className="text-left text-xs text-red-900">
        This revokes all {activeKeyCount} signing{" "}
        {activeKeyCount === 1 ? "key" : "keys"} on this account. Do this when the
        account is reported compromised or a device was lost. The user cannot
        sign afterwards, and will need you to approve a replacement. Documents
        already signed stay valid.
      </p>
      {error && <p className="mt-2 text-left text-xs text-red-700">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={revoke}
          disabled={busy}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? "Revoking..." : "Revoke them"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
