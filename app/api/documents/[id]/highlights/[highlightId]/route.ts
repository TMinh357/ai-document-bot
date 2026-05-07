import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
    highlightId: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id: documentId, highlightId } = await context.params;
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

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = profile?.role === "admin";

    const { data: highlight, error: highlightError } = await admin
      .from("document_highlights")
      .select("id, reviewer_id, document_id")
      .eq("id", highlightId)
      .single();

    if (highlightError || !highlight) {
      return NextResponse.json(
        { error: "Highlight not found." },
        { status: 404 }
      );
    }

    if (highlight.document_id !== documentId) {
      return NextResponse.json(
        { error: "Highlight does not belong to this document." },
        { status: 400 }
      );
    }

    if (!isAdmin && highlight.reviewer_id !== user.id) {
      return NextResponse.json(
        { error: "You can only delete your own highlights." },
        { status: 403 }
      );
    }

    const { error: deleteError } = await admin
      .from("document_highlights")
      .delete()
      .eq("id", highlightId);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "DELETE_HIGHLIGHT",
      target_table: "document_highlights",
      target_id: highlightId,
      metadata: {
        document_id: documentId,
        deleted_by_admin: isAdmin && highlight.reviewer_id !== user.id,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete highlight API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while deleting the highlight.",
      },
      { status: 500 }
    );
  }
}
