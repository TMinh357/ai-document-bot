import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDeviceApprovalGrantedEmail } from "@/lib/email";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// Administrator decision on a device-approval request.
//
// This is the recovery path for a user who has genuinely lost the device
// holding their only signing key, so the countersign-with-existing-key route
// is not available to them. Losing a signing key is a serious event, so it is
// deliberately not self-service: an administrator is expected to confirm the
// person's identity out of band before granting this.
export async function PATCH(request: Request, context: RouteContext) {
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

  const { data: actor } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (actor?.role !== "admin") {
    return NextResponse.json(
      { error: "Only an administrator can decide device-approval requests." },
      { status: 403 }
    );
  }

  let body: { decision?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const decision = body.decision;
  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json(
      { error: "Decision must be 'approved' or 'rejected'." },
      { status: 400 }
    );
  }

  const { data: req } = await admin
    .from("device_approval_requests")
    .select("id, user_id, status, expires_at, pairing_code")
    .eq("id", id)
    .maybeSingle();

  if (!req) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  if (req.status !== "pending") {
    return NextResponse.json(
      { error: "This request has already been handled." },
      { status: 400 }
    );
  }

  // An administrator approving a recovery gets a fresh window: the original
  // request may have been sitting unattended while identity was confirmed.
  const expiresAt =
    decision === "approved"
      ? new Date(Date.now() + 30 * 60_000).toISOString()
      : req.expires_at;

  const { error: updateError } = await admin
    .from("device_approval_requests")
    .update({
      status: decision,
      approval_method: decision === "approved" ? "admin" : null,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      expires_at: expiresAt,
    })
    .eq("id", req.id)
    .eq("status", "pending");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    user_id: user.id,
    action:
      decision === "approved"
        ? "DEVICE_APPROVAL_GRANTED"
        : "DEVICE_APPROVAL_REJECTED",
    target_table: "device_approval_requests",
    target_id: req.id,
    metadata: {
      method: "admin",
      subject_user: req.user_id,
      note: body.note ?? null,
    },
  });

  if (decision === "approved") {
    try {
      await sendDeviceApprovalGrantedEmail({
        userId: req.user_id,
        approvedByAdmin: true,
        expiresAt,
      });
    } catch {
      // Best-effort.
    }
  }

  return NextResponse.json({ ok: true });
}
