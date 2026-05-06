import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_MB = 10;

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

export type PdfValidationResult =
  | { ok: true; sizeBytes: number }
  | { ok: false; error: string };

export async function validatePdfAtPath(
  admin: SupabaseClient,
  bucket: string,
  path: string
): Promise<PdfValidationResult> {
  const { data: signed, error: signedError } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, 60);

  if (signedError || !signed?.signedUrl) {
    return {
      ok: false,
      error: "Could not access the uploaded file for validation.",
    };
  }

  const response = await fetch(signed.signedUrl, {
    headers: { Range: "bytes=0-7" },
  });

  if (!response.ok && response.status !== 206) {
    return { ok: false, error: "Could not read the uploaded file." };
  }

  let sizeBytes = 0;
  const contentRange = response.headers.get("content-range");

  if (contentRange) {
    const match = contentRange.match(/\/(\d+)$/);

    if (match) {
      sizeBytes = parseInt(match[1], 10);
    }
  } else {
    const contentLength = response.headers.get("content-length");

    if (contentLength) {
      sizeBytes = parseInt(contentLength, 10);
    }
  }

  if (sizeBytes > MAX_PDF_BYTES) {
    const sizeMb = (sizeBytes / 1024 / 1024).toFixed(1);

    return {
      ok: false,
      error: `File is too large (${sizeMb} MB). Maximum allowed size is ${MAX_PDF_MB} MB.`,
    };
  }

  const arrayBuffer = await response.arrayBuffer();
  const head = Buffer.from(arrayBuffer);

  if (head.length < 5 || !head.subarray(0, 5).equals(PDF_MAGIC)) {
    return {
      ok: false,
      error: "File is not a valid PDF (missing %PDF- header).",
    };
  }

  return { ok: true, sizeBytes };
}

export async function deleteStorageObject(
  admin: SupabaseClient,
  bucket: string,
  path: string
): Promise<void> {
  try {
    await admin.storage.from(bucket).remove([path]);
  } catch {
    // best-effort cleanup
  }
}
