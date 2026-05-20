import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// Returns the SHA-256 hash of the latest version's file, so the client can
// sign it with their private key before posting a signed action.
export async function GET(_request: Request, context: RouteContext) {
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

  const { data: version } = await supabase
    .from("document_versions")
    .select("id, version_no, file_path")
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
      { error: "Failed to access the file." },
      { status: 500 }
    );
  }

  const fileResponse = await fetch(signedUrlData.signedUrl);

  if (!fileResponse.ok) {
    return NextResponse.json(
      { error: "Failed to download the file." },
      { status: 500 }
    );
  }

  const arrayBuffer = await fileResponse.arrayBuffer();
  const hash = createHash("sha256")
    .update(Buffer.from(arrayBuffer))
    .digest("hex");

  return NextResponse.json({
    hash,
    versionId: version.id,
    versionNo: version.version_no,
  });
}
