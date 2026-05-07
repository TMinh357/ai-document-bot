import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

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
    const reviewerIdsRaw = Array.isArray(body?.reviewerIds)
      ? body.reviewerIds
      : [];

    const reviewerIds: string[] = Array.from(
      new Set(
        reviewerIdsRaw.filter(
          (value: unknown): value is string =>
            typeof value === "string" && value.length > 0
        )
      )
    );

    if (reviewerIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one reviewer." },
        { status: 400 }
      );
    }

    if (reviewerIds.includes(user.id)) {
      return NextResponse.json(
        { error: "You cannot assign yourself as a reviewer." },
        { status: 400 }
      );
    }

    const dueInDaysRaw = Number(body?.dueInDays);
    const dueInDays =
      Number.isFinite(dueInDaysRaw) && dueInDaysRaw >= 1 && dueInDaysRaw <= 60
        ? Math.floor(dueInDaysRaw)
        : 7;
    const dueAt = new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000);

    const admin = createAdminClient();

    const { data: document, error: documentError } = await admin
      .from("documents")
      .select("id, title, owner_id, status")
      .eq("id", documentId)
      .single();

    if (documentError || !document) {
      return NextResponse.json(
        { error: "Document not found." },
        { status: 404 }
      );
    }

    if (document.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Only the document owner can submit it for review." },
        { status: 403 }
      );
    }

    if (document.status !== "draft") {
      return NextResponse.json(
        {
          error:
            "Only documents in draft status can be submitted for review.",
        },
        { status: 400 }
      );
    }

    const { data: reviewerProfiles, error: reviewerError } = await admin
      .from("profiles")
      .select("id, role")
      .in("id", reviewerIds);

    if (reviewerError) {
      return NextResponse.json(
        { error: reviewerError.message },
        { status: 500 }
      );
    }

    const validReviewerIds = new Set(
      (reviewerProfiles || [])
        .filter((p) => p.role === "reviewer" || p.role === "admin")
        .map((p) => p.id)
    );

    const invalidIds = reviewerIds.filter((id) => !validReviewerIds.has(id));

    if (invalidIds.length > 0) {
      return NextResponse.json(
        {
          error:
            "One or more selected users are not reviewers or do not exist.",
        },
        { status: 400 }
      );
    }

    const { data: previousRound } = await admin
      .from("approvals")
      .select("round_no")
      .eq("document_id", documentId)
      .order("round_no", { ascending: false })
      .limit(1)
      .single();

    const nextRound = (previousRound?.round_no ?? 0) + 1;

    const { error: insertError } = await admin.from("approvals").insert(
      reviewerIds.map((reviewerId) => ({
        document_id: documentId,
        reviewer_id: reviewerId,
        status: "pending",
        round_no: nextRound,
        due_at: dueAt.toISOString(),
      }))
    );

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    const { error: updateError } = await admin
      .from("documents")
      .update({
        status: "pending",
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
      action: "SUBMIT_FOR_REVIEW",
      target_table: "documents",
      target_id: documentId,
      metadata: {
        round_no: nextRound,
        reviewer_ids: reviewerIds,
        reviewer_count: reviewerIds.length,
        due_at: dueAt.toISOString(),
        due_in_days: dueInDays,
      },
    });

    const dueLabel = dueAt.toLocaleDateString();

    await admin.from("notifications").insert(
      reviewerIds.map((reviewerId) => ({
        user_id: reviewerId,
        type: "review_assigned",
        title: "Document Assigned for Review",
        message: `You have been assigned to review "${document.title}" (round ${nextRound}, ${reviewerIds.length} reviewer${reviewerIds.length === 1 ? "" : "s"} total). Due ${dueLabel}.`,
        document_id: documentId,
      }))
    );

    return NextResponse.json({
      roundNo: nextRound,
      reviewerCount: reviewerIds.length,
      dueAt: dueAt.toISOString(),
    });
  } catch (error) {
    console.error("Submit for review API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while submitting for review.",
      },
      { status: 500 }
    );
  }
}
