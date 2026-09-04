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

// Turn a raw WebAuthn DOMException into something a reviewer can act on.
// The browser reports a user who dismissed the Windows Hello prompt with the
// same NotAllowedError it uses for a timeout, and its default text ("The
// operation either timed out or was not allowed") reads like a crash.
export function describeSigningError(error: unknown): string {
  const name = (error as { name?: string })?.name;

  switch (name) {
    case "NotAllowedError":
      return "Signing was cancelled or timed out. Please try again and complete the Windows Hello prompt.";
    case "InvalidStateError":
      return "This device's signing key is not registered for your account. Set up your signing key again from your profile.";
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
