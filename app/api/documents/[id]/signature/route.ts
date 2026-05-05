import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { data: document } = await supabase
    .from("documents")
    .select("id, status, owner_id")
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

  const { error: signatureError } = await supabase
    .from("document_signatures")
    .insert({
      document_id: id,
      signer_id: user.id,
      signature_hash: signatureHash,
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
      algorithm: "SHA-256",
      signature_hash: signatureHash,
    },
  });

  return NextResponse.json({
    signatureHash,
    algorithm: "SHA-256",
  });
}