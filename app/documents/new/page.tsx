"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewDocumentPage() {
  const router = useRouter();
  const supabase = createClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleCreateDocument(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setIsLoading(true);

    if (!file) {
      setMessage("Please select a PDF file before creating the document.");
      setIsLoading(false);
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setMessage("You must be signed in to create a document.");
      setIsLoading(false);
      return;
    }

    const { data: createdDocument, error: documentError } = await supabase
      .from("documents")
      .insert({
        title,
        description,
        owner_id: user.id,
        status: "draft",
      })
      .select("id")
      .single();

    if (documentError || !createdDocument) {
      setMessage(documentError?.message || "Failed to create document.");
      setIsLoading(false);
      return;
    }

    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${user.id}/${createdDocument.id}/${Date.now()}-${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      setMessage(uploadError.message);
      setIsLoading(false);
      return;
    }

    const { error: versionError } = await supabase
      .from("document_versions")
      .insert({
        document_id: createdDocument.id,
        version_no: 1,
        file_path: filePath,
        content_text: "",
        created_by: user.id,
      });

    if (versionError) {
      setMessage(versionError.message);
      setIsLoading(false);
      return;
    }

    router.push("/documents");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8 text-gray-900">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <Link href="/documents" className="text-sm text-blue-600">
            ← Back to Documents
          </Link>

          <h1 className="mt-4 text-3xl font-bold">Create New Document</h1>
          <p className="text-gray-500">
            Upload a PDF file and submit basic document information.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow">
          <form onSubmit={handleCreateDocument} className="space-y-5">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Document Title
              </label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter document title"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Description
              </label>
              <textarea
                className="min-h-32 w-full rounded-lg border px-3 py-2"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter a short description"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                PDF File
              </label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                type="file"
                accept=".pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
              />

              {file && (
                <p className="mt-2 text-sm text-gray-500">
                  Selected file: {file.name}
                </p>
              )}
            </div>

            {message && <p className="text-sm text-red-600">{message}</p>}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-black py-2 font-medium text-white disabled:opacity-60"
            >
              {isLoading ? "Uploading..." : "Create Document"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}