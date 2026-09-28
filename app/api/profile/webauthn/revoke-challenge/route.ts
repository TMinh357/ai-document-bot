import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveCredentials } from "@/lib/webauthn/credentials";

export const runtime = "nodejs";

export const REVOKE_CHALLENGE_COOKIE = "webauthn_revoke_challenge";

// Issues a one-off challenge for revoking a signing key.
//
// Revoking used to need nothing but a session, which meant a stolen password
// was enough to strip an account of its keys. Requiring a signature from a key
// the account still holds makes revocation cost possession of a device, the
// same thing registering a key costs.
//
// The challenge is fresh random bytes rather than anything reused: an
// assertion captured from signing a document must not be replayable here.
export async function POST() {
  const auth = await requireApiUser();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const active = await getActiveCredentials(admin, auth.user.id);

  if (active.length === 0) {
    return NextResponse.json(
      { error: "This account has no signing key to revoke." },
      { status: 400 }
    );
  }

  const challenge = randomBytes(32).toString("base64url");

  const store = await cookies();
  store.set(REVOKE_CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 5 * 60,
  });

  return NextResponse.json({
    challenge,
    credentialIds: active.map((c) => c.credential_id),
  });
}
