// Browser-side helpers for invoking WebAuthn ceremonies.

import { startAuthentication } from "@simplewebauthn/browser";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";

// Convert a hex string into base64url for use as a WebAuthn challenge.
function hexToBase64Url(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function signFileHashWithWebAuthn(args: {
  fileHashHex: string;
  credentialId: string;
  rpId: string;
}): Promise<AuthenticationResponseJSON> {
  const challenge = hexToBase64Url(args.fileHashHex);

  return startAuthentication({
    optionsJSON: {
      challenge,
      rpId: args.rpId,
      allowCredentials: [
        {
          id: args.credentialId,
          type: "public-key",
          transports: ["internal"],
        },
      ],
      userVerification: "required",
      timeout: 60000,
    },
  });
}

// A signing key is bound to the origin it was registered on, so a key created
// on the deployed site cannot be used on localhost (and vice versa), and a key
// removed from Windows Hello is gone for good. The browser surfaces both as
// NotAllowedError — the same error it uses for a cancelled prompt — so callers
// need this to decide whether to offer re-registration.
export function isMissingCredentialError(error: unknown): boolean {
  const name = (error as { name?: string })?.name;
  return name === "NotAllowedError" || name === "InvalidStateError";
}

// Turn a raw WebAuthn DOMException into something a signer can act on. The
// browser's own text ("The operation either timed out or was not allowed")
// reads like a crash rather than a cancellation.
export function describeSigningError(error: unknown): string {
  const name = (error as { name?: string })?.name;
  const origin =
    typeof window !== "undefined" ? window.location.hostname : "this site";

  switch (name) {
    case "NotAllowedError":
      return `Signing did not complete. Either the prompt was cancelled, or this device has no signing key for ${origin} — a key registered on a different address cannot be used here.`;
    case "InvalidStateError":
      return "This device's signing key is no longer registered for your account. Register a new signing key to continue.";
    case "NotSupportedError":
    case "SecurityError":
      return "This browser or device cannot sign documents. Use a device with Windows Hello, Touch ID, or an equivalent platform authenticator.";
    case "AbortError":
      return "Signing was interrupted. Please try again.";
    default:
      return error instanceof Error && error.message
        ? error.message
        : "Signing failed. Please try again.";
  }
}

// Derive the rpId on the client side from the current hostname.
export function getClientRpId(): string {
  if (typeof window !== "undefined" && window.location?.hostname) {
    return window.location.hostname;
  }
  return "localhost";
}
