import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import LogoutButton from "@/components/LogoutButton";
import RoleSelector from "@/components/admin/RoleSelector";

export default async function AdminUsersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (callerProfile?.role !== "admin") redirect("/dashboard");

  const adminClient = createAdminClient();

  const [authResult, { data: profiles }] = await Promise.all([
    adminClient.auth.admin.listUsers({ perPage: 200 }),
    supabase.from("profiles").select("id, full_name, role, created_at"),
  ]);

  const authUsers = authResult.data?.users ?? [];

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p])
  );

  const rows = authUsers.map((u) => ({
    id: u.id,
    email: u.email ?? "—",
    full_name: profileMap.get(u.id)?.full_name ?? "—",
    role: profileMap.get(u.id)?.role ?? "employee",
    created_at: profileMap.get(u.id)?.created_at ?? u.created_at,
  }));

  rows.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <main className="page-shell text-gray-900">
      <div className="page-container">
        <div className="topbar mb-8">
          <div>
            <p className="eyebrow">Administration</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900">
              User Management
            </h1>
            <p className="muted-copy mt-2">
              View all registered users and manage their roles.
            </p>
          </div>

          <div className="topbar-nav">
            <Link href="/admin" className="button-secondary">
              Admin Panel
            </Link>
            <LogoutButton />
          </div>
        </div>

        <div className="section-card overflow-hidden rounded-[2rem]">
          <div className="border-b border-gray-200/70 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-900">
              All Users{" "}
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({rows.length})
              </span>
            </h2>
          </div>

          <div className="data-list">
            {rows.length > 0 ? (
              rows.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900">
                      {row.full_name}
                    </h3>
                    <p className="muted-copy mt-1 text-sm">{row.email}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-gray-400">
                      Joined {new Date(row.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span className="status-pill capitalize">{row.role}</span>
                    <RoleSelector
                      userId={row.id}
                      currentRole={row.role}
                      isSelf={row.id === user.id}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-10 text-center text-gray-600">
                No users found.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
