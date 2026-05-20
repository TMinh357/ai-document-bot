"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SigningKeySetup from "./SigningKeySetup";
import {
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
        setMessage(result?.error || "Failed to record your decision.");
        return;
      }

      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Approval failed.");
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
      setMessage("A comment is required when rejecting a document.");
      return;
    }

    setPhase("submitting");

    const response = await fetch(`/api/approvals/${approvalId}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected", comment }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result?.error || "Failed to record your decision.");
      setPhase("idle");
      return;
    }

    router.refresh();
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
        Approving requires <strong>Windows Hello</strong> authentication: you
        will sign the current file&apos;s hash with your device-bound private
        key. The document is approved only after all {totalCount} reviewer
        {totalCount === 1 ? "" : "s"} approve and sign; a single rejection ends
        the round.
      </p>

      <p className="mt-2 inline-flex items-center rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
        {approvedCount} of {totalCount} approved · {remaining} remaining
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

      {message && <p className="mt-3 text-sm text-red-600">{message}</p>}

      <div className="mt-4 flex gap-3">
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
          Reject
        </button>
      </div>
    </div>
  );
}
