import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";

type SearchParams = {
  action?: string;
  user?: string;
  document?: string;
  from?: string;
  to?: string;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function AdminAuditLogsPage({ searchParams }: PageProps) {
  const filters = await searchParams;

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

  let query = supabase
    .from("audit_logs")
    .select(
      "id, user_id, action, target_table, target_id, metadata, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (filters.action) {
    query = query.eq("action", filters.action);
  }
  if (filters.user) {
    query = query.eq("user_id", filters.user);
  }
  if (filters.document) {
    query = query.eq("target_table", "documents").eq("target_id", filters.document);
  }
  if (filters.from) {
    query = query.gte("created_at", new Date(filters.from).toISOString());
  }
  if (filters.to) {
    const toDate = new Date(filters.to);
    toDate.setDate(toDate.getDate() + 1);
    query = query.lt("created_at", toDate.toISOString());
  }

  const [
    { data: logs },
    { data: actionRows },
    { data: profiles },
    { data: documents },
  ] = await Promise.all([
    query,
    supabase.from("audit_logs").select("action"),
    supabase.from("profiles").select("id, full_name").order("full_name"),
    supabase.from("documents").select("id, title").order("title"),
  ]);

  const uniqueActions = Array.from(
    new Set((actionRows ?? []).map((r) => r.action).filter(Boolean))
  ).sort();

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name])
  );

  const documentMap = new Map(
    (documents ?? []).map((d) => [d.id, d.title])
  );

  const hasFilters = !!(
    filters.action ||
    filters.user ||
    filters.document ||
    filters.from ||
    filters.to
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
              Showing the latest 500 matching entries.
            </p>
          </div>

          <div className="topbar-nav">
            <Link href="/admin" className="button-secondary">
              Admin Panel
            </Link>
            <LogoutButton />
          </div>
        </div>

        <form
          method="GET"
          className="section-card mb-6 rounded-[2rem] p-6 md:p-8"
        >
          <h2 className="text-lg font-semibold text-gray-900">Filters</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-800">
                Action
              </label>
              <select
                name="action"
                defaultValue={filters.action ?? ""}
                className="select-field"
              >
                <option value="">All actions</option>
                {uniqueActions.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-800">
                User
              </label>
              <select
                name="user"
                defaultValue={filters.user ?? ""}
                className="select-field"
              >
                <option value="">All users</option>
                {(profiles ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-800">
                Document
              </label>
              <select
                name="document"
                defaultValue={filters.document ?? ""}
                className="select-field"
              >
                <option value="">All documents</option>
                {(documents ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-800">
                From date
              </label>
              <input
                type="date"
                name="from"
                defaultValue={filters.from ?? ""}
                className="input-field"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-800">
                To date
              </label>
              <input
                type="date"
                name="to"
                defaultValue={filters.to ?? ""}
                className="input-field"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="submit" className="button-primary">
              Apply Filters
            </button>

            {hasFilters && (
              <Link href="/admin/audit-logs" className="button-secondary">
                Clear Filters
              </Link>
            )}
          </div>
        </form>

        <div className="section-card overflow-hidden rounded-[2rem]">
          <div className="border-b border-gray-200/70 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-900">
              Activity Log{" "}
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({logs?.length ?? 0} {logs?.length === 1 ? "entry" : "entries"})
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
                        {log.target_table === "documents" &&
                          log.target_id &&
                          documentMap.get(log.target_id) && (
                            <Link
                              href={`/documents/${log.target_id}`}
                              className="text-xs font-medium text-blue-600 hover:underline"
                            >
                              {documentMap.get(log.target_id)}
                            </Link>
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
                        <span>{new Date(log.created_at).toLocaleString()}</span>
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
                {hasFilters
                  ? "No logs match the current filters."
                  : "No audit logs found."}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
