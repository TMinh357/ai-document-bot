import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveCredentials } from "@/lib/webauthn/credentials";
import { sendDeviceApprovalRequestedEmail } from "@/lib/email";

export const runtime = "nodejs";

// How long a request may sit waiting for someone to approve it. The two
// machines involved are often in different places — opened at the office,
// approved from the one at home that evening — so this has to span a day.
// Nothing is granted while a request is merely pending, so a long window here
// does not widen what an attacker can do.
const PENDING_HOURS = 24;

// Unambiguous alphabet: no O/0, no I/1.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function pairingCode(): string {
  const bytes = randomBytes(4);
  return Array.from(bytes)
    .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
    .join("");
}

// POST — open a request to register a signing key on this device.
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

  const admin = createAdminClient();
  const active = await getActiveCredentials(admin, user.id);

  if (active.length === 0) {
    return NextResponse.json(
      {
        error:
          "This account has no signing key yet — you can register one directly.",
        code: "NO_APPROVAL_NEEDED",
      },
      { status: 400 }
    );
  }

  // One open request at a time, so the approval screen is never ambiguous
  // about which device it is authorising.
  await admin
    .from("device_approval_requests")
    .update({ status: "expired" })
    .eq("user_id", user.id)
    .eq("status", "pending");

  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    null;

  const code = pairingCode();
  const challenge = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + PENDING_HOURS * 3_600_000);

  const { data: created, error } = await admin
    .from("device_approval_requests")
    .insert({
      user_id: user.id,
      pairing_code: code,
      challenge,
      status: "pending",
      expires_at: expiresAt.toISOString(),
      requested_ip: ip,
      requested_agent: hdrs.get("user-agent"),
    })
    .select("id, pairing_code, expires_at")
    .single();

  if (error || !created) {
    return NextResponse.json(
      { error: error?.message || "Could not create the request." },
      { status: 500 }
    );
  }

  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "DEVICE_APPROVAL_REQUESTED",
    target_table: "device_approval_requests",
    target_id: created.id,
    metadata: { pairing_code: code, ip },
  });

  // The account holder is told immediately: if they did not start this, the
  // email is their signal that someone else has their password.
  try {
    await sendDeviceApprovalRequestedEmail({
      userId: user.id,
      pairingCode: code,
      ip,
      userAgent: hdrs.get("user-agent"),
    });
  } catch {
    // Best-effort.
  }

  return NextResponse.json({
    id: created.id,
    pairingCode: created.pairing_code,
    expiresAt: created.expires_at,
  });
}

// DELETE — dismiss a pending request. Used by the "this was not me" button, so
// a request an attacker opened can be shut down immediately.
export async function DELETE(request: Request) {
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

  let body: { requestId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  if (!body.requestId) {
    return NextResponse.json(
      { error: "A request id is required." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("device_approval_requests")
    .update({ status: "rejected" })
    .eq("id", body.requestId)
    .eq("user_id", user.id)
    .eq("status", "pending");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "DEVICE_APPROVAL_REJECTED",
    target_table: "device_approval_requests",
    target_id: body.requestId,
    metadata: { by: "user" },
  });

  return NextResponse.json({ ok: true });
}

// GET — poll this device's own request, and list requests awaiting approval
// from a device that already holds a key.
export async function GET() {
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

  const { data: pending } = await admin
    .from("device_approval_requests")
    .select(
      "id, pairing_code, status, challenge, expires_at, requested_ip, requested_agent, created_at"
    )
    .eq("user_id", user.id)
    .in("status", ["pending", "approved"])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  return NextResponse.json({ requests: pending ?? [] });
}
