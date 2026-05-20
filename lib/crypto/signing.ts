// Web Crypto helpers for ECDSA P-256 signing.
// Same API in browser (window.crypto.subtle) and Node (globalThis.crypto.subtle since v20).

const ALGO = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN_PARAMS = { name: "ECDSA", hash: "SHA-256" } as const;

export const ALGORITHM_LABEL = "ECDSA-P256";

export type ExportedKeyPair = {
  publicKeyJwk: string;
  privateKeyJwk: string;
};

export async function generateSigningKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ALGO, true, ["sign", "verify"]);
}

export async function exportKeyPairJwk(
  pair: CryptoKeyPair
): Promise<ExportedKeyPair> {
  const [pub, priv] = await Promise.all([
    crypto.subtle.exportKey("jwk", pair.publicKey),
    crypto.subtle.exportKey("jwk", pair.privateKey),
  ]);
  return {
    publicKeyJwk: JSON.stringify(pub),
    privateKeyJwk: JSON.stringify(priv),
  };
}

export async function importPrivateKeyJwk(jwk: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", JSON.parse(jwk), ALGO, true, ["sign"]);
}

export async function importPublicKeyJwk(jwk: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", JSON.parse(jwk), ALGO, false, [
    "verify",
  ]);
}

// Sign the given hash bytes. Returns a base64 string of the raw r||s signature.
export async function signHashBytes(
  privateKey: CryptoKey,
  hashBytes: Uint8Array
): Promise<string> {
  const sig = await crypto.subtle.sign(
    SIGN_PARAMS,
    privateKey,
    hashBytes as BufferSource
  );
  return bytesToBase64(new Uint8Array(sig));
}

export async function verifySignatureBytes(
  publicKey: CryptoKey,
  signatureBase64: string,
  hashBytes: Uint8Array
): Promise<boolean> {
  const sig = base64ToBytes(signatureBase64);
  return crypto.subtle.verify(
    SIGN_PARAMS,
    publicKey,
    sig as BufferSource,
    hashBytes as BufferSource
  );
}

// Convert a hex-encoded SHA-256 hash (64 chars) into raw bytes.
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Hex string must have an even length.");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
