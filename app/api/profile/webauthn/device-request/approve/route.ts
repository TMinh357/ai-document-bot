import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExpectedOrigin, getRpId } from "@/lib/webauthn/config";
import {
  getActiveCredentials,
  updateCredentialCounter,
} from "@/lib/webauthn/credentials";

export const runtime = "nodejs";

// Once approved, the new device has this long to finish registering. The
// approver and the device needing the key are often in different places, so
// this is a day rather than minutes.
const REGISTRATION_WINDOW_HOURS = 24;

// Approve a pending device request by proving possession of a signing key the
// account already holds. This is the control that stops a stolen password from
// being enough to mint a new signing key: the approval itself must be signed
// by hardware the real user is holding.
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

  let body: { requestId?: string; assertion?: AuthenticationResponseJSON };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const assertion = body.assertion;

  if (!requestId || !assertion || typeof assertion !== "object") {
    return NextResponse.json(
      { error: "A request id and a signed assertion are required." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: req } = await admin
    .from("device_approval_requests")
    .select("id, user_id, challenge, status, expires_at")
    .eq("id", requestId)
    .maybeSingle();

  if (!req) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  // Only the account holder can approve their own device request.
  if (req.user_id !== user.id) {
    return NextResponse.json(
      { error: "This request belongs to another account." },
      { status: 403 }
    );
  }

  if (req.status !== "pending") {
    return NextResponse.json(
      { error: "This request has already been handled." },
      { status: 400 }
    );
  }

  if (new Date(req.expires_at) < new Date()) {
    await admin
      .from("device_approval_requests")
      .update({ status: "expired" })
      .eq("id", req.id);

    return NextResponse.json({ error: "This request expired." }, { status: 400 });
  }

  // The assertion must come from a credential this account already holds and
  // that has not been revoked.
  const active = await getActiveCredentials(admin, user.id);
  const match = active.find((c) => c.credential_id === assertion.id);

  if (!match) {
    return NextResponse.json(
      {
        error:
          "That signing key is not registered to this account, or has been revoked.",
      },
      { status: 403 }
    );
  }

  let verified = false;
  let newCounter = match.counter;

  try {
    const result = await verifyAuthenticationResponse({
      response: assertion,
      // The challenge is the request's own nonce, so an assertion captured
      // from a document signing cannot be replayed here.
      expectedChallenge: req.challenge,
      expectedOrigin: getExpectedOrigin(),
      expectedRPID: getRpId(),
      requireUserVerification: true,
      credential: {
        id: match.credential_id,
        publicKey: new Uint8Array(Buffer.from(match.public_key, "base64")),
        counter: match.counter,
        transports: (match.transports as AuthenticatorTransport[] | null) ?? undefined,
      },
    });
    verified = result.verified;
    newCounter = result.authenticationInfo.newCounter;
  } catch {
    verified = false;
  }

  if (!verified) {
    return NextResponse.json(
      { error: "Could not verify that signature." },
      { status: 400 }
    );
  }

  await updateCredentialCounter(admin, match.credential_id, newCounter);

  // Approving opens a separate, bounded window in which the new device may
  // complete registration.
  const approvedExpiresAt = new Date(
    Date.now() + REGISTRATION_WINDOW_HOURS * 3_600_000
  ).toISOString();

  const { error: updateError } = await admin
    .from("device_approval_requests")
    .update({
      status: "approved",
      approval_method: "existing_key",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      approved_expires_at: approvedExpiresAt,
    })
    .eq("id", req.id)
    .eq("status", "pending");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "DEVICE_APPROVAL_GRANTED",
    target_table: "device_approval_requests",
    target_id: req.id,
    metadata: {
      method: "existing_key",
      approving_credential: match.credential_id,
    },
  });

  return NextResponse.json({ ok: true });
}

type AuthenticatorTransport =
  | "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb";
