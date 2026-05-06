import { createHash } from "crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/auth";
import PrintCertificateButton from "@/components/PrintCertificateButton";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

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

  const { data: signature } = await supabase
    .from("document_signatures")
    .select("id, signer_id, signature_hash, signed_at")
    .eq("document_id", id)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!signature) {
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
              No signature on record
            </h1>
            <p className="mt-3 text-gray-600">
              This document has not been signed yet, so no certificate can be
              generated.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const { data: signerProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", signature.signer_id)
    .single();

  const signerName = signerProfile?.full_name || signature.signer_id;

  const { data: version } = await supabase
    .from("document_versions")
    .select("id, version_no, file_path")
    .eq("document_id", id)
    .order("version_no", { ascending: false })
    .limit(1)
    .single();

  let valid = false;
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
        const arrayBuffer = await fileResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        currentHash = createHash("sha256").update(buffer).digest("hex");
        valid = currentHash === signature.signature_hash;
      }
    }
  }

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
                Certificate of Signature
              </p>
              <h1 className="mt-4 font-serif text-4xl font-bold text-gray-900">
                Document Signed
              </h1>
              <p className="muted-copy mt-3 text-sm">
                This certificate attests that the document below was signed
                using a SHA-256 cryptographic hash of its contents.
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

              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">
                  Signed by
                </p>
                <p className="mt-2 font-serif text-3xl italic text-gray-900">
                  {signerName}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Signed at
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {new Date(signature.signed_at).toLocaleString()}
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Document Status
                  </p>
                  <span className="mt-2 inline-flex items-center rounded-full bg-teal-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-teal-800">
                    {document.status}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                  SHA-256 Signature Hash
                </p>
                <p className="mt-2 break-all rounded-xl bg-slate-50 p-4 font-mono text-xs text-gray-700 ring-1 ring-gray-200">
                  {signature.signature_hash}
                </p>
              </div>

              <div
                className={`rounded-2xl border p-5 ${
                  verifyError
                    ? "border-yellow-200 bg-yellow-50"
                    : valid
                    ? "border-green-200 bg-green-50"
                    : "border-red-200 bg-red-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold text-white ${
                      verifyError
                        ? "bg-yellow-600"
                        : valid
                        ? "bg-green-600"
                        : "bg-red-600"
                    }`}
                  >
                    {verifyError ? "!" : valid ? "✓" : "✗"}
                  </span>

                  <div>
                    <p
                      className={`text-base font-bold ${
                        verifyError
                          ? "text-yellow-900"
                          : valid
                          ? "text-green-900"
                          : "text-red-900"
                      }`}
                    >
                      {verifyError
                        ? "Verification could not be completed"
                        : valid
                        ? "Signature Verified"
                        : "File Has Been Modified"}
                    </p>
                    <p
                      className={`text-sm ${
                        verifyError
                          ? "text-yellow-800"
                          : valid
                          ? "text-green-800"
                          : "text-red-800"
                      }`}
                    >
                      {verifyError ||
                        (valid
                          ? "The current document content matches the recorded signature hash."
                          : "The current hash does not match the recorded signature hash.")}
                    </p>
                  </div>
                </div>

                {currentHash && !valid && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
                      Current File Hash
                    </p>
                    <p className="mt-2 break-all rounded-xl bg-white p-3 font-mono text-xs text-red-700 ring-1 ring-red-200">
                      {currentHash}
                    </p>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 pt-6 text-center text-xs text-gray-500">
                <p>
                  Verified at: {verifiedAt.toLocaleString()}
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
