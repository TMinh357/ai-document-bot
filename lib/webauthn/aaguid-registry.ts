// Small known-AAGUID dictionary. Falls back to "Platform authenticator (AAGUID ...)"
// for unknown values.
//
// AAGUIDs are stable per authenticator model. The full registry lives at
// https://github.com/passkeydeveloper/passkey-authenticator-aaguids - we ship a
// minimal subset that covers the common platform authenticators.

const REGISTRY: Record<string, string> = {
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello platform authenticator",
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello platform authenticator",
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello platform authenticator",
  "dd4ec289-e01d-41c9-bb89-70fa845d4bf2": "iCloud Keychain (Managed)",
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "iCloud Keychain (Apple Passkeys)",
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "b84e4048-15dc-4dd0-8640-f4f60813c8af": "NordPass",
  "bada5566-a7aa-401f-bd96-45619a55120d": "1Password",
  "d548826e-79b4-db40-a3d8-11116f7e8349": "Bitwarden",
  "adce0002-35bc-c60a-648b-0b25f1f05503": "Chrome on Mac",
  "00000000-0000-0000-0000-000000000000": "Unknown / unattested",
};

export function aaguidToName(aaguid: string | null | undefined): string {
  if (!aaguid) return "Unknown authenticator";
  const normalized = aaguid.toLowerCase().trim();
  if (REGISTRY[normalized]) return REGISTRY[normalized];
  return `Platform authenticator (AAGUID ${normalized.slice(0, 8)}...)`;
}
