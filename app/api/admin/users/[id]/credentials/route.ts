import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/supabase/auth";
import { getActiveCredentials } from "@/lib/webauthn/credentials";
import { sendSigningKeyRevokedEmail } from "@/lib/email";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// Revoke every active signing key on another user's account.
//
// This is the containment step when an account is reported compromised.
// Suspending the account stops new sessions, but a stolen device holding a live
// key is the thing that can still produce signatures in the victim's name, and
// only the account holder could revoke it until now — which is no help when the
// account holder is the one locked out.
//
// Deliberately all-or-nothing: an administrator responding to a report should
// not have to judge which of someone else's devices is the stolen one.
export async function POST(_request: Request, context: RouteContext) {
  const { id: targetUserId } = await context.params;

  const auth = await requireApiUser();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = createAdminClient();
  const active = await getActiveCredentials(admin, targetUserId);

  if (active.length === 0) {
    return NextResponse.json(
      { error: "That account has no active signing key." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from("webauthn_credentials")
    .update({
      revoked_at: now,
      revoked_reason: "Revoked by an administrator",
    })
    .eq("user_id", targetUserId)
    .is("revoked_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "ADMIN_REVOKE_WEBAUTHN_CREDENTIALS",
    target_table: "webauthn_credentials",
    target_id: targetUserId,
    metadata: {
      revoked_count: active.length,
      credential_ids: active.map((c) => c.credential_id),
    },
  });

  await admin.from("notifications").insert({
    user_id: targetUserId,
    type: "signing_keys_revoked",
    title: "Your signing keys were revoked",
    message:
      "An administrator revoked the signing keys on your account. Registering a new one needs an administrator to approve the request.",
  });

  await sendSigningKeyRevokedEmail({
    userId: targetUserId,
    deviceLabel: null,
    wasLastActive: true,
  }).catch(() => {
    // Best effort: a failed notification must not fail the revocation.
  });

  return NextResponse.json({ ok: true, revoked: active.length });
}
