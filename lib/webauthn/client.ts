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

// Derive the rpId on the client side from the current hostname.
export function getClientRpId(): string {
  if (typeof window !== "undefined" && window.location?.hostname) {
    return window.location.hostname;
  }
  return "localhost";
}
