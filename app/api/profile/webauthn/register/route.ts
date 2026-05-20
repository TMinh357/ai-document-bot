import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import { getExpectedOrigin, getRpId } from "@/lib/webauthn/config";

export const runtime = "nodejs";

const CHALLENGE_COOKIE = "webauthn_register_challenge";

export async function POST(request: Request) {
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

  const cookieStore = await cookies();
  const expectedChallenge = cookieStore.get(CHALLENGE_COOKIE)?.value;

  if (!expectedChallenge) {
    return NextResponse.json(
      { error: "Registration challenge expired. Please try again." },
      { status: 400 }
    );
  }

  let attestation: RegistrationResponseJSON;
  try {
    attestation = (await request.json()) as RegistrationResponseJSON;
  } catch {
    return NextResponse.json(
      { error: "Invalid attestation payload." },
      { status: 400 }
    );
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: attestation,
      expectedChallenge,
      expectedOrigin: getExpectedOrigin(),
      expectedRPID: getRpId(),
      requireUserVerification: true,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to verify registration response.",
      },
      { status: 400 }
    );
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json(
      { error: "Registration could not be verified." },
      { status: 400 }
    );
  }

  const { credential, credentialDeviceType, aaguid } =
    verification.registrationInfo;

  const credentialIdB64 = credential.id;
  const publicKeyB64 = Buffer.from(credential.publicKey).toString("base64");

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      webauthn_credential_id: credentialIdB64,
      webauthn_public_key: publicKeyB64,
      webauthn_counter: credential.counter,
      webauthn_device_type: credentialDeviceType,
      webauthn_transports: credential.transports ?? null,
      webauthn_registered_at: new Date().toISOString(),
      webauthn_aaguid: aaguid || null,
    })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: "REGISTER_WEBAUTHN_CREDENTIAL",
    target_table: "profiles",
    target_id: user.id,
    metadata: {
      algorithm: "WebAuthn-ES256",
      device_type: credentialDeviceType,
      transports: credential.transports ?? null,
      aaguid: aaguid || null,
    },
  });

  // Clear the challenge cookie.
  cookieStore.delete(CHALLENGE_COOKIE);

  return NextResponse.json({ ok: true });
}
