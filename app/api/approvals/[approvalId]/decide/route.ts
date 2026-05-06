import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    approvalId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { approvalId } = await context.params;
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
    const decision =
      typeof body?.status === "string" ? body.status : "";
    const comment =
      typeof body?.comment === "string" ? body.comment.trim() : "";

    if (decision !== "approved" && decision !== "rejected") {
      return NextResponse.json(
        { error: "Decision must be 'approved' or 'rejected'." },
        { status: 400 }
      );
    }

    if (decision === "rejected" && comment.length === 0) {
      return NextResponse.json(
        { error: "A comment is required when rejecting a document." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: approval, error: approvalError } = await admin
      .from("approvals")
      .select(
        "id, document_id, reviewer_id, status, round_no"
      )
      .eq("id", approvalId)
      .single();

    if (approvalError || !approval) {
      return NextResponse.json(
        { error: "Approval not found." },
        { status: 404 }
      );
    }

    if (approval.reviewer_id !== user.id) {
      return NextResponse.json(
        { error: "You are not the assigned reviewer for this approval." },
        { status: 403 }
      );
    }

    if (approval.status !== "pending") {
      return NextResponse.json(
        { error: "This approval has already been decided." },
        { status: 400 }
      );
    }

    const { data: document, error: documentError } = await admin
      .from("documents")
      .select("id, title, owner_id, status")
      .eq("id", approval.document_id)
      .single();

    if (documentError || !document) {
      return NextResponse.json(
        { error: "Document not found." },
        { status: 404 }
      );
    }

    if (document.status !== "pending") {
      return NextResponse.json(
        {
          error:
            "This document is no longer pending review (it may already be approved, rejected, or signed).",
        },
        { status: 400 }
      );
    }

    const { data: maxRoundRow } = await admin
      .from("approvals")
      .select("round_no")
      .eq("document_id", approval.document_id)
      .order("round_no", { ascending: false })
      .limit(1)
      .single();

    const currentRound = maxRoundRow?.round_no ?? approval.round_no;

    if (approval.round_no !== currentRound) {
      return NextResponse.json(
        { error: "This approval belongs to a previous review round." },
        { status: 400 }
      );
    }

    const { error: updateError } = await admin
      .from("approvals")
      .update({
        status: decision,
        comment: comment || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", approvalId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    const { data: roundApprovals, error: roundError } = await admin
      .from("approvals")
      .select("id, status, reviewer_id")
      .eq("document_id", approval.document_id)
      .eq("round_no", currentRound);

    if (roundError || !roundApprovals) {
      return NextResponse.json(
        { error: roundError?.message || "Could not load round state." },
        { status: 500 }
      );
    }

    let nextDocStatus: "pending" | "approved" | "rejected" = "pending";

    if (decision === "rejected") {
      nextDocStatus = "rejected";
    } else if (roundApprovals.every((a) => a.status === "approved")) {
      nextDocStatus = "approved";
    }

    if (nextDocStatus !== "pending") {
      const { error: docUpdateError } = await admin
        .from("documents")
        .update({
          status: nextDocStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", document.id);

      if (docUpdateError) {
        return NextResponse.json(
          { error: docUpdateError.message },
          { status: 500 }
        );
      }
    }

    const approvedCount = roundApprovals.filter(
      (a) => a.status === "approved"
    ).length;
    const totalCount = roundApprovals.length;

    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: decision === "approved" ? "APPROVE_DOCUMENT" : "REJECT_DOCUMENT",
      target_table: "documents",
      target_id: document.id,
      metadata: {
        approval_id: approvalId,
        round_no: currentRound,
        decision,
        comment: comment || null,
        approved_count: approvedCount,
        total_count: totalCount,
        document_status: nextDocStatus,
      },
    });

    if (decision === "rejected") {
      await admin.from("notifications").insert({
        user_id: document.owner_id,
        type: "document_rejected",
        title: "Document Rejected",
        message: `Your document "${document.title}" was rejected${comment ? `: ${comment}` : "."}`,
        document_id: document.id,
      });
    } else if (nextDocStatus === "approved") {
      await admin.from("notifications").insert({
        user_id: document.owner_id,
        type: "document_approved",
        title: "Document Approved",
        message: `Your document "${document.title}" has been approved by all ${totalCount} reviewer${totalCount === 1 ? "" : "s"}.`,
        document_id: document.id,
      });
    } else {
      await admin.from("notifications").insert({
        user_id: document.owner_id,
        type: "review_progress",
        title: "Review Progress",
        message: `"${document.title}" — ${approvedCount} of ${totalCount} reviewers have approved.`,
        document_id: document.id,
      });
    }

    return NextResponse.json({
      decision,
      documentStatus: nextDocStatus,
      approvedCount,
      totalCount,
      roundNo: currentRound,
    });
  } catch (error) {
    console.error("Decide approval API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while recording your decision.",
      },
      { status: 500 }
    );
  }
}
