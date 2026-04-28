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
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Documents</h1>
            <p className="text-gray-500">
              Manage submitted documents and review their approval status.
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg border bg-white px-4 py-2"
            >
              Dashboard
            </Link>

            <LogoutButton />
          </div>
        </div>

        <div className="mb-6">
          <Link
            href="/documents/new"
            className="rounded-lg bg-black px-5 py-2 text-white"
          >
            Create New Document
          </Link>
        </div>

        <div className="rounded-2xl bg-white shadow">
          <div className="border-b p-4">
            <h2 className="font-semibold">Document List</h2>
          </div>

          <div className="divide-y">
            {documents && documents.length > 0 ? (
              documents.map((document) => (
                <div
                  key={document.id}
                  className="flex items-center justify-between gap-4 p-4"
                >
                  <div>
                    <h3 className="font-semibold">{document.title}</h3>
                    <p className="text-sm text-gray-500">
                      {document.description || "No description provided"}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      Created at:{" "}
                      {new Date(document.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium">
                      {document.status}
                    </span>

                    <Link
                      href={`/documents/${document.id}`}
                      className="rounded-lg border px-4 py-2 text-sm"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500">
                No documents have been created yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}