import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExpectedOrigin, getRpId } from "@/lib/webauthn/config";
import { getActiveCredentials } from "@/lib/webauthn/credentials";
import { sendSigningKeyRegisteredEmail } from "@/lib/email";

export const runtime = "nodejs";

const CHALLENGE_COOKIE = "webauthn_register_challenge";
const REQUEST_COOKIE = "webauthn_register_request";

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
  const approvalRequestId = cookieStore.get(REQUEST_COOKIE)?.value ?? null;

  if (!expectedChallenge) {
    return NextResponse.json(
      { error: "Registration challenge expired. Please try again." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const active = await getActiveCredentials(admin, user.id);
  const isAdditionalDevice = active.length > 0;

  // Re-check the approval here as well as in register-options. The options
  // route decides whether to start the ceremony; this route is what actually
  // grants signing power, so it must not rely on the earlier check alone.
  let approval: { id: string; approval_method: string | null } | null = null;

  if (isAdditionalDevice) {
    if (!approvalRequestId) {
      return NextResponse.json(
        {
          error:
            "Adding a signing key to an account that already has one requires an approved request.",
          code: "APPROVAL_REQUIRED",
        },
        { status: 403 }
      );
    }

    const { data } = await admin
      .from("device_approval_requests")
      .select("id, approval_method")
      .eq("id", approvalRequestId)
      .eq("user_id", user.id)
      .eq("status", "approved")
      .gt("approved_expires_at", new Date().toISOString())
      .maybeSingle();

    if (!data) {
      return NextResponse.json(
        {
          error:
            "That device-approval request is no longer valid. Please request approval again.",
          code: "APPROVAL_REQUIRED",
        },
        { status: 403 }
      );
    }

    approval = data;
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

  // Insert, never overwrite: signatures made with an earlier key must stay
  // verifiable against the key that actually produced them.
  const { error: insertError } = await admin
    .from("webauthn_credentials")
    .insert({
      user_id: user.id,
      credential_id: credentialIdB64,
      public_key: publicKeyB64,
      counter: credential.counter,
      device_type: credentialDeviceType,
      transports: credential.transports ?? null,
      aaguid: aaguid || null,
      device_label: isAdditionalDevice
        ? `Device ${active.length + 1}`
        : "First device",
    });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Burn the approval so it cannot authorise a second registration.
  if (approval) {
    await admin
      .from("device_approval_requests")
      .update({ status: "used" })
      .eq("id", approval.id);
  }

  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    null;

  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "REGISTER_WEBAUTHN_CREDENTIAL",
    target_table: "webauthn_credentials",
    target_id: user.id,
    metadata: {
      algorithm: "WebAuthn-ES256",
      device_type: credentialDeviceType,
      transports: credential.transports ?? null,
      aaguid: aaguid || null,
      additional_device: isAdditionalDevice,
      approval_method: approval?.approval_method ?? "first_key",
      ip,
    },
  });

  // Tell the account holder out of band. Someone who stole the password will
  // usually not control the mailbox, so this is the cheapest way for a real
  // user to notice a key being enrolled that they did not enrol.
  try {
    await sendSigningKeyRegisteredEmail({
      userId: user.id,
      isAdditionalDevice,
      approvalMethod: approval?.approval_method ?? null,
      ip,
      userAgent: hdrs.get("user-agent"),
    });
  } catch {
    // Best-effort: never fail the registration because email is down.
  }

  cookieStore.delete(CHALLENGE_COOKIE);
  cookieStore.delete(REQUEST_COOKIE);

  return NextResponse.json({ ok: true });
}
