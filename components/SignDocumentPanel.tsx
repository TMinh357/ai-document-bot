"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FormattedDate from "./FormattedDate";

type VerifiedSignature = {
  id: string;
  signerId: string;
  signerName: string | null;
  signatureRole: string | null;
  algorithm: string;
  signedAt: string;
  signatureHash: string;
  hashMatch: boolean;
  cryptoSignaturePresent: boolean;
  cryptoSignatureValid: boolean | null;
};

type VerifyResponse = {
  fileMissing: boolean;
  currentHash: string | null;
  signatures: VerifiedSignature[];
};

type SignDocumentPanelProps = {
  documentId: string;
  signatureCount: number;
};

function roleLabel(role: string | null): string {
  if (role === "owner_submission") return "Submitter submission";
  if (role === "reviewer_approval") return "Reviewer approval";
  return "Legacy signature";
}

export default function SignDocumentPanel({
  documentId,
  signatureCount,
}: SignDocumentPanelProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);

  const hasSignatures = signatureCount > 0;

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

    setVerifyResult(data);
    const verified =
      !data.fileMissing &&
      data.signatures.every(
        (signature: VerifiedSignature) => signature.hashMatch
      ) &&
      data.signatures
        .filter((signature: VerifiedSignature) => signature.cryptoSignaturePresent)
        .every(
          (signature: VerifiedSignature) =>
            signature.cryptoSignatureValid === true
        );
    if (verified) {
      router.refresh();
    }
    setIsVerifying(false);
  }

  const allHashesMatch =
    verifyResult?.signatures.every((s) => s.hashMatch) ?? false;
  const allCryptoValid =
    verifyResult?.signatures
      .filter((s) => s.cryptoSignaturePresent)
      .every((s) => s.cryptoSignatureValid === true) ?? false;
  const overallValid =
    !!verifyResult && !verifyResult.fileMissing && allHashesMatch;

  return (
    <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-teal-700">
            Digital Signature
          </p>

          <h2 className="mt-2 text-2xl font-bold text-gray-900">
            File Integrity and Signatures
          </h2>

          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            Each party signs as part of the workflow: the submitter signs at
            submission, and each approving reviewer signs their approval. Verify
            recomputes the current file&apos;s SHA-256 hash and checks both the
            stored hashes and the WebAuthn signatures against each signer&apos;s
            registered public key.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={verifyDocument}
            disabled={isVerifying || !hasSignatures}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isVerifying ? "Verifying..." : "Verify Integrity"}
          </button>

          {hasSignatures && (
            <Link
              href={`/documents/${documentId}/certificate`}
              className="rounded-xl border border-teal-300 bg-teal-50 px-5 py-3 text-sm font-medium text-teal-800 hover:bg-teal-100"
            >
              View Certificate
            </Link>
          )}
        </div>
      </div>

      {!hasSignatures && (
        <p className="mt-4 rounded-xl bg-yellow-50 p-3 text-sm text-yellow-800">
          No signatures recorded yet. The submitter signs at submission; each
          reviewer signs when they approve.
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
            overallValid
              ? "border-green-200 bg-green-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold text-white ${
                overallValid ? "bg-green-600" : "bg-red-600"
              }`}
              aria-hidden
            >
              {overallValid ? "OK" : "!"}
            </span>

            <div>
              <p
                className={`text-base font-bold ${
                  overallValid ? "text-green-900" : "text-red-900"
                }`}
              >
                {verifyResult.fileMissing
                  ? "File has been deleted or moved"
                  : overallValid
                    ? "File is valid"
                    : "File has been modified"}
              </p>
              <p
                className={`text-sm ${
                  overallValid ? "text-green-800" : "text-red-800"
                }`}
              >
                {verifyResult.fileMissing
                  ? "The signed file no longer exists at its original storage path."
                  : overallValid
                    ? "The current file matches every recorded signature hash."
                    : "At least one signature hash does not match the current file."}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                allHashesMatch
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              All hashes {allHashesMatch ? "match" : "mismatch"}
            </span>

            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                allCryptoValid
                  ? "bg-green-100 text-green-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              All crypto signatures {allCryptoValid ? "valid" : "not all valid"}
            </span>
          </div>

          {!verifyResult.fileMissing && verifyResult.currentHash && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-600">
                Current File Hash
              </p>
              <p className="mt-1 break-all rounded-xl bg-white p-3 font-mono text-xs text-gray-700 ring-1 ring-gray-200">
                {verifyResult.currentHash}
              </p>
            </div>
          )}

          <div className="mt-4 space-y-3">
            {verifyResult.signatures.map((sig) => (
              <div
                key={sig.id}
                className="rounded-xl border border-gray-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {sig.signerName || sig.signerId}
                    </p>
                    <p className="text-xs text-gray-500">
                      {roleLabel(sig.signatureRole)} - Signed at{" "}
                      <FormattedDate value={sig.signedAt} />
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        sig.hashMatch
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      Hash {sig.hashMatch ? "match" : "mismatch"}
                    </span>
                    {sig.cryptoSignaturePresent ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          sig.cryptoSignatureValid
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {sig.algorithm}{" "}
                        {sig.cryptoSignatureValid ? "valid" : "invalid"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                        Legacy hash-only
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
