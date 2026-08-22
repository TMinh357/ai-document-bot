import { createHash } from "crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { requireUser } from "@/lib/supabase/auth";
import PrintCertificateButton from "@/components/PrintCertificateButton";
import FormattedDate from "@/components/FormattedDate";
import { getExpectedOrigin, getRpId } from "@/lib/webauthn/config";
import { hexToBase64Url } from "@/lib/webauthn/verify";
import { aaguidToName } from "@/lib/webauthn/aaguid-registry";
import { formatRoleLabel } from "@/lib/role-labels";
import {
  decodeAuthenticatorData,
  type DecodedAuthenticatorData,
} from "@/lib/webauthn/authenticator-data";

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
  client_data_json: string | null;
  authenticator_data: string | null;
  credential_id: string | null;
  algorithm: string | null;
  signature_role: string | null;
  round_no: number | null;
  signed_at: string;
};

type SignerInfo = {
  name: string;
  email: string | null;
  role: string | null;
  aaguid: string | null;
  deviceType: string | null;
  transports: string[] | null;
  registeredAt: string | null;
};

type VerifiedSignature = SignatureRow & {
  signer: SignerInfo;
  hashMatch: boolean;
  cryptoSignatureValid: boolean | null;
  isWebAuthn: boolean;
  decodedAuthData: DecodedAuthenticatorData | null;
};

type AuthenticatorTransport =
  | "ble"
  | "cable"
  | "hybrid"
  | "internal"
  | "nfc"
  | "smart-card"
  | "usb";

