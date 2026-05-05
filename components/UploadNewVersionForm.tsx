"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${user.id}/${documentId}/${Date.now()}-${safeFileName}`;

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
        document_id: documentId,
        version_no: nextVersionNo,
        file_path: filePath,
        content_text: "",
        created_by: user.id,
      });

    if (versionError) {
      setMessage(versionError.message);
      setIsLoading(false);
      return;
    }

    const { error: documentError } = await supabase
      .from("documents")
      .update({
        status: "draft",
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    if (documentError) {
      setMessage(documentError.message);
      setIsLoading(false);
      return;
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "UPLOAD_NEW_VERSION",
      target_table: "documents",
      target_id: documentId,
      metadata: {
        version_no: nextVersionNo,
        file_path: filePath,
      },
    });

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
          accept=".pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          required
        />

        {file && (
          <p className="muted-copy text-sm">Selected file: {file.name}</p>
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
