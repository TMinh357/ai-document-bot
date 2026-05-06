import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteStorageObject,
  validatePdfAtPath,
} from "@/lib/pdf-validation";

export const runtime = "nodejs";

const BUCKET = "documents";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: documentId } = await context.params;
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const stagingPath =
      typeof body?.stagingPath === "string" ? body.stagingPath : "";
    const fileName =
      typeof body?.fileName === "string" ? body.fileName : "document.pdf";

    const expectedPrefix = `${user.id}/_staging/`;

    if (!stagingPath.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: "Invalid staging path." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: document, error: documentError } = await admin
      .from("documents")
      .select("id, owner_id, status")
      .eq("id", documentId)
      .single();

    if (documentError || !document) {
      await deleteStorageObject(admin, BUCKET, stagingPath);

      return NextResponse.json(
        { error: "Document not found." },
        { status: 404 }
      );
    }

    if (document.owner_id !== user.id) {
      await deleteStorageObject(admin, BUCKET, stagingPath);

      return NextResponse.json(
        { error: "Only the document owner can upload a new version." },
        { status: 403 }
      );
    }

    if (document.status !== "draft" && document.status !== "rejected") {
      await deleteStorageObject(admin, BUCKET, stagingPath);

      return NextResponse.json(
        {
          error:
            "New versions can only be uploaded while the document is in draft or rejected status.",
        },
        { status: 400 }
      );
    }

    const validation = await validatePdfAtPath(admin, BUCKET, stagingPath);

    if (!validation.ok) {
      await deleteStorageObject(admin, BUCKET, stagingPath);

      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { data: latestVersion } = await admin
      .from("document_versions")
      .select("version_no")
      .eq("document_id", documentId)
      .order("version_no", { ascending: false })
      .limit(1)
      .single();

    const nextVersionNo = (latestVersion?.version_no ?? 0) + 1;

    const finalPath = `${user.id}/${documentId}/${Date.now()}-${safeFileName(fileName)}`;

    const { error: moveError } = await admin.storage
      .from(BUCKET)
      .move(stagingPath, finalPath);

    if (moveError) {
      await deleteStorageObject(admin, BUCKET, stagingPath);

      return NextResponse.json(
        { error: "Failed to finalize uploaded file: " + moveError.message },
        { status: 500 }
      );
    }

    const { error: versionError } = await admin
      .from("document_versions")
      .insert({
        document_id: documentId,
        version_no: nextVersionNo,
        file_path: finalPath,
        content_text: "",
        created_by: user.id,
      });

    if (versionError) {
      await deleteStorageObject(admin, BUCKET, finalPath);

      return NextResponse.json(
        { error: versionError.message },
        { status: 500 }
      );
    }

    const { error: updateError } = await admin
      .from("documents")
      .update({
        status: "draft",
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "UPLOAD_NEW_VERSION",
      target_table: "documents",
      target_id: documentId,
      metadata: {
        version_no: nextVersionNo,
        file_path: finalPath,
        size_bytes: validation.sizeBytes,
      },
    });

    return NextResponse.json({
      versionNo: nextVersionNo,
      sizeBytes: validation.sizeBytes,
    });
  } catch (error) {
    console.error("Create version API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while uploading the new version.",
      },
      { status: 500 }
    );
  }
}
