import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const MAX_COMMENT_LENGTH = 2000;
const MAX_TEXT_LENGTH = 4000;

type RectInput = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function isValidRect(value: unknown): value is RectInput {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.left === "number" &&
    typeof r.top === "number" &&
    typeof r.width === "number" &&
    typeof r.height === "number" &&
    Number.isFinite(r.left) &&
    Number.isFinite(r.top) &&
    Number.isFinite(r.width) &&
    Number.isFinite(r.height) &&
    r.width > 0 &&
    r.height > 0
  );
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
    const versionId =
      typeof body?.versionId === "string" ? body.versionId : "";
    const pageNumber = Number(body?.pageNumber);
    const selectedText =
      typeof body?.selectedText === "string" ? body.selectedText : "";
    const comment =
      typeof body?.comment === "string" ? body.comment.trim() : "";
    const boundingRectsRaw = Array.isArray(body?.boundingRects)
      ? body.boundingRects
      : [];

    if (!versionId) {
      return NextResponse.json(
        { error: "versionId is required." },
        { status: 400 }
      );
    }

    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      return NextResponse.json(
        { error: "pageNumber must be a positive integer." },
        { status: 400 }
      );
    }

    if (!selectedText || selectedText.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: "Selected text is empty or too long." },
        { status: 400 }
      );
    }

    if (!comment || comment.length > MAX_COMMENT_LENGTH) {
      return NextResponse.json(
        {
          error:
            "Comment is required and must be under 2000 characters.",
        },
        { status: 400 }
      );
    }

    if (boundingRectsRaw.length === 0 || !boundingRectsRaw.every(isValidRect)) {
      return NextResponse.json(
        { error: "boundingRects must be a non-empty array of valid rects." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: version, error: versionError } = await admin
      .from("document_versions")
      .select("id, document_id")
      .eq("id", versionId)
      .single();

    if (versionError || !version || version.document_id !== documentId) {
      return NextResponse.json(
        { error: "Document version not found or does not belong to this document." },
        { status: 404 }
      );
    }

    const { data: maxRoundRow } = await admin
      .from("approvals")
      .select("round_no")
      .eq("document_id", documentId)
      .order("round_no", { ascending: false })
      .limit(1)
      .single();

    if (!maxRoundRow) {
      return NextResponse.json(
        {
          error:
            "This document has not been submitted for review yet. Highlights can only be added by current-round reviewers.",
        },
        { status: 403 }
      );
    }

    const { data: assignedApproval } = await admin
      .from("approvals")
      .select("id")
      .eq("document_id", documentId)
      .eq("reviewer_id", user.id)
      .eq("round_no", maxRoundRow.round_no)
      .maybeSingle();

    if (!assignedApproval) {
      return NextResponse.json(
        {
          error:
            "Only reviewers assigned to the current round can add highlights.",
        },
        { status: 403 }
      );
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("id, full_name")
      .eq("id", user.id)
      .single();

    const { data: inserted, error: insertError } = await admin
      .from("document_highlights")
      .insert({
        document_id: documentId,
        document_version_id: versionId,
        reviewer_id: user.id,
        page_number: pageNumber,
        selected_text: selectedText,
        comment,
        bounding_rects: boundingRectsRaw,
      })
      .select(
        "id, document_version_id, reviewer_id, page_number, selected_text, comment, bounding_rects, created_at"
      )
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: insertError?.message || "Failed to save highlight." },
        { status: 500 }
      );
    }

    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "ADD_HIGHLIGHT",
      target_table: "document_highlights",
      target_id: inserted.id,
      metadata: {
        document_id: documentId,
        version_id: versionId,
        page_number: pageNumber,
        comment_length: comment.length,
      },
    });

    return NextResponse.json({
      ...inserted,
      reviewer_name: profile?.full_name || user.id,
    });
  } catch (error) {
    console.error("Create highlight API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while saving the highlight.",
      },
      { status: 500 }
    );
  }
}