function roleHeading(role: string | null): string {
  if (role === "owner_submission") return "Submitter Submission";
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
      "id, signer_id, signature_hash, signature_bytes, client_data_json, authenticator_data, credential_id, algorithm, signature_role, round_no, signed_at"
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
              Back to Document
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
              The Submitter signs at submission and each reviewer signs their
              approval. No signatures have been recorded for this document
              yet.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const signerIds = Array.from(new Set(signatures.map((s) => s.signer_id)));
  const { data: signerProfiles } = await supabase
    .from("profiles")
    .select(
      "id, full_name, role, webauthn_credential_id, webauthn_public_key, webauthn_transports, webauthn_device_type, webauthn_aaguid, webauthn_registered_at"
    )
    .in("id", signerIds);

  const profileMap = new Map(
    (signerProfiles ?? []).map((p) => [p.id, p])
  );

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

  // Verify every signature in parallel. Each WebAuthn verification is
  // roughly 100-200ms of crypto work. Sequential loop over N signatures was the
  // bottleneck making this page take ~2.4s of server work.
  const verified: VerifiedSignature[] = await Promise.all(
    (signatures as SignatureRow[]).map(async (sig) => {
      const profile = profileMap.get(sig.signer_id);
      const signer: SignerInfo = {
        name: (profile?.full_name as string | null) ?? sig.signer_id,
        email: sig.signer_id === user.id ? (user.email ?? null) : null,
        role: (profile?.role as string | null) ?? null,
        aaguid: (profile?.webauthn_aaguid as string | null) ?? null,
        deviceType: (profile?.webauthn_device_type as string | null) ?? null,
        transports:
          (profile?.webauthn_transports as string[] | null) ?? null,
        registeredAt:
          (profile?.webauthn_registered_at as string | null) ?? null,
      };
      const hashMatch =
        currentHash !== null && sig.signature_hash === currentHash;
      const isWebAuthn = Boolean(sig.client_data_json && sig.authenticator_data);
      const decodedAuthData = sig.authenticator_data
        ? decodeAuthenticatorData(sig.authenticator_data)
        : null;

      let cryptoSignatureValid: boolean | null = null;

      if (
        isWebAuthn &&
        sig.signature_bytes &&
        profile?.webauthn_credential_id &&
        profile?.webauthn_public_key
      ) {
        const reconstructed: AuthenticationResponseJSON = {
          id: sig.credential_id ?? (profile.webauthn_credential_id as string),
          rawId:
            sig.credential_id ?? (profile.webauthn_credential_id as string),
          type: "public-key",
          response: {
            clientDataJSON: sig.client_data_json!,
            authenticatorData: sig.authenticator_data!,
            signature: sig.signature_bytes,
          },
          clientExtensionResults: {},
        };

        try {
          const result = await verifyAuthenticationResponse({
            response: reconstructed,
            expectedChallenge: hexToBase64Url(sig.signature_hash),
            expectedOrigin: getExpectedOrigin(),
            expectedRPID: getRpId(),
            requireUserVerification: true,
            credential: {
              id: profile.webauthn_credential_id as string,
              publicKey: new Uint8Array(
                Buffer.from(profile.webauthn_public_key as string, "base64")
              ),
              counter: 0,
              transports:
                (profile.webauthn_transports as
                  | AuthenticatorTransport[]
                  | null) ?? undefined,
            },
          });
          cryptoSignatureValid = result.verified;
        } catch {
          cryptoSignatureValid = false;
        }
      } else if (sig.signature_bytes) {
        cryptoSignatureValid = false;
      }

      return {
        ...sig,
        signer,
        hashMatch,
        cryptoSignatureValid,
        isWebAuthn,
        decodedAuthData,
      };
    })
  );

  const ownerSig = verified.find(
    (v) => v.signature_role === "owner_submission"
  );
  const reviewerSigs = verified.filter(
    (v) => v.signature_role === "reviewer_approval"
  );
  const legacySigs = verified.filter((v) => v.signature_role === null);

  const allHashesMatch = verified.every((v) => v.hashMatch);
  const allCryptoValid = verified
    .filter((v) => v.signature_bytes)
    .every((v) => v.cryptoSignatureValid === true);
  const workflowSummary =
    document.status === "approved"
      ? "Completed - all assigned reviewers approved and signed."
      : document.status === "pending"
        ? "Pending review - reviewer approval is still required."
        : document.status === "rejected"
          ? "Rejected - a revised version is required before approval."
          : "Draft - not submitted for reviewer approval yet.";

  const verifiedAt = new Date();

  return (
    <main className="min-h-screen bg-slate-100 p-6 lg:p-10 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link
            href={`/documents/${id}`}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            Back to Document
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
                Technical Verification Record
              </p>
              <h1 className="mt-4 font-serif text-4xl font-bold text-gray-900">
                Signature Certificate
              </h1>
              <p className="muted-copy mt-3 text-sm">
                This certificate records the WebAuthn signatures currently
                attached to this document version. A document is fully approved
                only after all assigned reviewers have approved and signed.
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
                    {verified.length} ({ownerSig ? "1 Submitter" : "0 Submitter"},{" "}
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
              </div>

              <div className="grid gap-3 rounded-2xl border border-gray-200 bg-slate-50 p-5 text-sm md:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                    File changed?
                  </p>
                  <p className="mt-1 font-medium text-gray-900">
                    {verifyError
                      ? "The current file could not be checked."
                      : allHashesMatch
                      ? "Current file matches the signed file hash."
                      : "Current file differs from at least one signed hash."}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                    Who signed?
                  </p>
                  <p className="mt-1 font-medium text-gray-900">
                    {ownerSig ? "1 Submitter signature" : "0 Submitter signatures"},{" "}
                    {reviewerSigs.length} Reviewer signature
                    {reviewerSigs.length === 1 ? "" : "s"}.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                    Workflow complete?
                  </p>
                  <p className="mt-1 font-medium text-gray-900">
                    {workflowSummary}
                  </p>
                </div>
              </div>

              {currentHash && (
                <details className="rounded-2xl border border-gray-200 bg-slate-50 p-4">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Current file technical details
                  </summary>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Current SHA-256 hash
                  </p>
                  <p className="mt-1 break-all rounded-xl bg-white p-3 font-mono text-[11px] text-gray-700 ring-1 ring-gray-200">
                    {currentHash}
                  </p>
                </details>
              )}

              {ownerSig && <SignaturePanel signature={ownerSig} />}
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
  const authName = signature.isWebAuthn
    ? aaguidToName(signature.signer.aaguid)
    : null;
  const flags = signature.decodedAuthData?.flags;
  const counter = signature.decodedAuthData?.counter;

  return (
    <section className="rounded-2xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
            {roleHeading(signature.signature_role)}
          </p>
          <p className="mt-1 font-serif text-2xl italic text-gray-900">
            {signature.signer.name}
          </p>
          <p className="text-xs text-gray-500">
            {signature.signer.role && (
              <>Role: {formatRoleLabel(signature.signer.role)} - </>
            )}
            Signed at <FormattedDate value={signature.signed_at} />
            {signature.round_no ? ` - Round ${signature.round_no}` : ""}
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

      {signature.isWebAuthn && (
        <div className="mt-4 grid gap-2 rounded-xl bg-indigo-50/60 p-4 ring-1 ring-indigo-100 md:grid-cols-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-900 md:col-span-2">
            Authentication evidence
          </p>
          <Field
            label="Authenticator"
            value={
              authName
                ? `${authName} / platform authenticator`
                : "Platform authenticator"
            }
          />
          <Field
            label="Credential scope"
            value={
              signature.signer.deviceType === "singleDevice"
                ? "Single-device credential; hardware-backed status depends on the authenticator and operating environment."
                : signature.signer.deviceType === "multiDevice"
                  ? "Multi-device credential; may be synced by the platform provider."
                  : "Credential scope not reported."
            }
          />
          <Field
            label="User verification"
            value={
              flags?.userVerified
                ? "PIN or biometric verification reported by the authenticator."
                : "Not reported."
            }
            ok={flags?.userVerified}
          />
          <Field
            label="User present"
            value={flags?.userPresent ? "Yes" : "No"}
            ok={flags?.userPresent}
          />
          <Field
            label="Backup eligible"
            value={
              flags?.backupEligible
                ? "Yes (the credential may be backed up by the platform)"
                : "No backup flag reported"
            }
          />
          <Field
            label="Sign counter"
            value={counter != null ? counter.toString() : "Not reported"}
          />
          {signature.signer.aaguid && (
            <Field
              label="AAGUID"
              value={signature.signer.aaguid}
              mono
              className="md:col-span-2"
            />
          )}
          {signature.signer.registeredAt && (
            <Field
              label="Credential registered"
              value={
                <FormattedDate value={signature.signer.registeredAt} />
              }
              className="md:col-span-2"
            />
          )}
        </div>
      )}

      <details className="mt-3 rounded-xl border border-gray-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
          Technical details
        </summary>
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            SHA-256 hash signed
          </p>
          <p className="mt-1 break-all rounded-xl bg-white p-3 font-mono text-[11px] text-gray-700 ring-1 ring-gray-200">
            {signature.signature_hash}
          </p>
        </div>

        {hasCrypto && (
          <div className="mt-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
              Signature bytes
            </p>
            <p className="mt-1 break-all rounded-xl bg-white p-3 font-mono text-[10px] text-gray-700 ring-1 ring-gray-200">
              {signature.signature_bytes}
            </p>
          </div>
        )}
      </details>
    </section>
  );
}

function Field({
  label,
  value,
  ok,
  mono,
  className,
}: {
  label: string;
  value: React.ReactNode;
  ok?: boolean;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
        {label}
      </p>
      <p
        className={`mt-0.5 text-xs ${
          mono ? "break-all font-mono" : ""
        } ${
          ok === true
            ? "font-semibold text-green-800"
            : ok === false
              ? "font-semibold text-red-800"
              : "text-gray-800"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
