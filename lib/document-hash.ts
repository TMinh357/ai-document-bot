// Returns the SHA-256 hash of the latest document version's file, using the
// cached value on document_versions.content_hash when available.
//
// Lazy backfill: if content_hash is NULL (a row from before the cache was added),
// we download the file once, compute the hash, write it back, and return it.
// All subsequent calls for that version hit the cache and skip the download.

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "documents";

export type CachedHash = {
  hash: string;
  versionId: string;
  versionNo: number;
  filePath: string;
  fromCache: boolean;
};

export async function getOrComputeLatestVersionHash(
  admin: SupabaseClient,
  documentId: string
): Promise<{ ok: true; data: CachedHash } | { ok: false; error: string; status: number }> {
  const { data: version } = await admin
    .from("document_versions")
    .select("id, version_no, file_path, content_hash")
    .eq("document_id", documentId)
    .order("version_no", { ascending: false })
    .limit(1)
    .single();

  if (!version?.file_path) {
    return { ok: false, error: "No uploaded file was found for this document.", status: 404 };
  }

  if (version.content_hash) {
    return {
      ok: true,
      data: {
        hash: version.content_hash,
        versionId: version.id,
        versionNo: version.version_no,
        filePath: version.file_path,
        fromCache: true,
      },
    };
  }

  // Cache miss — download once and backfill.
  const { data: signedUrlData, error: signedUrlError } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(version.file_path, 60);

  if (signedUrlError || !signedUrlData?.signedUrl) {
    return { ok: false, error: "Failed to access the file.", status: 500 };
  }

  const fileResponse = await fetch(signedUrlData.signedUrl);
  if (!fileResponse.ok) {
    return { ok: false, error: "Failed to download the file.", status: 500 };
  }

  const buf = Buffer.from(await fileResponse.arrayBuffer());
  const hash = createHash("sha256").update(buf).digest("hex");

  // Best-effort write-back; if the update fails the next call will retry.
  await admin
    .from("document_versions")
    .update({ content_hash: hash })
    .eq("id", version.id);

  return {
    ok: true,
    data: {
      hash,
      versionId: version.id,
      versionNo: version.version_no,
      filePath: version.file_path,
      fromCache: false,
    },
  };
}
