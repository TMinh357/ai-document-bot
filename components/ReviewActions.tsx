"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SigningKeySetup from "./SigningKeySetup";
import {
  describeSigningError,
  getClientRpId,
  signFileHashWithWebAuthn,
} from "@/lib/webauthn/client";

type ReviewActionsProps = {
  approvalId: string;
  documentId: string;
  userId: string;
  webAuthnCredentialId: string | null;
  approvedCount: number;
  totalCount: number;
};

export default function ReviewActions({
  approvalId,
  documentId,
  userId,
  webAuthnCredentialId,
  approvedCount,
  totalCount,
}: ReviewActionsProps) {
  const router = useRouter();

  type Phase =
    | "idle"
    | "fetching-hash"
    | "awaiting-windows-hello"
    | "submitting";

  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [showKeySetup, setShowKeySetup] = useState(false);
  const [credentialId, setCredentialId] = useState<string | null>(
    webAuthnCredentialId
  );

  const isLoading = phase !== "idle";

  const phaseLabel: Record<Phase, string> = {
    idle: "",
    "fetching-hash": "Computing file fingerprint...",
    "awaiting-windows-hello": "Waiting for Windows Hello...",
    submitting: "Submitting decision...",
  };

  async function approveWithCredential(credId: string) {
    try {
      setPhase("fetching-hash");
      const hashResponse = await fetch(
        `/api/documents/${documentId}/file-hash`
      );
      const hashData = await hashResponse.json();
      if (!hashResponse.ok) {
        throw new Error(hashData.error || "Failed to fetch file hash.");
      }

      setPhase("awaiting-windows-hello");
      const assertion = await signFileHashWithWebAuthn({
        fileHashHex: hashData.hash,
        credentialId: credId,
        rpId: getClientRpId(),
      });

      setPhase("submitting");
      const response = await fetch(`/api/approvals/${approvalId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "approved",
          comment,
          assertion,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessageTone("error");
        setMessage(result?.error || "Failed to record your decision.");
        return;
      }

      const done = result?.approvedCount ?? approvedCount + 1;
      const total = result?.totalCount ?? totalCount;
      setMessageTone("success");
      setMessage(
        done >= total
          ? "Approved and signed. All reviewers have now approved, so the document is approved."
          : `Approved and signed. ${done} of ${total} reviewers have approved so far.`
      );
      router.refresh();
    } catch (err) {
      setMessageTone("error");
      setMessage(describeSigningError(err));
    } finally {
      setPhase("idle");
    }
  }

  async function handleApprove() {
    setMessage("");
    if (!credentialId) {
      setShowKeySetup(true);
      return;
    }
    await approveWithCredential(credentialId);
  }

  async function handleKeyReady(newCredentialId: string) {
    setShowKeySetup(false);
    setCredentialId(newCredentialId);
    await approveWithCredential(newCredentialId);
  }

  async function handleReject() {
    setMessage("");

    if (!comment.trim()) {
      setMessageTone("error");
      setMessage("A comment is required when rejecting a document.");
      return;
    }

    // A rejection ends the round for every other reviewer and cannot be
    // undone, so ask once before committing to it.
    if (!confirmingReject) {
      setConfirmingReject(true);
      return;
    }

    setConfirmingReject(false);

    try {
      setPhase("submitting");

      const response = await fetch(`/api/approvals/${approvalId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected", comment }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessageTone("error");
        setMessage(result?.error || "Failed to record your decision.");
        return;
      }

      setMessageTone("success");
      setMessage(
        "Rejected. The submitter has been notified and can upload a revised version."
      );
      router.refresh();
    } catch {
      setMessageTone("error");
      setMessage(
        "Could not reach the server. Check your connection and try again."
      );
    } finally {
      setPhase("idle");
    }
  }

  const remaining = Math.max(0, totalCount - approvedCount);

  return (
    <div className="section-card mt-6 rounded-[2rem] p-6 md:p-8">
      {showKeySetup && (
        <SigningKeySetup
          userId={userId}
          onReady={handleKeyReady}
          onCancel={() => setShowKeySetup(false)}
        />
      )}

      <h2 className="text-2xl font-semibold text-gray-900">Review Decision</h2>

      <p className="muted-copy mt-2 text-sm">
        Approval requires <strong>WebAuthn user verification</strong>. You will
        confirm with the registered platform authenticator, then the system
        signs the current file hash and records the approval evidence. The
        document is approved only after all {totalCount} reviewer
        {totalCount === 1 ? "" : "s"} approve and sign; a single rejection ends
        the round.
      </p>

      <p className="mt-2 inline-flex items-center rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
        {approvedCount} of {totalCount} approved - {remaining} remaining
      </p>

      <div className="mt-4">
        <label className="mb-1 block text-sm font-medium text-gray-800">
          Review Comment{" "}
          <span className="text-xs font-normal text-gray-500">
            (optional for approval, required for rejection)
          </span>
        </label>

        <textarea
          className="textarea-field min-h-28"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Enter your review comment"
        />
      </div>

      {message && (
        <p
          role="status"
          aria-live="polite"
          className={`mt-3 text-sm ${
            messageTone === "success" ? "text-teal-700" : "text-red-600"
          }`}
        >
          {message}
        </p>
      )}

      {confirmingReject && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-700">
          Rejecting ends this review round for all {totalCount} reviewer
          {totalCount === 1 ? "" : "s"} and cannot be undone. Click
          &ldquo;Confirm Reject&rdquo; to continue.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isLoading}
          onClick={handleApprove}
          className="button-success disabled:opacity-60"
        >
          {isLoading ? phaseLabel[phase] : "Sign and Approve"}
        </button>

        <button
          type="button"
          disabled={isLoading}
          onClick={handleReject}
          className="button-danger disabled:opacity-60"
        >
          {confirmingReject ? "Confirm Reject" : "Reject"}
        </button>

        {confirmingReject && (
          <button
            type="button"
            disabled={isLoading}
            onClick={() => setConfirmingReject(false)}
            className="button-secondary disabled:opacity-60"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
