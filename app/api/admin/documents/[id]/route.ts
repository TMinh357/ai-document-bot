import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (callerProfile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const adminClient = createAdminClient();

  const { data: document, error: documentError } = await adminClient
    .from("documents")
    .select("id, title")
    .eq("id", id)
    .single();

  if (documentError || !document) {
    return NextResponse.json(
      { error: "Document not found." },
      { status: 404 }
    );
  }

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
    action: "ADMIN_DELETE_DOCUMENT",
    target_table: "documents",
    target_id: id,
    metadata: {
      title: document.title,
      deleted_files: filePaths.length,
    },
  });

  return NextResponse.json({ success: true });
}
