import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrComputeLatestVersionHash } from "@/lib/document-hash";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// Returns the SHA-256 hash of the latest version's file. Uses the cached
// content_hash column when available, otherwise downloads + caches on first call.
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

  const result = await getOrComputeLatestVersionHash(createAdminClient(), id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    hash: result.data.hash,
    versionId: result.data.versionId,
    versionNo: result.data.versionNo,
  });
}
