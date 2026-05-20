import { createHash } from "crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/auth";
import PrintCertificateButton from "@/components/PrintCertificateButton";
import FormattedDate from "@/components/FormattedDate";
import {
  hexToBytes,
  importPublicKeyJwk,
  verifySignatureBytes,
} from "@/lib/crypto/signing";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type SignatureRow = {
  id: string;
  signer_id: string;
  signature_hash: string;
  signature_bytes: string | null;
  algorithm: string | null;
  signature_role: string | null;
  round_no: number | null;
  signed_at: string;
};

type VerifiedSignature = SignatureRow & {
  signerName: string;
  hashMatch: boolean;
  cryptoSignatureValid: boolean | null;
};

function roleHeading(role: string | null): string {
  if (role === "owner_submission") return "Owner Submission";
  if (role === "reviewer_approval") return "Reviewer Approval";
  return "Legacy Signature";
}

export default async function CertificatePage({ params }: PageProps) {
  const { id } = await params;

  const { supabase, user, role } = await requireUser();

  const { data: document } = await supabase
    .from("documents")
    .select("id, title, description, status, owner_id")
    .eq("id", id)
    .single();

  if (!document) {
    redirect("/documents");
  }

  const isOwner = document.owner_id === user.id;
  const isAdmin = role === "admin";

  const { data: assignedApprovals } = await supabase
    .from("approvals")
    .select("id")
    .eq("document_id", id)
    .eq("reviewer_id", user.id)
    .limit(1);

  const isAssignedReviewer = !!(
    assignedApprovals && assignedApprovals.length > 0
  );

  if (!isOwner && !isAdmin && !isAssignedReviewer) {
    redirect("/documents");
  }

  const { data: signatures } = await supabase
    .from("document_signatures")
    .select(
      "id, signer_id, signature_hash, signature_bytes, algorithm, signature_role, round_no, signed_at"
    )
    .eq("document_id", id)
    .order("signed_at", { ascending: true });

  if (!signatures || signatures.length === 0) {
    return (
      <main className="min-h-screen bg-slate-100 p-6 lg:p-10">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            <Link
              href={`/documents/${id}`}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              ← Back to Document
            </Link>
          </div>

          <div className="rounded-3xl bg-white p-12 text-center shadow-sm ring-1 ring-gray-200">
            <p className="text-xs font-bold uppercase tracking-[0.5em] text-gray-500">
              Certificate Unavailable
            </p>
            <h1 className="mt-4 text-3xl font-bold text-gray-900">
              No signatures on record
            </h1>
            <p className="mt-3 text-gray-600">
              The owner signs at submission and each reviewer signs their
              approval. No signatures have been recorded for this document
              yet.
            </p>
          </div>
        </div>
      </main>
    );
  }

  // Resolve signer names and public keys once.
  const signerIds = Array.from(new Set(signatures.map((s) => s.signer_id)));
  const { data: signerProfiles } = await supabase
    .from("profiles")
    .select("id, full_name, public_key")
    .in("id", signerIds);

  const profileMap = new Map(
    (signerProfiles ?? []).map((p) => [
      p.id,
      { name: (p.full_name as string | null) ?? p.id, publicKey: p.public_key as string | null },
    ])
  );

  // Compute current file hash once.
  const { data: version } = await supabase
    .from("document_versions")
    .select("id, version_no, file_path")
    .eq("document_id", id)
    .order("version_no", { ascending: false })
    .limit(1)
    .single();

  let currentHash: string | null = null;
  let verifyError: string | null = null;

  if (!version?.file_path) {
    verifyError = "No uploaded file is available to verify against.";
  } else {
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("documents")
      .createSignedUrl(version.file_path, 60);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      verifyError = "Failed to access the file for verification.";
    } else {
      const fileResponse = await fetch(signedUrlData.signedUrl);
      if (!fileResponse.ok) {
        verifyError = "Failed to download the file for verification.";
      } else {
        currentHash = createHash("sha256")
          .update(Buffer.from(await fileResponse.arrayBuffer()))
          .digest("hex");
      }
    }
  }

  // Verify each signature.
  const verified: VerifiedSignature[] = [];
  for (const sig of signatures as SignatureRow[]) {
    const profile = profileMap.get(sig.signer_id);
    const hashMatch = currentHash !== null && sig.signature_hash === currentHash;

    let cryptoSignatureValid: boolean | null = null;
    if (sig.signature_bytes) {
      if (profile?.publicKey) {
        try {
          const publicKey = await importPublicKeyJwk(profile.publicKey);
          cryptoSignatureValid = await verifySignatureBytes(
            publicKey,
            sig.signature_bytes,
            hexToBytes(sig.signature_hash)
          );
        } catch {
          cryptoSignatureValid = false;
        }
      } else {
        cryptoSignatureValid = false;
      }
    }

    verified.push({
      ...sig,
      signerName: profile?.name ?? sig.signer_id,
      hashMatch,
      cryptoSignatureValid,
    });
  }

  const ownerSig = verified.find((v) => v.signature_role === "owner_submission");
  const reviewerSigs = verified.filter(
    (v) => v.signature_role === "reviewer_approval"
  );
  const legacySigs = verified.filter(
    (v) => v.signature_role === null
  );

  const allHashesMatch = verified.every((v) => v.hashMatch);
  const allCryptoValid = verified
    .filter((v) => v.signature_bytes)
    .every((v) => v.cryptoSignatureValid === true);

  const verifiedAt = new Date();

  return (
    <main className="min-h-screen bg-slate-100 p-6 lg:p-10 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link
            href={`/documents/${id}`}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to Document
          </Link>

          <PrintCertificateButton />
        </div>

        <article className="relative overflow-hidden rounded-3xl bg-white p-10 shadow-xl ring-1 ring-gray-200 md:p-14 print:rounded-none print:p-10 print:shadow-none print:ring-0">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-3 rounded-2xl border-4 border-double border-teal-700/30 print:border-teal-900/60"
          />

          <div className="relative">
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-[0.5em] text-teal-700">
                Certificate of Signatures
              </p>
              <h1 className="mt-4 font-serif text-4xl font-bold text-gray-900">
                Document Signed
              </h1>
              <p className="muted-copy mt-3 text-sm">
                This certificate attests that the document below was signed
                using ECDSA P-256 digital signatures over the SHA-256 hash of
                its contents. The owner signs at submission; each approving
                reviewer signs their approval.
              </p>
            </div>

            <div className="mt-10 space-y-6">
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">
                  Document
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">
                  {document.title}
                </p>
                {document.description && (
                  <p className="mt-1 text-sm text-gray-600">
                    {document.description}
                  </p>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Document Status
                  </p>
                  <span className="mt-2 inline-flex items-center rounded-full bg-teal-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-teal-800">
                    {document.status}
                  </span>
                </div>
                <div className="rounded-2xl border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Signatures recorded
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {verified.length} ({ownerSig ? "1 owner" : "0 owner"},{" "}
                    {reviewerSigs.length} reviewer
                    {reviewerSigs.length === 1 ? "" : "s"})
                  </p>
                </div>
              </div>

              <div
                className={`rounded-2xl border p-5 ${
                  verifyError
                    ? "border-yellow-200 bg-yellow-50"
                    : allHashesMatch && allCryptoValid
                      ? "border-green-200 bg-green-50"
                      : "border-red-200 bg-red-50"
                }`}
              >
                <p className="text-sm font-bold">
                  {verifyError
                    ? "Verification could not be completed"
                    : allHashesMatch && allCryptoValid
                      ? "All signatures verified against the current file"
                      : "At least one signature does not match the current file"}
                </p>
                {verifyError && (
                  <p className="mt-1 text-xs text-yellow-800">{verifyError}</p>
                )}
                {currentHash && (
                  <p className="mt-3 break-all rounded-xl bg-white p-3 font-mono text-xs text-gray-700 ring-1 ring-gray-200">
                    Current file hash: {currentHash}
                  </p>
                )}
              </div>

              {ownerSig && (
                <SignaturePanel signature={ownerSig} />
              )}

              {reviewerSigs.map((sig) => (
                <SignaturePanel key={sig.id} signature={sig} />
              ))}

              {legacySigs.map((sig) => (
                <SignaturePanel key={sig.id} signature={sig} />
              ))}

              <div className="border-t border-gray-200 pt-6 text-center text-xs text-gray-500">
                <p>
                  Verified at: <FormattedDate value={verifiedAt.toISOString()} />
                </p>
                <p className="mt-1">
                  Document ID:{" "}
                  <span className="font-mono">{document.id}</span>
                </p>
                {version?.version_no != null && (
                  <p className="mt-1">Version: {version.version_no}</p>
                )}
              </div>
            </div>
          </div>
        </article>
      </div>
    </main>
  );
}

function SignaturePanel({ signature }: { signature: VerifiedSignature }) {
  const hasCrypto = Boolean(signature.signature_bytes);
  return (
    <section className="rounded-2xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
            {roleHeading(signature.signature_role)}
          </p>
          <p className="mt-1 font-serif text-2xl italic text-gray-900">
            {signature.signerName}
          </p>
          <p className="text-xs text-gray-500">
            Signed at <FormattedDate value={signature.signed_at} />
            {signature.round_no ? ` · Round ${signature.round_no}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              signature.hashMatch
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            Hash {signature.hashMatch ? "match" : "mismatch"}
          </span>
          {hasCrypto ? (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                signature.cryptoSignatureValid
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {signature.algorithm || "ECDSA-P256"}{" "}
              {signature.cryptoSignatureValid ? "valid" : "invalid"}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
              Legacy hash-only
            </span>
          )}
        </div>
      </div>

      <div className="mt-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
          SHA-256 hash signed
        </p>
        <p className="mt-1 break-all rounded-xl bg-slate-50 p-3 font-mono text-[11px] text-gray-700 ring-1 ring-gray-200">
          {signature.signature_hash}
        </p>
      </div>

      {hasCrypto && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            ECDSA signature
          </p>
          <p className="mt-1 break-all rounded-xl bg-slate-50 p-3 font-mono text-[10px] text-gray-700 ring-1 ring-gray-200">
            {signature.signature_bytes}
          </p>
        </div>
      )}
    </section>
  );
}
