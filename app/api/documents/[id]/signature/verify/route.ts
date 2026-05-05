import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
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

  const { data: signature } = await supabase
    .from("document_signatures")
    .select("id, signer_id, signature_hash, signed_at")
    .eq("document_id", id)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!signature) {
    return NextResponse.json(
      { error: "This document has not been signed yet." },
      { status: 404 }
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

  const currentHash = createHash("sha256").update(buffer).digest("hex");
  const valid = currentHash === signature.signature_hash;

  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: "VERIFY_DOCUMENT_SIGNATURE",
    target_table: "documents",
    target_id: id,
    metadata: {
      valid,
      current_hash: currentHash,
      signed_hash: signature.signature_hash,
      signature_id: signature.id,
    },
  });

  return NextResponse.json({
    valid,
    currentHash,
    signedHash: signature.signature_hash,
    signedAt: signature.signed_at,
    algorithm: "SHA-256",
  });
}
