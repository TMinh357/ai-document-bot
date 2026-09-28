"use client";

import { useCallback, useEffect, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";

// Shown on a device that already holds a signing key. It lists requests the
// account has opened elsewhere and lets the user approve one by signing a
// challenge with the key they already have — which is the control that stops a
// stolen password from being enough to mint a second signing key.

type DeviceRequest = {
  id: string;
  pairing_code: string;
  status: string;
  challenge: string;
  expires_at: string;
  requested_ip: string | null;
  requested_agent: string | null;
  created_at: string;
};

type Props = {
  /** Credential ids this device can sign with. */
  credentialIds: string[];
  rpId: string;
};

// The raw WebAuthn API takes credential ids as bytes, unlike the
// @simplewebauthn wrapper which takes the base64url string.
function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export default function DeviceApprovalPanel({ credentialIds, rpId }: Props) {
  const [requests, setRequests] = useState<DeviceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"error" | "success">("error");
  // Whether THIS machine holds one of the account's keys. The server only
  // knows the account has keys somewhere, so without this the panel appears on
  // the very device asking to be approved, where approving cannot work.
  const [canApproveHere, setCanApproveHere] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/profile/webauthn/device-request");
      if (!res.ok) return;
      const data = await res.json();
      setRequests(
        (data.requests ?? []).filter((r: DeviceRequest) => r.status === "pending")
      );
    } catch {
      // Leave the list as it is; this panel is not the primary workflow.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Ask the browser, silently, whether this machine holds one of the
        // account's keys. mediation: "silent" resolves without any Windows
        // Hello prompt: a credential if one is present here, null if not.
        // The account's keys live in other machines' TPMs, so the server
        // cannot answer this — only the browser can.
        let present = false;
        try {
          const found = await navigator.credentials.get({
            publicKey: {
              challenge: new Uint8Array(32),
              rpId,
              allowCredentials: credentialIds.map((id) => ({
                id: base64UrlToBytes(id),
                type: "public-key" as const,
                transports: ["internal" as const],
              })),
              userVerification: "discouraged",
            },
            mediation: "silent",
          } as CredentialRequestOptions);
          present = found !== null;
        } catch {
          // Browsers that do not support silent mediation throw rather than
          // resolving null. Fall back to showing the panel: a user who cannot
          // approve here sees an explanation, which beats hiding a pending
          // request from the one device that could approve it.
          present = true;
        }

        if (cancelled) return;
        setCanApproveHere(present);

        if (!present) {
          setLoading(false);
          return;
        }

        const res = await fetch("/api/profile/webauthn/device-request");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setRequests(
          (data.requests ?? []).filter(
            (r: DeviceRequest) => r.status === "pending"
          )
        );
      } catch {
        // Leave the list empty; this panel is not the primary workflow.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [credentialIds, rpId]);

  async function approve(req: DeviceRequest) {
    setBusyId(req.id);
    setMessage("");

    try {
      // Sign the request's own nonce, so an assertion captured from a document
      // signing cannot be replayed to authorise a device.
      const assertion = await startAuthentication({
        optionsJSON: {
          challenge: req.challenge,
          rpId,
          allowCredentials: credentialIds.map((id) => ({
            id,
            type: "public-key" as const,
            transports: ["internal" as const],
          })),
          userVerification: "required",
          timeout: 60000,
        },
      });

      const res = await fetch("/api/profile/webauthn/device-request/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: req.id, assertion }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not approve.");

      setTone("success");
      setMessage(
        "Approved. The other device can now register its signing key."
      );
      await load();
    } catch (err) {
      setTone("error");
      // The browser reports "not allowed" both for a cancelled prompt and for
      // a device that holds no matching key. Its own wording reads like a
      // crash, so say which of the two this is likely to be.
      setMessage(
        err instanceof Error && err.name === "NotAllowedError"
          ? "This device could not approve the request. Either the prompt was cancelled, or this is not a device that already holds a signing key — approve from the device you registered first."
          : err instanceof Error
            ? err.message
            : "Could not approve the request."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function reject(req: DeviceRequest) {
    setBusyId(req.id);
    setMessage("");
    try {
      const res = await fetch("/api/profile/webauthn/device-request", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: req.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not dismiss.");
      setTone("success");
      setMessage("Request dismissed.");
      await load();
    } catch (err) {
      setTone("error");
      setMessage(
        err instanceof Error ? err.message : "Could not dismiss the request."
      );
    } finally {
      setBusyId(null);
    }
  }

  if (loading || !canApproveHere || requests.length === 0) return null;

  return (
    <section className="mt-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
      <h2 className="text-lg font-bold text-amber-900">
        A device is waiting to be approved
      </h2>
      <p className="mt-1 text-sm text-amber-900">
        Someone signed in to your account and asked to register a signing key on
        another device. Approve it only if the code below matches the code shown
        on that device.
      </p>

      {message && (
        <p
          role="status"
          className={`mt-3 rounded-lg p-3 text-sm ${
            tone === "success"
              ? "bg-teal-50 text-teal-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {message}
        </p>
      )}

      <div className="mt-4 space-y-4">
        {requests.map((req) => (
          <div
            key={req.id}
            className="rounded-xl border border-amber-200 bg-white p-4"
          >
            <p className="text-center font-mono text-3xl font-bold tracking-[0.4em] text-teal-800">
              {req.pairing_code}
            </p>

            <dl className="mt-3 space-y-1 text-xs text-gray-600">
              <div className="flex gap-2">
                <dt className="font-semibold">Requested:</dt>
                <dd>{new Date(req.created_at).toLocaleString()}</dd>
              </div>
              {req.requested_ip && (
                <div className="flex gap-2">
                  <dt className="font-semibold">IP:</dt>
                  <dd>{req.requested_ip}</dd>
                </div>
              )}
              {req.requested_agent && (
                <div className="flex gap-2">
                  <dt className="font-semibold">Browser:</dt>
                  <dd className="truncate">{req.requested_agent}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="font-semibold">Expires:</dt>
                <dd>{new Date(req.expires_at).toLocaleString()}</dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => approve(req)}
                disabled={busyId === req.id}
                className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {busyId === req.id
                  ? "Waiting for Windows Hello..."
                  : "Approve with my signing key"}
              </button>

              <button
                onClick={() => reject(req)}
                disabled={busyId === req.id}
                className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                This was not me
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-amber-900">
        If you did not start this, dismiss it and change your password — someone
        else may know it.
      </p>
    </section>
  );
}
