import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";

export default async function DocumentsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: documents } = await supabase
    .from("documents")
    .select("id, title, description, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="page-shell">
      <div className="page-container">
        <div className="topbar mb-8">
          <div>
            <p className="eyebrow">Document Center</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900">
              Documents
            </h1>
            <p className="muted-copy mt-2">
              Manage submitted documents and review their approval status.
            </p>
          </div>

          <div className="topbar-nav">
            <Link href="/dashboard" className="button-secondary">
              Dashboard
            </Link>

            <LogoutButton />
          </div>
        </div>

        <div className="mb-6 flex justify-end">
          <Link href="/documents/new" className="button-primary">
            Create New Document
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
                      {document.description || "No description provided"}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.14em] text-gray-500">
                      Created at:{" "}
                      {new Date(document.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="status-pill">
                      {document.status}
                    </span>

                    <Link
                      href={`/documents/${document.id}`}
                      className="button-secondary text-sm"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-10 text-center text-gray-600">
                No documents have been created yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
