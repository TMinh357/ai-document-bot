import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  hexToBytes,
  importPublicKeyJwk,
  verifySignatureBytes,
} from "@/lib/crypto/signing";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type VerifiedSignature = {
  id: string;
  signerId: string;
  signerName: string | null;
  signatureRole: string | null;
  algorithm: string;
  signedAt: string;
  signatureHash: string;
  hashMatch: boolean;
  cryptoSignaturePresent: boolean;
  cryptoSignatureValid: boolean | null;
};

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

  // Pull every signature attached to this document (owner + all reviewers + legacy).
  const { data: signatures } = await supabase
    .from("document_signatures")
    .select(
      "id, signer_id, signature_hash, signature_bytes, algorithm, signature_role, round_no, signed_at"
    )
    .eq("document_id", id)
    .order("signed_at", { ascending: true });

  if (!signatures || signatures.length === 0) {
    return NextResponse.json(
      { error: "This document has no signatures yet." },
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

  let currentHash: string | null = null;
  let fileMissing = false;

  if (!version?.file_path) {
    fileMissing = true;
  } else {
    const { data: signedUrlData } = await supabase.storage
      .from("documents")
      .createSignedUrl(version.file_path, 60);

    if (!signedUrlData?.signedUrl) {
      fileMissing = true;
    } else {
      const fileResponse = await fetch(signedUrlData.signedUrl);
      if (!fileResponse.ok) {
        fileMissing = true;
      } else {
        currentHash = createHash("sha256")
          .update(Buffer.from(await fileResponse.arrayBuffer()))
          .digest("hex");
      }
    }
  }

  // Look up signer names + public keys in one shot.
  const signerIds = Array.from(new Set(signatures.map((s) => s.signer_id)));
  const { data: signerProfiles } = await supabase
    .from("profiles")
    .select("id, full_name, public_key")
    .in("id", signerIds);

  const profileMap = new Map(
    (signerProfiles ?? []).map((p) => [
      p.id,
      { name: p.full_name as string | null, publicKey: p.public_key as string | null },
    ])
  );

  const verified: VerifiedSignature[] = [];

  for (const sig of signatures) {
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
      id: sig.id,
      signerId: sig.signer_id,
      signerName: profile?.name ?? null,
      signatureRole: sig.signature_role,
      algorithm: sig.algorithm ?? "SHA-256",
      signedAt: sig.signed_at,
      signatureHash: sig.signature_hash,
      hashMatch,
      cryptoSignaturePresent: Boolean(sig.signature_bytes),
      cryptoSignatureValid,
    });
  }

  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: "VERIFY_DOCUMENT_SIGNATURE",
    target_table: "documents",
    target_id: id,
    metadata: {
      signature_count: verified.length,
      file_missing: fileMissing,
      all_hashes_match: verified.every((v) => v.hashMatch),
      all_crypto_valid: verified
        .filter((v) => v.cryptoSignaturePresent)
        .every((v) => v.cryptoSignatureValid === true),
      current_hash: currentHash,
    },
  });

  return NextResponse.json({
    fileMissing,
    currentHash,
    signatures: verified,
  });
}
