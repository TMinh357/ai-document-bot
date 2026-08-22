import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import NotificationBell from "@/components/NotificationBell";
import UserBadge from "@/components/UserBadge";
import ActiveLink from "@/components/ActiveLink";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import FormattedDate from "@/components/FormattedDate";
import { requireUser } from "@/lib/supabase/auth";
import { REVIEW_CONTEXT_FALLBACK } from "@/lib/document-copy";

type PageProps = {
  searchParams: Promise<{ status?: string }>;
};

// Filter tabs shown above the list. "all" maps to no status filter.
const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const;

const VALID_STATUSES = new Set(["draft", "pending", "approved", "rejected"]);

export default async function DocumentsPage({ searchParams }: PageProps) {
  const { supabase, user, profile, role } = await requireUser();

  const { status: statusParam } = await searchParams;
  const activeStatus =
    statusParam && VALID_STATUSES.has(statusParam) ? statusParam : "all";

  let query = supabase
    .from("documents")
    .select("id, title, description, status, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (activeStatus !== "all") {
    query = query.eq("status", activeStatus);
  }

  const { data: documents } = await query;

  // Per-status counts for the filter-tab badges (one lightweight query, all rows).
  const { data: allForCounts } = await supabase
    .from("documents")
    .select("status")
    .eq("owner_id", user.id);

  const counts: Record<string, number> = { all: 0 };
  (allForCounts ?? []).forEach((d) => {
    counts.all += 1;
    counts[d.status] = (counts[d.status] ?? 0) + 1;
  });

  const filterLabel =
    activeStatus === "all"
      ? "Track your research proposals, project reports, and academic submissions through review."
      : `Showing your ${activeStatus} documents.`;

  return (
    <main className="page-shell">
      <div className="page-container">
        <div className="topbar mb-8">
          <div>
            <p className="eyebrow">Document Center</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900">
              My Documents
            </h1>
            <p className="muted-copy mt-2">{filterLabel}</p>
          </div>

          <div className="topbar-nav">
            <ActiveLink href="/dashboard" className="button-secondary">
              Dashboard
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

        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((filter) => {
              const isActive = activeStatus === filter.key;
              const href =
                filter.key === "all"
                  ? "/documents"
                  : `/documents?status=${filter.key}`;
              const count = counts[filter.key] ?? 0;

              return (
                <Link
                  key={filter.key}
                  href={href}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-teal-700 text-white"
                      : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {filter.label}
                  <span
                    className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {count}
                  </span>
                </Link>
              );
            })}
          </div>

          <Link href="/documents/new" className="button-primary">
            Create Academic Document
          </Link>
        </div>

        <div className="section-card overflow-hidden rounded-[2rem]">
          <div className="border-b border-gray-200/70 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-900">
              Document List
            </h2>
          </div>

          <div className="data-list">
            {documents && documents.length > 0 ? (
              documents.map((document) => (
                <div
                  key={document.id}
                  className="flex flex-col gap-5 px-6 py-5 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {document.title}
                    </h3>
                    <p className="muted-copy mt-2 text-sm leading-6">
                      {document.description || REVIEW_CONTEXT_FALLBACK}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.14em] text-gray-500">
                      Created at: <FormattedDate value={document.created_at} />
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <StatusBadge status={document.status} />

                    <Link
                      href={`/documents/${document.id}`}
                      className="button-secondary text-sm"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              ))
            ) : activeStatus === "all" ? (
              <div className="px-6 py-10">
                <EmptyState
                  title="No documents yet"
                  description="You have no academic documents yet. Create a research proposal, project report, or internship report to begin the review workflow."
                  actionLabel="Create Academic Document"
                  actionHref="/documents/new"
                />
              </div>
            ) : (
              <div className="px-6 py-10">
                <EmptyState
                  title={`No ${activeStatus} documents`}
                  description={`You have no documents with status "${activeStatus}" right now.`}
                  actionLabel="View all documents"
                  actionHref="/documents"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
