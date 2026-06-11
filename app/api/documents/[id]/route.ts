import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// Owner-initiated deletion, deliberately restricted to DRAFT documents only.
// Once a document has entered review (pending) or reached a terminal state
// (approved/rejected), it carries approval and signature history that is part
// of the audit trail; removing it then is an admin-only operation
// (see /api/admin/documents/[id]). This keeps authors able to clean up their
// own mistakes without letting them silently erase reviewed/approved records.
export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const adminClient = createAdminClient();

  const { data: document, error: documentError } = await adminClient
    .from("documents")
    .select("id, title, owner_id, status")
    .eq("id", id)
    .single();

  if (documentError || !document) {
    return NextResponse.json(
      { error: "Document not found." },
      { status: 404 }
    );
  }

  if (document.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Only the document owner can delete it." },
      { status: 403 }
    );
  }

  if (document.status !== "draft") {
    return NextResponse.json(
      {
        error:
          "Only draft documents can be deleted. Documents that have been submitted, approved, or rejected can only be removed by an administrator.",
      },
      { status: 400 }
    );
  }

  // Remove stored files for every version, then the dependent rows. A draft
  // normally has no approvals/signatures, but we clean defensively in case the
  // document was reset to draft after a prior round.
  const { data: versions } = await adminClient
    .from("document_versions")
    .select("file_path")
    .eq("document_id", id);

  const filePaths = (versions ?? [])
    .map((v) => v.file_path)
    .filter((path): path is string => !!path);

  if (filePaths.length > 0) {
    await adminClient.storage.from("documents").remove(filePaths);
  }

  await adminClient.from("document_signatures").delete().eq("document_id", id);
  await adminClient.from("document_ai_messages").delete().eq("document_id", id);
  await adminClient.from("document_ai_results").delete().eq("document_id", id);
  await adminClient.from("approvals").delete().eq("document_id", id);
  await adminClient.from("document_versions").delete().eq("document_id", id);
  await adminClient.from("notifications").delete().eq("document_id", id);

  const { error: deleteError } = await adminClient
    .from("documents")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message },
      { status: 500 }
    );
  }

  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: "DELETE_DRAFT_DOCUMENT",
    target_table: "documents",
    target_id: id,
    metadata: {
      title: document.title,
      deleted_files: filePaths.length,
    },
  });

  return NextResponse.json({ success: true });
}
