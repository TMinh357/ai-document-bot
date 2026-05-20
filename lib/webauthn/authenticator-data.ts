// Decode the WebAuthn authenticatorData binary blob into human-readable fields.
//
// Layout (per WebAuthn spec):
//   bytes  0..31  : SHA-256 hash of the RP ID
//   byte   32     : flags (UP, UV, BE, BS, AT, ED)
//   bytes 33..36  : signature counter (uint32, big-endian)
//   if AT flag set (registration only):
//     bytes 37..52: AAGUID
//     ...
//
// Authentication assertions never have the AT flag, so we only parse the
// rpIdHash, flags, and counter from a signing event.

export type AuthenticatorDataFlags = {
  userPresent: boolean;
  userVerified: boolean;
  backupEligible: boolean;
  backupState: boolean;
  attestedCredentialData: boolean;
  extensionData: boolean;
};

export type DecodedAuthenticatorData = {
  rpIdHashHex: string;
  flags: AuthenticatorDataFlags;
  counter: number;
};

// authenticatorData arrives from the client as a base64url string and is
// stored in the same form in the database.
export function decodeAuthenticatorData(
  base64urlOrBase64: string
): DecodedAuthenticatorData | null {
  try {
    const buf = Buffer.from(base64urlOrBase64, "base64url");
    if (buf.length < 37) return null;

    const flagsByte = buf[32];

    return {
      rpIdHashHex: buf.subarray(0, 32).toString("hex"),
      flags: {
        userPresent: (flagsByte & 0x01) !== 0,
        userVerified: (flagsByte & 0x04) !== 0,
        backupEligible: (flagsByte & 0x08) !== 0,
        backupState: (flagsByte & 0x10) !== 0,
        attestedCredentialData: (flagsByte & 0x40) !== 0,
        extensionData: (flagsByte & 0x80) !== 0,
      },
      counter: buf.readUInt32BE(33),
    };
  } catch {
    return null;
  }
}
