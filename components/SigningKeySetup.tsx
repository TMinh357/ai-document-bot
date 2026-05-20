"use client";

import { useState } from "react";
import {
  generateSigningKeyPair,
  exportKeyPairJwk,
} from "@/lib/crypto/signing";
import { saveKeyRecord } from "@/lib/crypto/key-storage";

type Props = {
  userId: string;
  onReady: () => void;
  onCancel: () => void;
};

export default function SigningKeySetup({ userId, onReady, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [backup, setBackup] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError("");

    try {
      const pair = await generateSigningKeyPair();
      const { publicKeyJwk, privateKeyJwk } = await exportKeyPairJwk(pair);

      const response = await fetch("/api/profile/public-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKeyJwk }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to register public key.");
      }

      await saveKeyRecord({
        userId,
        publicKeyJwk,
        privateKeyJwk,
        createdAt: new Date().toISOString(),
      });

      // Stash the backup so the user can download it before continuing.
      setBackup(privateKeyJwk);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Key generation failed.");
    } finally {
      setBusy(false);
    }
  }

  function downloadBackup() {
    if (!backup) return;
    const blob = new Blob([backup], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `signing-key-${userId}.jwk.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-gray-900">
          Set up your digital signing key
        </h2>

        {!backup ? (
          <>
            <p className="mt-3 text-sm text-gray-700">
              To digitally sign documents, your browser will generate an{" "}
              <strong>ECDSA P-256 keypair</strong>. The{" "}
              <strong>public key</strong> is uploaded to your profile so others
              can verify your signatures. The <strong>private key</strong>{" "}
              stays in this browser — the server never sees it.
            </p>

            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
              <li>Only you can sign documents with this key.</li>
              <li>If you clear browser data without a backup, you lose the key.</li>
              <li>You can export a backup .jwk file in the next step.</li>
            </ul>

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                onClick={onCancel}
                disabled={busy}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={generate}
                disabled={busy}
                className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {busy ? "Generating..." : "Generate keypair"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-gray-700">
              Your keypair is ready. Before continuing, download a backup of
              your private key. Store it somewhere safe — if you lose access
              to this browser without a backup, you cannot recover the key.
            </p>

            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <button
                onClick={downloadBackup}
                className="rounded-xl border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800 hover:bg-teal-100"
              >
                Download backup
              </button>
              <button
                onClick={onReady}
                className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
              >
                Continue signing
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
