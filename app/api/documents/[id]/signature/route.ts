import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  importPublicKeyJwk,
  verifySignatureBytes,
  hexToBytes,
  ALGORITHM_LABEL,
} from "@/lib/crypto/signing";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const signatureBytes =
    typeof body?.signatureBytes === "string" ? body.signatureBytes : null;

  const { data: document } = await supabase
    .from("documents")
    .select("id, status, owner_id, approved_hash")
    .eq("id", id)
    .single();

  if (!document) {
    return NextResponse.json(
      { error: "Document was not found." },
      { status: 404 }
    );
  }

  if (document.status !== "approved") {
    return NextResponse.json(
      { error: "Only approved documents can be signed." },
      { status: 400 }
    );
  }

  const { data: version } = await supabase
    .from("document_versions")
    .select("id, file_path")
    .eq("document_id", id)
    .order("version_no", { ascending: false })
    .limit(1)
    .single();

  if (!version?.file_path) {
    return NextResponse.json(
      { error: "No uploaded file was found for this document." },
      { status: 404 }
    );
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from("documents")
    .createSignedUrl(version.file_path, 60);

  if (signedUrlError || !signedUrlData?.signedUrl) {
    return NextResponse.json(
      { error: "Failed to create a temporary file URL." },
      { status: 500 }
    );
  }

  const fileResponse = await fetch(signedUrlData.signedUrl);

  if (!fileResponse.ok) {
    return NextResponse.json(
      { error: "Failed to download the document file." },
      { status: 500 }
    );
  }

  const arrayBuffer = await fileResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const signatureHash = createHash("sha256").update(buffer).digest("hex");

  // Pre-sign tamper check: the file must still match approved_hash.
  if (document.approved_hash && signatureHash !== document.approved_hash) {
    return NextResponse.json(
      {
        error:
          "Signing rejected: the file was modified after approval. The document must be re-submitted for review.",
      },
      { status: 409 }
    );
  }

  // If the client supplied a cryptographic signature, verify it against
  // the signer's public key before storing.
  let storedAlgorithm: string = "SHA-256";

  if (signatureBytes) {
    const { data: signerProfile } = await supabase
      .from("profiles")
      .select("public_key")
      .eq("id", user.id)
      .single();

    if (!signerProfile?.public_key) {
      return NextResponse.json(
        {
          error:
            "No public key is registered for your account. Re-open the Sign dialog to set up a signing key.",
        },
        { status: 400 }
      );
    }

    try {
      const publicKey = await importPublicKeyJwk(signerProfile.public_key);
      const hashBytes = hexToBytes(signatureHash);
      const valid = await verifySignatureBytes(
        publicKey,
        signatureBytes,
        hashBytes
      );

      if (!valid) {
        return NextResponse.json(
          {
            error:
              "Signature verification failed. The provided signature does not match your public key.",
          },
          { status: 400 }
        );
      }

      storedAlgorithm = ALGORITHM_LABEL;
    } catch {
      return NextResponse.json(
        { error: "Could not verify the supplied signature." },
        { status: 400 }
      );
    }
  }

  const { error: signatureError } = await supabase
    .from("document_signatures")
    .insert({
      document_id: id,
      signer_id: user.id,
      signature_hash: signatureHash,
      signature_bytes: signatureBytes,
      algorithm: storedAlgorithm,
    });

  if (signatureError) {
    return NextResponse.json(
      { error: signatureError.message },
      { status: 500 }
    );
  }

  await supabase
    .from("documents")
    .update({
      status: "signed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: "SIGN_DOCUMENT",
    target_table: "documents",
    target_id: id,
    metadata: {
      version_id: version.id,
      algorithm: storedAlgorithm,
      signature_hash: signatureHash,
      has_crypto_signature: Boolean(signatureBytes),
    },
  });

  return NextResponse.json({
    signatureHash,
    algorithm: storedAlgorithm,
    hasCryptoSignature: Boolean(signatureBytes),
  });
}
