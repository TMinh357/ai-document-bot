"use client";

import { useState } from "react";

type Signature = {
  id: string;
  signature_hash: string;
  signed_at: string;
  signer_id: string;
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

  async function signDocument() {
    setMessage("");
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
            This feature creates a SHA-256 hash from the latest uploaded file and
            stores it as a basic digital signature record.
          </p>
        </div>

        <button
          onClick={signDocument}
          disabled={isSigning || documentStatus !== "approved"}
          className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSigning ? "Signing..." : "Sign Approved Document"}
        </button>
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