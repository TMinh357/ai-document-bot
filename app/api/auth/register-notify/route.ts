import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAdminNewUserEmail } from "@/lib/email";

export const runtime = "nodejs";

// Called by the client immediately after supabase.auth.signUp() succeeds.
// Fans out an in-app notification + email to every admin telling them a new
// user is awaiting approval. The endpoint is unauthenticated (the newly
// registered user has not signed in yet), so we accept only a userId and
// validate it server-side against the freshly created profile row.
//
// Anti-abuse: only acts on profiles created within the last 5 minutes whose
// status is still 'pending'. After that window the endpoint is a no-op, so it
// cannot be used to spam admins.

const RECENT_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = typeof body?.userId === "string" ? body.userId : "";

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, full_name, status, created_at")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Profile not found." },
        { status: 404 }
      );
    }

    if (profile.status !== "pending") {
      return NextResponse.json({ skipped: "not_pending" });
    }

    const createdAt = profile.created_at
      ? new Date(profile.created_at).getTime()
      : 0;
    if (Date.now() - createdAt > RECENT_WINDOW_MS) {
      return NextResponse.json({ skipped: "outside_recent_window" });
    }

    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    const newUserEmail = authUser?.user?.email ?? "(unknown)";
    const newUserName = profile.full_name ?? "";

    const { data: admins, error: adminsError } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .eq("status", "approved");

    if (adminsError) {
      return NextResponse.json(
        { error: adminsError.message },
        { status: 500 }
      );
    }

    const adminIds = (admins ?? []).map((a) => a.id);

    if (adminIds.length === 0) {
      return NextResponse.json({ notified: 0 });
    }

    await admin.from("notifications").insert(
      adminIds.map((adminId) => ({
        user_id: adminId,
        type: "new_user_registered",
        title: "New user awaiting approval",
        message: `${newUserName || newUserEmail} just registered and is waiting for admin approval.`,
      }))
    );

    await Promise.allSettled(
      adminIds.map((adminId) =>
        sendAdminNewUserEmail({
          adminId,
          newUserName,
          newUserEmail,
        })
      )
    );

    return NextResponse.json({ notified: adminIds.length });
  } catch (error) {
    console.error("register-notify API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
      },
      { status: 500 }
    );
  }
}
