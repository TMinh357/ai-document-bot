import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveCredentials } from "@/lib/webauthn/credentials";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// Revoke one of the caller's own signing keys.
//
// Revoking sets revoked_at rather than deleting the row: signatures already
// made with this key stay verifiable, which is the whole reason credentials
// are rows now. A revoked key can no longer sign, and can no longer approve a
// new device.
export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
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

  const admin = createAdminClient();

  const { data: credential } = await admin
    .from("webauthn_credentials")
    .select("id, user_id, credential_id, revoked_at")
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
  try {
    const body = await request.json();
    if (typeof body?.reason === "string" && body.reason.trim()) {
      reason = body.reason.trim().slice(0, 200);
    }
  } catch {
    // No body is fine.
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

  return NextResponse.json({ ok: true, wasLastActive: isLast });
}
