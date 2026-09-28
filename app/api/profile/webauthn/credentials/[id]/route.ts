import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/supabase/auth";
import { getExpectedOrigin, getRpId } from "@/lib/webauthn/config";
import {
  getActiveCredentials,
  updateCredentialCounter,
} from "@/lib/webauthn/credentials";
import { sendSigningKeyRevokedEmail } from "@/lib/email";
import { REVOKE_CHALLENGE_COOKIE } from "../../revoke-challenge/route";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// Revoke one of the caller's own signing keys.
//
// Revoking sets revoked_at rather than deleting the row: signatures already
// made with this key stay verifiable, which is the whole reason credentials
// are rows now. A revoked key can no longer sign, and can no longer approve a
// new device.
//
// Revoking requires a signature from a key the account still holds, so that a
// password alone cannot strip an account of its signing keys. The exception is
// the last remaining key: there is nothing left to sign with, and someone whose
// only device was stolen has to be able to kill that key immediately rather
// than wait for an administrator. Registering a replacement still needs
// approval, so revoking everything is a way to lock yourself out, not a way in.
export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const auth = await requireApiUser();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { user } = auth;
  const admin = createAdminClient();

  const { data: credential } = await admin
    .from("webauthn_credentials")
    .select("id, user_id, credential_id, device_label, revoked_at")
    .eq("id", id)
    .maybeSingle();

  if (!credential) {
    return NextResponse.json(
      { error: "Signing key not found." },
      { status: 404 }
    );
  }

  if (credential.user_id !== user.id) {
    return NextResponse.json(
      { error: "That signing key belongs to another account." },
      { status: 403 }
    );
  }

  if (credential.revoked_at) {
    return NextResponse.json(
      { error: "That signing key is already revoked." },
      { status: 400 }
    );
  }

  // Revoking the last active key would leave the account unable to sign and
  // unable to approve a new device without an administrator. Allow it — a user
  // who thinks a key is compromised should be able to kill it immediately —
  // but say plainly what it costs.
  const active = await getActiveCredentials(admin, user.id);
  const isLast = active.length <= 1;

  let reason = "Revoked by the account holder";
  let assertion: AuthenticationResponseJSON | undefined;
  try {
    const body = await request.json();
    if (typeof body?.reason === "string" && body.reason.trim()) {
      reason = body.reason.trim().slice(0, 200);
    }
    if (body?.assertion && typeof body.assertion === "object") {
      assertion = body.assertion as AuthenticationResponseJSON;
    }
  } catch {
    // No body is fine.
  }

  // With more than one key left, prove possession of one of them.
  if (!isLast) {
    const store = await cookies();
    const expectedChallenge = store.get(REVOKE_CHALLENGE_COOKIE)?.value;

    if (!assertion || !expectedChallenge) {
      return NextResponse.json(
        {
          error:
            "Revoking a signing key must be confirmed with one of your other keys.",
          code: "SIGNATURE_REQUIRED",
        },
        { status: 403 }
      );
    }

    const signingKey = active.find((c) => c.credential_id === assertion.id);

    if (!signingKey) {
      return NextResponse.json(
        { error: "That signing key is not registered to this account." },
        { status: 403 }
      );
    }

    try {
      const result = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge,
        expectedOrigin: getExpectedOrigin(),
        expectedRPID: getRpId(),
        requireUserVerification: true,
        credential: {
          id: signingKey.credential_id,
          publicKey: Buffer.from(signingKey.public_key, "base64"),
          counter: signingKey.counter,
          transports: (signingKey.transports ??
            undefined) as AuthenticatorTransportFuture[] | undefined,
        },
      });

      if (!result.verified) {
        return NextResponse.json(
          { error: "That signature could not be verified." },
          { status: 403 }
        );
      }

      await updateCredentialCounter(
        admin,
        signingKey.credential_id,
        result.authenticationInfo.newCounter
      );
    } catch {
      return NextResponse.json(
        { error: "That signature could not be verified." },
        { status: 403 }
      );
    } finally {
      // One challenge, one revocation.
      store.delete(REVOKE_CHALLENGE_COOKIE);
    }
  }

  const { error } = await admin
    .from("webauthn_credentials")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq("id", credential.id)
    .is("revoked_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "REVOKE_WEBAUTHN_CREDENTIAL",
    target_table: "webauthn_credentials",
    target_id: credential.id,
    metadata: {
      credential_id: credential.credential_id,
      was_last_active: isLast,
      reason,
    },
  });

  // Revoking is as strong a signal of a compromised account as registering is,
  // so tell the owner out of band either way.
  await sendSigningKeyRevokedEmail({
    userId: user.id,
    deviceLabel: credential.device_label,
    wasLastActive: isLast,
  }).catch(() => {
    // Best effort: a failed notification must not fail the revocation.
  });

  return NextResponse.json({ ok: true, wasLastActive: isLast });
}
