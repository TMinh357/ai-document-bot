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

type PendingRequest = { id: string; pairingCode: string; expiresAt: string };

export default function SigningKeySetup({ onReady, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [availability, setAvailability] = useState<Availability>("checking");
  // Set when the server refuses because the account already has a key: adding
  // another device has to be approved first.
  const [needsApproval, setNeedsApproval] = useState(false);
  const [request, setRequest] = useState<PendingRequest | null>(null);

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
        if (data.code === "APPROVAL_REQUIRED") {
          setNeedsApproval(true);
          setBusy(false);
          return;
        }
        throw new Error(data.error || "Failed to start registration.");
      }
      const options = await optionsRes.json();

      // 2. Prompt the user through the platform authenticator.
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

  // Open a request that must be approved from a device that already holds a
  // key, or by an administrator if every previous device is gone.
  async function requestApproval() {
    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/profile/webauthn/device-request", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // The account turned out to have no key after all — register directly.
        if (data.code === "NO_APPROVAL_NEEDED") {
          setNeedsApproval(false);
          setBusy(false);
          return;
        }
        throw new Error(data.error || "Could not create the request.");
      }

      setRequest({
        id: data.id,
        pairingCode: data.pairingCode,
        expiresAt: data.expiresAt,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create the request."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-gray-900">
          {needsApproval
            ? "Approve this device before signing"
            : "Set up your digital signing key"}
        </h2>

        {availability === "checking" && (
          <p className="mt-4 text-sm text-gray-600">
            Checking your device for a platform authenticator...
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
                A platform authenticator is not available on this device.
              </p>
              <p className="mt-1">
                Digital signing requires user verification through Windows
                Hello, Touch ID, or a similar platform authenticator.
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-800">
              <p className="font-semibold">How to enable Windows Hello:</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>
                  Open <strong>Settings</strong> -{" "}
                  <strong>Accounts</strong> -{" "}
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

        {needsApproval && !request && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">
                This account already has a signing key.
              </p>
              <p className="mt-1">
                A password alone cannot add a second one — otherwise anyone who
                learned your password could sign in your name. Approve this
                device from a device that already holds your key, or ask an
                administrator if you no longer have it.
              </p>
            </div>
          </div>
        )}

        {needsApproval && request && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-800">
              <p className="font-semibold">Waiting for approval</p>
              <p className="mt-1">
                On a device that already has your signing key, open this
                application and approve the request showing this code:
              </p>
              <p className="mt-3 text-center font-mono text-3xl font-bold tracking-[0.4em] text-teal-800">
                {request.pairingCode}
              </p>
              <p className="mt-3 text-xs text-slate-600">
                Check the code matches before approving. If you no longer have
                any device with a key, an administrator can approve the request
                after confirming who you are. Expires{" "}
                {new Date(request.expiresAt).toLocaleTimeString()}.
              </p>
            </div>
            <p className="text-xs text-gray-600">
              We emailed you about this request. If you did not start it,
              someone may know your password — change it and tell an
              administrator.
            </p>
          </div>
        )}

        {!needsApproval && availability === "available" && (
          <>
            <p className="mt-3 text-sm text-gray-700">
              Your browser will create a WebAuthn platform credential using{" "}
              <strong>Windows Hello</strong> or an equivalent authenticator.
              Protection details depend on the device, browser, and operating
              system. Every future signing action asks the authenticator to
              verify the user before the system records approval evidence.
            </p>

            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
              <li>Uses a registered platform authenticator for signing.</li>
              <li>Requires PIN or biometric user verification when available.</li>
              <li>Records a signature over the current PDF hash.</li>
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

          {needsApproval && !request && (
            <button
              onClick={requestApproval}
              disabled={busy}
              className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {busy ? "Creating request..." : "Request approval for this device"}
            </button>
          )}

          {needsApproval && request && (
            <button
              onClick={register}
              disabled={busy}
              className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {busy ? "Checking..." : "I have approved it — continue"}
            </button>
          )}

          {!needsApproval && availability === "available" && (
            <button
              onClick={register}
              disabled={busy}
              className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {busy ? "Waiting for authenticator..." : "Set up signing key"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
