"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_MB = 10;

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

type UploadNewVersionFormProps = {
  documentId: string;
  documentStatus: string;
  latestVersionNo: number;
};

export default function UploadNewVersionForm({
  documentId,
  documentStatus,
  latestVersionNo,
}: UploadNewVersionFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (documentStatus !== "draft" && documentStatus !== "rejected") {
    return null;
  }

  const nextVersionNo = latestVersionNo + 1;

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    if (!file) {
      setMessage("Please select a PDF file.");
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
      setMessage("You must be signed in.");
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

    const response = await fetch(`/api/documents/${documentId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stagingPath,
        fileName: file.name,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result?.error || "Failed to upload new version.");
      setIsLoading(false);
      return;
    }

    setFile(null);
    setIsLoading(false);
    router.refresh();
  }

  return (
    <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-slate-50 p-5">
      <h3 className="text-lg font-semibold text-gray-900">
        Upload New Version
      </h3>

      <p className="muted-copy mt-1 text-sm">
        Uploading will create Version {nextVersionNo}.{" "}
        {documentStatus === "rejected"
          ? "The document will be reset to draft so you can resubmit."
          : "Only the latest version can be submitted for review."}
      </p>

      <form onSubmit={handleUpload} className="mt-4 space-y-4">
        <input
          className="file-field"
          type="file"
          accept=".pdf,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          required
        />

        {file && (
          <p className="muted-copy text-sm">
            Selected file: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
          </p>
        )}

        {message && <p className="text-sm text-red-600">{message}</p>}

        <button
          type="submit"
          disabled={isLoading}
          className="button-primary disabled:opacity-60"
        >
          {isLoading ? "Uploading..." : `Upload Version ${nextVersionNo}`}
        </button>
      </form>
    </div>
  );
}
