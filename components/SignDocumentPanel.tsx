"use client";

import { useState } from "react";

type Signature = {
  id: string;
  signature_hash: string;
  signed_at: string;
  signer_id: string;
};

type VerifyResult = {
  valid: boolean;
  currentHash: string;
  signedHash: string;
  signedAt: string;
};

type SignDocumentPanelProps = {
  documentId: string;
  documentStatus: string;
  signatures: Signature[];
};

export default function SignDocumentPanel({
  documentId,
  documentStatus,
  signatures,
}: SignDocumentPanelProps) {
  const [signatureHash, setSignatureHash] = useState("");
  const [message, setMessage] = useState("");
  const [isSigning, setIsSigning] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  const hasSignatures = signatures.length > 0;

  async function signDocument() {
    setMessage("");
    setVerifyResult(null);
    setIsSigning(true);

    const response = await fetch(`/api/documents/${documentId}/signature`, {
      method: "POST",
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "Failed to sign document.");
      setIsSigning(false);
      return;
    }

    setSignatureHash(data.signatureHash || "");
    setMessage("Document signature has been created successfully.");
    setIsSigning(false);
  }

  async function verifyDocument() {
    setMessage("");
    setVerifyResult(null);
    setIsVerifying(true);

    const response = await fetch(
      `/api/documents/${documentId}/signature/verify`
    );

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "Failed to verify document.");
      setIsVerifying(false);
      return;
    }

    setVerifyResult({
      valid: data.valid,
      currentHash: data.currentHash,
      signedHash: data.signedHash,
      signedAt: data.signedAt,
    });
    setIsVerifying(false);
  }

  return (
    <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-teal-700">
            Digital Signature Demo
          </p>

          <h2 className="mt-2 text-2xl font-bold text-gray-900">
            File Integrity and Signing
          </h2>

          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            Sign creates a SHA-256 hash of the latest uploaded file. Verify
            recomputes the hash now and compares it to the saved signature to
            check whether the file has been modified.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={signDocument}
            disabled={isSigning || documentStatus !== "approved"}
            className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSigning ? "Signing..." : "Sign Approved Document"}
          </button>

          <button
            onClick={verifyDocument}
            disabled={isVerifying || !hasSignatures}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isVerifying ? "Verifying..." : "Verify Integrity"}
          </button>
        </div>
      </div>

      {documentStatus !== "approved" && documentStatus !== "signed" && (
        <p className="mt-4 rounded-xl bg-yellow-50 p-3 text-sm text-yellow-800">
          This document must be approved before it can be signed.
        </p>
      )}

      {message && (
        <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-gray-700">
          {message}
        </p>
      )}

      {verifyResult && (
        <div
          className={`mt-5 rounded-2xl border p-5 ${
            verifyResult.valid
              ? "border-green-200 bg-green-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold text-white ${
                verifyResult.valid ? "bg-green-600" : "bg-red-600"
              }`}
              aria-hidden
            >
              {verifyResult.valid ? "✓" : "✗"}
            </span>

            <div>
              <p
                className={`text-base font-bold ${
                  verifyResult.valid ? "text-green-900" : "text-red-900"
                }`}
              >
                {verifyResult.valid
                  ? "File is valid"
                  : "File has been modified"}
              </p>
              <p
                className={`text-sm ${
                  verifyResult.valid ? "text-green-800" : "text-red-800"
                }`}
              >
                {verifyResult.valid
                  ? "The current file matches the saved signature hash."
                  : "The current file does not match the saved signature hash."}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-600">
                Saved Signature Hash
              </p>
              <p className="mt-1 break-all rounded-xl bg-white p-3 font-mono text-xs text-gray-700 ring-1 ring-gray-200">
                {verifyResult.signedHash}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Signed at:{" "}
                {new Date(verifyResult.signedAt).toLocaleString()}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-600">
                Current File Hash
              </p>
              <p
                className={`mt-1 break-all rounded-xl bg-white p-3 font-mono text-xs ring-1 ${
                  verifyResult.valid
                    ? "text-gray-700 ring-gray-200"
                    : "text-red-700 ring-red-200"
                }`}
              >
                {verifyResult.currentHash}
              </p>
            </div>
          </div>
        </div>
      )}

      {signatureHash && (
        <div className="mt-5 rounded-2xl border border-gray-200 p-5">
          <p className="text-sm font-semibold text-gray-900">
            New Signature Hash
          </p>

          <p className="mt-2 break-all rounded-xl bg-slate-50 p-4 font-mono text-xs text-gray-700">
            {signatureHash}
          </p>
        </div>
      )}

      <div className="mt-6">
        <h3 className="font-semibold text-gray-900">Signature History</h3>

        <div className="mt-4 divide-y divide-gray-200 rounded-2xl border border-gray-200">
          {signatures.length > 0 ? (
            signatures.map((signature) => (
              <div key={signature.id} className="p-4">
                <p className="text-sm text-gray-600">
                  Signed at: {new Date(signature.signed_at).toLocaleString()}
                </p>

                <p className="mt-2 break-all rounded-xl bg-slate-50 p-3 font-mono text-xs text-gray-700">
                  {signature.signature_hash}
                </p>
              </div>
            ))
          ) : (
            <div className="p-4 text-sm text-gray-500">
              No signature records are available for this document.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
