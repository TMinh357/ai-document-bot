import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";
import DeleteDocumentButton from "@/components/admin/DeleteDocumentButton";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  signed: "bg-teal-100 text-teal-700",
};

export default async function AdminDocumentsPage() {
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

  const [{ data: documents }, { data: profiles }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, description, status, owner_id, created_at, updated_at")
      .order("created_at", { ascending: false }),
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
              All Documents
            </h1>
            <p className="muted-copy mt-2">
              Every document in the system across all users.
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
              Documents{" "}
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({documents?.length ?? 0})
              </span>
            </h2>
          </div>

          <div className="data-list">
            {documents && documents.length > 0 ? (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900">
                      {doc.title}
                    </h3>
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
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_COLORS[doc.status] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {doc.status}
                    </span>
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
              ))
            ) : (
              <div className="px-6 py-10 text-center text-gray-600">
                No documents found.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
