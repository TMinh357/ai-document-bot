import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";

export default async function AdminAuditLogsPage() {
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

  const [{ data: logs }, { data: profiles }] = await Promise.all([
    supabase
      .from("audit_logs")
      .select("id, user_id, action, target_table, target_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name])
  );

  return (
    <main className="page-shell text-gray-900">
      <div className="page-container">
        <div className="topbar mb-8">
          <div>
            <p className="eyebrow">Administration</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900">
              Audit Logs
            </h1>
            <p className="muted-copy mt-2">
              Full activity history of every action taken in the system.
              Showing latest 200 entries.
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
              Activity Log{" "}
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({logs?.length ?? 0} entries)
              </span>
            </h2>
          </div>

          <div className="data-list">
            {logs && logs.length > 0 ? (
              logs.map((log) => (
                <div key={log.id} className="px-6 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-lg bg-teal-50 px-2.5 py-1 font-mono text-xs font-semibold text-teal-700">
                          {log.action}
                        </span>
                        {log.target_table && (
                          <span className="text-xs text-gray-400">
                            on{" "}
                            <span className="font-medium text-gray-600">
                              {log.target_table}
                            </span>
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                        <span>
                          By:{" "}
                          <span className="font-medium text-gray-700">
                            {log.user_id
                              ? (profileMap.get(log.user_id) ?? "Unknown")
                              : "System"}
                          </span>
                        </span>
                        <span>
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>

                      {log.metadata &&
                        Object.keys(log.metadata).length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs font-medium text-gray-400 hover:text-gray-600">
                              Metadata
                            </summary>
                            <pre className="mt-1 overflow-x-auto rounded-lg border border-gray-200 bg-white/60 p-3 font-mono text-xs text-gray-600">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </details>
                        )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-10 text-center text-gray-600">
                No audit logs found.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
