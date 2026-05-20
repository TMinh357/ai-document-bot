// Server-side helpers for verifying a WebAuthn signing assertion against a file hash.

import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { getExpectedOrigin, getRpId } from "./config";

export type WebAuthnSignaturePayload = {
  assertion: AuthenticationResponseJSON;
};

type StoredCredential = {
  credentialId: string;
  publicKeyB64: string;
  counter: number;
  transports: string[] | null;
};

// Convert a hex string (e.g. SHA-256 hash) into base64url, which is the encoding
// WebAuthn uses for the challenge field in clientDataJSON.
export function hexToBase64Url(hex: string): string {
  const buf = Buffer.from(hex, "hex");
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type VerifyResult =
  | { ok: true; newCounter: number }
  | { ok: false; error: string };

export async function verifyWebAuthnSignature(args: {
  assertion: AuthenticationResponseJSON;
  expectedFileHashHex: string;
  storedCredential: StoredCredential;
}): Promise<VerifyResult> {
  const expectedChallenge = hexToBase64Url(args.expectedFileHashHex);

  try {
    const verification = await verifyAuthenticationResponse({
      response: args.assertion,
      expectedChallenge,
      expectedOrigin: getExpectedOrigin(),
      expectedRPID: getRpId(),
      requireUserVerification: true,
      credential: {
        id: args.storedCredential.credentialId,
        publicKey: new Uint8Array(
          Buffer.from(args.storedCredential.publicKeyB64, "base64")
        ),
        counter: args.storedCredential.counter,
        transports: args.storedCredential.transports as
          | AuthenticatorTransport[]
          | undefined ?? undefined,
      },
    });

    if (!verification.verified) {
      return { ok: false, error: "Signature could not be verified." };
    }

    return { ok: true, newCounter: verification.authenticationInfo.newCounter };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Verification failed.",
    };
  }
}

// AuthenticatorTransport ambient type — declared narrowly to avoid pulling DOM types into Node.
type AuthenticatorTransport = "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb";
