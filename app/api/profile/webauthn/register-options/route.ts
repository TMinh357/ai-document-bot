import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRpId, RP_NAME } from "@/lib/webauthn/config";
import { getActiveCredentials } from "@/lib/webauthn/credentials";

export const runtime = "nodejs";

const CHALLENGE_COOKIE = "webauthn_register_challenge";
const REQUEST_COOKIE = "webauthn_register_request";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const active = await getActiveCredentials(admin, user.id);

  // A password alone must not be enough to mint a signing key for an account
  // that already has one — otherwise whoever learns the password can sign as
  // this user, and the signature proves no more than the password did. The
  // first key is self-service; every later one needs an approved request,
  // either countersigned by an existing key or granted by an administrator.
  let approvedRequestId: string | null = null;

  if (active.length > 0) {
    const { data: approved } = await admin
      .from("device_approval_requests")
      .select("id, expires_at")
      .eq("user_id", user.id)
      .eq("status", "approved")
      .gt("expires_at", new Date().toISOString())
      .order("approved_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!approved) {
      return NextResponse.json(
        {
          error:
            "This account already has a signing key. To add another device, request approval first.",
          code: "APPROVAL_REQUIRED",
        },
        { status: 403 }
      );
    }

    approvedRequestId = approved.id;
  }

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
    // Stops a device that already holds one of these from enrolling twice.
    // This is a usability guard, not an access control: a different device
    // holds none of them, which is why the approval check above exists.
    excludeCredentials: active.map((c) => ({ id: c.credential_id })),
  });

  const cookieStore = await cookies();
  cookieStore.set(CHALLENGE_COOKIE, options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });

  // Bind this ceremony to the approval that authorised it, so the request can
  // be consumed exactly once when registration completes.
  if (approvedRequestId) {
    cookieStore.set(REQUEST_COOKIE, approvedRequestId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 300,
      path: "/",
    });
  }

  return NextResponse.json(options);
}
