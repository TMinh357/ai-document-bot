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
    <main className="page-shell text-gray-900">
      <div className="page-container max-w-3xl">
        <div className="mb-6">
          <Link
            href="/documents"
            className="text-sm font-medium text-teal-700 hover:text-teal-800"
          >
            Back to Documents
          </Link>

          <h1 className="mt-4 text-4xl font-semibold tracking-tight">
            Create New Document
          </h1>
          <p className="muted-copy mt-2">
            Upload a PDF file and submit basic document information.
          </p>
        </div>

        <div className="section-card rounded-[2rem] p-8">
          <form onSubmit={handleCreateDocument} className="space-y-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Document Title
              </label>
              <input
                className="input-field"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter document title"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Description
              </label>
              <textarea
                className="textarea-field"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter a short description"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                PDF File
              </label>
              <input
                className="file-field"
                type="file"
                accept=".pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
              />

              {file && (
                <p className="muted-copy mt-2 text-sm">
                  Selected file: {file.name}
                </p>
              )}
            </div>

            {message && <p className="text-sm text-red-600">{message}</p>}

            <button
              type="submit"
              disabled={isLoading}
              className="button-primary w-full disabled:opacity-60"
            >
              {isLoading ? "Uploading..." : "Create Document"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
