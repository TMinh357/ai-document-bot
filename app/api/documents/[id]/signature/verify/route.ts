import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import { getExpectedOrigin, getRpId } from "@/lib/webauthn/config";
import { hexToBase64Url } from "@/lib/webauthn/verify";

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
  isWebAuthn: boolean;
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

  const { data: signatures } = await supabase
    .from("document_signatures")
    .select(
      "id, signer_id, signature_hash, signature_bytes, client_data_json, authenticator_data, credential_id, algorithm, signature_role, round_no, signed_at"
    )
    .eq("document_id", id)
    .order("signed_at", { ascending: true });

  if (!signatures || signatures.length === 0) {
    return NextResponse.json(
      { error: "This document has no signatures yet." },
      { status: 404 }
    );
  }

  // Compute current file hash.
  const { data: version } = await supabase
    .from("document_versions")
    .select("file_path")
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
      const r = await fetch(signedUrlData.signedUrl);
      if (!r.ok) {
        fileMissing = true;
      } else {
        currentHash = createHash("sha256")
          .update(Buffer.from(await r.arrayBuffer()))
          .digest("hex");
      }
    }
  }

  // Fetch all signer profiles in one shot.
  const signerIds = Array.from(new Set(signatures.map((s) => s.signer_id)));
  const { data: signerProfiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", signerIds);

  const profileMap = new Map(
    (signerProfiles ?? []).map((p) => [p.id, p])
  );

  // Verify each signature against the key that actually produced it, looked up
  // by the signature's own credential_id — revoked keys included. A signature
  // made with a key that was later replaced is still a genuine signature, and
  // reporting it as invalid would be wrong.
  const credentialIds = Array.from(
    new Set(signatures.map((s) => s.credential_id).filter(Boolean))
  ) as string[];

  const { data: credentialRows } = credentialIds.length
    ? await supabase
        .from("webauthn_credentials")
        .select("credential_id, public_key, transports, revoked_at")
        .in("credential_id", credentialIds)
    : { data: [] as null | [] };

  const credentialMap = new Map(
    (credentialRows ?? []).map((c) => [c.credential_id, c])
  );

  // Verify every signature in parallel — each WebAuthn verification involves
  // CBOR parsing + COSE key import + ECDSA verify (~100–200ms). Serializing
  // them across N signatures adds N × that cost; Promise.all collapses it to
  // max(single).
  const verified: VerifiedSignature[] = await Promise.all(
    signatures.map(async (sig) => {
      const profile = profileMap.get(sig.signer_id);
      const hashMatch =
        currentHash !== null && sig.signature_hash === currentHash;
      const isWebAuthn = Boolean(sig.client_data_json && sig.authenticator_data);

      let cryptoSignatureValid: boolean | null = null;

      const credential = sig.credential_id
        ? credentialMap.get(sig.credential_id)
        : undefined;

      if (isWebAuthn && sig.signature_bytes) {
        if (credential) {
          const reconstructed: AuthenticationResponseJSON = {
            id: credential.credential_id,
            rawId: credential.credential_id,
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
                id: credential.credential_id,
                publicKey: new Uint8Array(
                  Buffer.from(credential.public_key, "base64")
                ),
                counter: 0, // bypass replay-counter check for stored signatures
                transports:
                  (credential.transports as
                    | AuthenticatorTransport[]
                    | null) ?? undefined,
              },
            });
            cryptoSignatureValid = result.verified;
          } catch {
            cryptoSignatureValid = false;
          }
        } else {
          cryptoSignatureValid = false;
        }
      }

      return {
        id: sig.id,
        signerId: sig.signer_id,
        signerName: profile?.full_name ?? null,
        signatureRole: sig.signature_role,
        algorithm: sig.algorithm ?? "SHA-256",
        signedAt: sig.signed_at,
        signatureHash: sig.signature_hash,
        hashMatch,
        cryptoSignaturePresent: Boolean(sig.signature_bytes),
        cryptoSignatureValid,
        isWebAuthn,
      };
    })
  );

  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: "VERIFY_INTEGRITY",
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

type AuthenticatorTransport =
  | "ble"
  | "cable"
  | "hybrid"
  | "internal"
  | "nfc"
  | "smart-card"
  | "usb";
