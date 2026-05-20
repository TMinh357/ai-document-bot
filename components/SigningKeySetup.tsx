"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";

type Props = {
  userId: string;
  onReady: (credentialId: string) => void;
  onCancel: () => void;
};

export default function SigningKeySetup({ onReady, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function register() {
    setBusy(true);
    setError("");

    try {
      // 1. Ask the server for a registration challenge.
      const optionsRes = await fetch("/api/profile/webauthn/register-options", {
        method: "POST",
      });
      if (!optionsRes.ok) {
        const data = await optionsRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to start registration.");
      }
      const options = await optionsRes.json();

      // 2. Prompt the user (Windows Hello / Touch ID / biometric).
      const attestation = await startRegistration({ optionsJSON: options });

      // 3. Send the attestation to the server for verification + storage.
      const verifyRes = await fetch("/api/profile/webauthn/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attestation),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json().catch(() => ({}));
        throw new Error(data.error || "Registration verification failed.");
      }

      onReady(attestation.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not register signing key."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-gray-900">
          Set up your digital signing key
        </h2>

        <p className="mt-3 text-sm text-gray-700">
          Your browser will create a hardware-bound signing key using{" "}
          <strong>Windows Hello</strong> (or Touch ID / a platform biometric on
          other devices). The key is stored in the device&apos;s secure hardware
          (TPM) and physically cannot be extracted or exported. Every future
          signing action will require your PIN, fingerprint, or face to
          authenticate.
        </p>

        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
          <li>Bound to this physical device — proves it&apos;s actually you.</li>
          <li>Requires biometric / PIN at every signing event.</li>
          <li>Private key never leaves the device&apos;s TPM.</li>
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
            onClick={register}
            disabled={busy}
            className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {busy ? "Waiting for Windows Hello..." : "Set up with Windows Hello"}
          </button>
        </div>
      </div>
    </div>
  );
}
