import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import { getRpId, RP_NAME } from "@/lib/webauthn/config";

export const runtime = "nodejs";

const CHALLENGE_COOKIE = "webauthn_register_challenge";

export async function POST() {
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, webauthn_credential_id")
    .eq("id", user.id)
    .single();

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: getRpId(),
    userID: new TextEncoder().encode(user.id),
    userName: user.email ?? user.id,
    userDisplayName: profile?.full_name ?? user.email ?? user.id,
    attestationType: "none",
    authenticatorSelection: {
      // Platform authenticator = Windows Hello / Touch ID / Android biometric.
      authenticatorAttachment: "platform",
      // Require user verification (PIN / biometric) at registration.
      userVerification: "required",
      residentKey: "preferred",
    },
    excludeCredentials: profile?.webauthn_credential_id
      ? [{ id: profile.webauthn_credential_id }]
      : [],
  });

  // Store the challenge in an HttpOnly cookie so the verify step can confirm it.
  const cookieStore = await cookies();
  cookieStore.set(CHALLENGE_COOKIE, options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });

  return NextResponse.json(options);
}
