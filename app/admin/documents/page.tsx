import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import NotificationBell from "@/components/NotificationBell";
import UserBadge from "@/components/UserBadge";
import DeleteDocumentButton from "@/components/admin/DeleteDocumentButton";
import StatusBadge from "@/components/StatusBadge";
import ActiveLink from "@/components/ActiveLink";
import { requireRole } from "@/lib/supabase/auth";

const STATUS_OPTIONS = ["draft", "pending", "approved", "rejected", "signed"];

type SearchParams = {
  q?: string;
  status?: string;
  owner?: string;
  from?: string;
  to?: string;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

function escapeIlikePattern(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export default async function AdminDocumentsPage({ searchParams }: PageProps) {
  const filters = await searchParams;

  const { supabase, user, profile, role } = await requireRole(["admin"]);

  const trimmedQuery = (filters.q || "").trim();

  let searchedDocumentIds: Set<string> | null = null;
  let contentTextMatchIds = new Set<string>();

  if (trimmedQuery) {
    const pattern = `%${escapeIlikePattern(trimmedQuery)}%`;

    const [titleMatch, descMatch, contentMatch] = await Promise.all([
      supabase.from("documents").select("id").ilike("title", pattern),
      supabase.from("documents").select("id").ilike("description", pattern),
      supabase
        .from("document_versions")
        .select("document_id")
        .ilike("content_text", pattern),
    ]);

    searchedDocumentIds = new Set();
    (titleMatch.data ?? []).forEach((d) => searchedDocumentIds!.add(d.id));
    (descMatch.data ?? []).forEach((d) => searchedDocumentIds!.add(d.id));
    (contentMatch.data ?? []).forEach((v) => {
      searchedDocumentIds!.add(v.document_id);
      contentTextMatchIds.add(v.document_id);
    });
  }

  let query = supabase
    .from("documents")
    .select("id, title, description, status, owner_id, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (searchedDocumentIds !== null) {
    if (searchedDocumentIds.size === 0) {
      query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      query = query.in("id", Array.from(searchedDocumentIds));
    }
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.owner) {
    query = query.eq("owner_id", filters.owner);
  }
  if (filters.from) {
    query = query.gte("created_at", new Date(filters.from).toISOString());
  }
  if (filters.to) {
    const toDate = new Date(filters.to);
    toDate.setDate(toDate.getDate() + 1);
    query = query.lt("created_at", toDate.toISOString());
  }

  const [{ data: documents }, { data: profiles }] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name])
  );

  const hasFilters = !!(
    trimmedQuery ||
    filters.status ||
    filters.owner ||
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
              All Documents
            </h1>
            <p className="muted-copy mt-2">
              Every document in the system across all users.
            </p>
          </div>

          <div className="topbar-nav">
            <ActiveLink href="/admin" className="button-secondary">
              Admin Panel
            </ActiveLink>
            <UserBadge
              fullName={profile?.full_name}
              email={user.email}
              role={role}
            />
            <NotificationBell />
            <LogoutButton />
          </div>
        </div>

        <form
          method="GET"
          className="section-card mb-6 rounded-[2rem] p-6 md:p-8"
        >
          <h2 className="text-lg font-semibold text-gray-900">
            Advanced Search
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-3">
              <label className="mb-1 block text-sm font-medium text-gray-800">
                Search text
              </label>
              <input
                type="text"
                name="q"
                defaultValue={filters.q ?? ""}
                placeholder="Search title, description, or extracted PDF text"
                className="input-field"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-800">
                Status
              </label>
              <select
                name="status"
                defaultValue={filters.status ?? ""}
                className="select-field"
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-800">
                Owner
              </label>
              <select
                name="owner"
                defaultValue={filters.owner ?? ""}
                className="select-field"
              >
                <option value="">All owners</option>
                {(profiles ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-800">
                  Created from
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
                  Created to
                </label>
                <input
                  type="date"
                  name="to"
                  defaultValue={filters.to ?? ""}
                  className="input-field"
                />
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="submit" className="button-primary">
              Apply Search
            </button>

            {hasFilters && (
              <Link href="/admin/documents" className="button-secondary">
                Clear
              </Link>
            )}
          </div>
        </form>

        <div className="section-card overflow-hidden rounded-[2rem]">
          <div className="border-b border-gray-200/70 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-900">
              Documents{" "}
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({documents?.length ?? 0}
                {documents && documents.length === 500 ? "+" : ""})
              </span>
            </h2>
          </div>

          <div className="data-list">
            {documents && documents.length > 0 ? (
              documents.map((doc) => {
                const matchedInContentOnly =
                  trimmedQuery &&
                  contentTextMatchIds.has(doc.id) &&
                  !doc.title.toLowerCase().includes(trimmedQuery.toLowerCase()) &&
                  !(doc.description || "")
                    .toLowerCase()
                    .includes(trimmedQuery.toLowerCase());

                return (
                  <div
                    key={doc.id}
                    className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-gray-900">
                          {doc.title}
                        </h3>
                        {matchedInContentOnly && (
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                            Matched in extracted text
                          </span>
                        )}
                      </div>
                      <p className="muted-copy mt-1 text-sm">
                        {doc.description || "No description"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.14em] text-gray-400">
                        <span>
                          Owner:{" "}
                          <span className="font-medium text-gray-600">
                            {profileMap.get(doc.owner_id) ?? "Unknown"}
                          </span>
                        </span>
                        <span>
                          Created:{" "}
                          {new Date(doc.created_at).toLocaleDateString()}
                        </span>
                        <span>
                          Updated:{" "}
                          {new Date(doc.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <StatusBadge status={doc.status} />
                      <Link
                        href={`/documents/${doc.id}`}
                        className="button-secondary text-sm"
                      >
                        View
                      </Link>
                      <DeleteDocumentButton
                        documentId={doc.id}
                        documentTitle={doc.title}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-6 py-10 text-center text-gray-600">
                {hasFilters
                  ? "No documents match the current search."
                  : "No documents found."}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
