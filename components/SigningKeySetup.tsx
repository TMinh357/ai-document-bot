"use client";

import { useEffect, useState } from "react";
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startRegistration,
} from "@simplewebauthn/browser";

type Props = {
  userId: string;
  onReady: (credentialId: string) => void;
  onCancel: () => void;
};

type Availability = "checking" | "available" | "no-webauthn" | "no-platform";

export default function SigningKeySetup({ onReady, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [availability, setAvailability] = useState<Availability>("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!browserSupportsWebAuthn()) {
        if (!cancelled) setAvailability("no-webauthn");
        return;
      }
      try {
        const ok = await platformAuthenticatorIsAvailable();
        if (!cancelled) setAvailability(ok ? "available" : "no-platform");
      } catch {
        if (!cancelled) setAvailability("no-platform");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

        {availability === "checking" && (
          <p className="mt-4 text-sm text-gray-600">
            Checking your device for a platform authenticator…
          </p>
        )}

        {availability === "no-webauthn" && (
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">This browser does not support WebAuthn.</p>
            <p className="mt-1">
              Please use a recent version of Chrome, Edge, Firefox, or Safari to
              set up digital signing.
            </p>
          </div>
        )}

        {availability === "no-platform" && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">
                Windows Hello (or equivalent) is not set up on this device.
              </p>
              <p className="mt-1">
                Digital signing requires a platform authenticator: Windows Hello
                on Windows, Touch ID on Mac, or biometric on phones / tablets.
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-800">
              <p className="font-semibold">How to enable Windows Hello:</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>
                  Open <strong>Settings</strong> →{" "}
                  <strong>Accounts</strong> →{" "}
                  <strong>Sign-in options</strong>.
                </li>
                <li>
                  Under <strong>Windows Hello</strong>, set up at least a{" "}
                  <strong>PIN</strong> (fingerprint or face are optional but
                  recommended).
                </li>
                <li>Come back to this page and click <em>Try again</em>.</li>
              </ol>
            </div>
          </div>
        )}

        {availability === "available" && (
          <>
            <p className="mt-3 text-sm text-gray-700">
              Your browser will create a hardware-bound signing key using{" "}
              <strong>Windows Hello</strong> (or Touch ID / platform biometric on
              other devices). The key is stored in the device&apos;s secure
              hardware (TPM) and physically cannot be extracted or exported.
              Every future signing action will require your PIN, fingerprint, or
              face to authenticate.
            </p>

            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
              <li>Bound to this physical device — proves it&apos;s actually you.</li>
              <li>Requires biometric / PIN at every signing event.</li>
              <li>Private key never leaves the device&apos;s TPM.</li>
            </ul>
          </>
        )}

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
            {availability === "available" ? "Cancel" : "Close"}
          </button>

          {availability === "no-platform" && (
            <button
              onClick={async () => {
                setAvailability("checking");
                const ok = await platformAuthenticatorIsAvailable().catch(
                  () => false
                );
                setAvailability(ok ? "available" : "no-platform");
              }}
              className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
            >
              Try again
            </button>
          )}

          {availability === "available" && (
            <button
              onClick={register}
              disabled={busy}
              className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {busy
                ? "Waiting for Windows Hello..."
                : "Set up with Windows Hello"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
