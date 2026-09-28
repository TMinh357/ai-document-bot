"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Lists the signing keys on the account and lets the holder revoke one. A key
// that looks unfamiliar is the visible symptom of someone else having enrolled
// on the account, so revoking has to be something the user can do themselves,
// immediately.

export type KeyRow = {
  id: string;
  device_label: string | null;
  device_type: string | null;
  aaguid: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  authenticatorName: string;
};

export default function SigningKeyList({ keys }: { keys: KeyRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const active = keys.filter((k) => !k.revoked_at);
  const revoked = keys.filter((k) => k.revoked_at);

  async function revoke(id: string) {
    setBusyId(id);
    setError("");

    try {
      const res = await fetch(`/api/profile/webauthn/credentials/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Revoked from the signing keys page" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not revoke the key.");

      setConfirmId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>
      )}

      <section className="section-card overflow-hidden rounded-[2rem]">
        <div className="border-b border-gray-200/70 px-6 py-5">
          <h2 className="text-lg font-semibold text-gray-900">
            Active keys{" "}
            <span className="muted-copy text-sm font-normal">
              ({active.length})
            </span>
          </h2>
          <p className="muted-copy mt-1 text-sm">
            Each key lives in one device and cannot be copied off it.
          </p>
        </div>

        <div className="data-list">
          {active.length === 0 ? (
            <p className="muted-copy px-6 py-8 text-sm">
              No signing key yet. One is created the first time you sign a
              document.
            </p>
          ) : (
            active.map((k) => (
              <div key={k.id} className="px-6 py-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900">
                      {k.device_label || "Signing key"}
                    </h3>
                    <p className="muted-copy mt-1 text-sm">
                      {k.authenticatorName}
                      {k.device_type ? ` · ${k.device_type}` : ""}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.14em] text-gray-500">
                      Registered {new Date(k.created_at).toLocaleDateString()}
                      {k.last_used_at
                        ? ` · last used ${new Date(k.last_used_at).toLocaleDateString()}`
                        : " · never used"}
                    </p>
                  </div>

                  {confirmId === k.id ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                      <p className="text-xs text-red-900">
                        Revoking stops this key signing. Documents already signed
                        with it stay valid and verifiable.
                        {active.length <= 1 &&
                          " This is your only key — you will need an administrator to approve a replacement."}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => revoke(k.id)}
                          disabled={busyId === k.id}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {busyId === k.id ? "Revoking..." : "Revoke it"}
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          disabled={busyId === k.id}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Keep it
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmId(k.id)}
                      className="w-fit rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {revoked.length > 0 && (
        <section className="section-card overflow-hidden rounded-[2rem]">
          <div className="border-b border-gray-200/70 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-900">Revoked</h2>
            <p className="muted-copy mt-1 text-sm">
              Kept so signatures made with them can still be verified.
            </p>
          </div>

          <div className="data-list">
            {revoked.map((k) => (
              <div key={k.id} className="px-6 py-4">
                <p className="text-sm font-medium text-gray-700">
                  {k.device_label || "Signing key"}
                  <span className="muted-copy ml-2 text-xs">
                    {k.authenticatorName}
                  </span>
                </p>
                <p className="muted-copy mt-1 text-xs">
                  Revoked {new Date(k.revoked_at!).toLocaleDateString()}
                  {k.revoked_reason ? ` · ${k.revoked_reason}` : ""}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
