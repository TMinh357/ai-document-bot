// Central WebAuthn relying party (RP) configuration.
//
// rpID is the domain that scopes credentials. It must match the page's origin
// hostname (without scheme or port) for the browser to accept the ceremony.
// In development this is "localhost"; in production set NEXT_PUBLIC_RP_ID to
// the deployed domain (e.g. "ai-doc-review.vercel.app").

export const RP_NAME = "AI Document Review";

export function getRpId(): string {
  const fromEnv = process.env.NEXT_PUBLIC_RP_ID;
  if (fromEnv) return fromEnv;
  // Vercel deployments expose VERCEL_URL without scheme
  const vercel = process.env.VERCEL_URL;
  if (vercel) return vercel.replace(/^https?:\/\//, "").split("/")[0];
  return "localhost";
}

export function getExpectedOrigin(): string | string[] {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return ["http://localhost:3000", "http://localhost:3001"];
}
