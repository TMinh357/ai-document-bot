import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ALLOWED = ["pending", "approved", "rejected"] as const;
type AccountStatus = (typeof ALLOWED)[number];

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();

  if (callerProfile?.role !== "admin" || callerProfile?.status !== "approved") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (id === user.id) {
    return NextResponse.json(
      { error: "You cannot change your own account status." },
      { status: 400 }
    );
  }

  const body = await request.json();
  const status = body.status as AccountStatus | undefined;

  if (!status || !ALLOWED.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { error: updateError } = await adminClient
    .from("profiles")
    .update({ status })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: "ADMIN_CHANGE_USER_STATUS",
    target_table: "profiles",
    target_id: id,
    metadata: { new_status: status },
  });

  if (status === "approved" || status === "rejected") {
    await adminClient.from("notifications").insert({
      user_id: id,
      type: status === "approved" ? "account_approved" : "account_rejected",
      title:
        status === "approved"
          ? "Account approved"
          : "Account rejected",
      message:
        status === "approved"
          ? "An administrator approved your account. Refresh the page to start using the system."
          : "An administrator rejected your account. Please contact your administrator if you believe this is a mistake.",
    });
  }

  return NextResponse.json({ success: true });
}
