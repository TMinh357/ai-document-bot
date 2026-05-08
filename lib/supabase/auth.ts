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
