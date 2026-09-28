import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "employee" | "reviewer" | "admin";
export type AccountStatus = "pending" | "approved" | "rejected";

export async function requireUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, status")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "employee") as AppRole;
  const status = (profile?.status ?? "pending") as AccountStatus;

  if (status !== "approved") {
    redirect("/account-status");
  }

  return { supabase, user, profile, role, status };
}

export async function requireRole(allowed: AppRole[]) {
  const ctx = await requireUser();

  if (!allowed.includes(ctx.role)) {
    redirect("/dashboard");
  }

  return ctx;
}

// The API equivalent of requireUser(). Route handlers cannot use redirect(),
// so this returns a discriminated result the caller turns into a response.
//
// This exists because suspending an account only stopped page access: pages go
// through requireUser(), but route handlers checked auth.getUser() alone, so a
// suspended user with a live session token could still call the API directly.
// Session tokens outlive the suspension, so status has to be read per request.
export type ApiUserResult =
  | {
      ok: true;
      user: { id: string; email?: string };
      role: AppRole;
      status: AccountStatus;
    }
  | { ok: false; error: string; status: number };

export async function requireApiUser(): Promise<ApiUserResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in.", status: 401 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();

  const status = (profile?.status ?? "pending") as AccountStatus;

  if (status !== "approved") {
    return {
      ok: false,
      error:
        status === "rejected"
          ? "This account has been suspended. Contact an administrator."
          : "This account is awaiting approval.",
      status: 403,
    };
  }

  return {
    ok: true,
    user: { id: user.id, email: user.email },
    role: (profile?.role ?? "employee") as AppRole,
    status,
  };
}
