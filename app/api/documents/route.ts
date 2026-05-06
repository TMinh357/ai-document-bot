import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteStorageObject,
  validatePdfAtPath,
} from "@/lib/pdf-validation";

export const runtime = "nodejs";

const BUCKET = "documents";

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(request: Request) {
  try {
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
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const description =
      typeof body?.description === "string" ? body.description : "";
    const stagingPath =
      typeof body?.stagingPath === "string" ? body.stagingPath : "";
    const fileName =
      typeof body?.fileName === "string" ? body.fileName : "document.pdf";

    if (!title) {
      return NextResponse.json(
        { error: "Document title is required." },
        { status: 400 }
      );
    }

    const expectedPrefix = `${user.id}/_staging/`;

    if (!stagingPath.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: "Invalid staging path." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const validation = await validatePdfAtPath(admin, BUCKET, stagingPath);

    if (!validation.ok) {
      await deleteStorageObject(admin, BUCKET, stagingPath);

      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { data: createdDocument, error: documentError } = await admin
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
      await deleteStorageObject(admin, BUCKET, stagingPath);

      return NextResponse.json(
        { error: documentError?.message || "Failed to create document." },
        { status: 500 }
      );
    }

    const finalPath = `${user.id}/${createdDocument.id}/${Date.now()}-${safeFileName(fileName)}`;

    const { error: moveError } = await admin.storage
      .from(BUCKET)
      .move(stagingPath, finalPath);

    if (moveError) {
      await deleteStorageObject(admin, BUCKET, stagingPath);
      await admin.from("documents").delete().eq("id", createdDocument.id);

      return NextResponse.json(
        { error: "Failed to finalize uploaded file: " + moveError.message },
        { status: 500 }
      );
    }

    const { error: versionError } = await admin
      .from("document_versions")
      .insert({
        document_id: createdDocument.id,
        version_no: 1,
        file_path: finalPath,
        content_text: "",
        created_by: user.id,
      });

    if (versionError) {
      await deleteStorageObject(admin, BUCKET, finalPath);
      await admin.from("documents").delete().eq("id", createdDocument.id);

      return NextResponse.json(
        { error: versionError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: createdDocument.id,
      sizeBytes: validation.sizeBytes,
    });
  } catch (error) {
    console.error("Create document API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while creating the document.",
      },
      { status: 500 }
    );
  }
}
