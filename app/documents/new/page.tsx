"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_MB = 10;

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

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

    if (!file) {
      setMessage("Please select a PDF file before creating the document.");
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      const sizeMb = (file.size / 1024 / 1024).toFixed(1);
      setMessage(
        `File is too large (${sizeMb} MB). Maximum allowed size is ${MAX_FILE_MB} MB.`
      );
      return;
    }

    setIsLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setMessage("You must be signed in to create a document.");
      setIsLoading(false);
      return;
    }

    const stagingPath = `${user.id}/_staging/${crypto.randomUUID()}/${safeFileName(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(stagingPath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      setMessage(uploadError.message);
      setIsLoading(false);
      return;
    }

    const response = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        stagingPath,
        fileName: file.name,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result?.error || "Failed to create document.");
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
                PDF File (max {MAX_FILE_MB} MB)
              </label>
              <input
                className="file-field"
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
              />

              {file && (
                <p className="muted-copy mt-2 text-sm">
                  Selected file: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
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
