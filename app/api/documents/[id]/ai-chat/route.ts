import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function cleanExtractedText(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/([a-z])\s+([a-z])/gi, "$1$2")
    .trim();
}

function findRelevantAnswer(documentText: string, question: string) {
  const cleanedText = cleanExtractedText(documentText);
  const lowerQuestion = question.toLowerCase();

  if (
    lowerQuestion.includes("what is this document about") ||
    lowerQuestion.includes("summary") ||
    lowerQuestion.includes("about")
  ) {
    return `This document appears to describe the main requirements, objectives, and implementation work related to a software system. Based on the extracted text, it includes project goals, system features, workflow activities, and technical tasks.`;
  }

  if (
    lowerQuestion.includes("objective") ||
    lowerQuestion.includes("goal") ||
    lowerQuestion.includes("purpose")
  ) {
    return `The main purpose of the document is to describe the objectives and required features of the system. The extracted text mentions system design, implementation tasks, approval workflow, access control, and testing activities.`;
  }

  if (
    lowerQuestion.includes("risk") ||
    lowerQuestion.includes("issue") ||
    lowerQuestion.includes("problem")
  ) {
    return `Potential risks include incomplete requirements, unclear testing coverage, missing security details, or insufficient explanation of the approval workflow. A reviewer should manually verify these points before approving the document.`;
  }

  if (
    lowerQuestion.includes("database") ||
    lowerQuestion.includes("supabase")
  ) {
    return `The document appears to include database-related work, including system data design and management. If Supabase is used, the reviewer should check tables, relationships, access policies, and storage rules.`;
  }

  if (
    lowerQuestion.includes("role") ||
    lowerQuestion.includes("permission") ||
    lowerQuestion.includes("access")
  ) {
    return `The system should include role-based access control. In this project, the main roles are employee, reviewer, and admin. Employees create and submit documents, reviewers approve or reject documents, and admins can be extended to manage users and system settings.`;
  }

  const keyword = lowerQuestion
    .split(" ")
    .filter((word) => word.length > 4)
    .find((word) => cleanedText.toLowerCase().includes(word));

  if (keyword) {
    const index = cleanedText.toLowerCase().indexOf(keyword);
    const start = Math.max(0, index - 250);
    const end = Math.min(cleanedText.length, index + 500);

    return `The document contains information related to "${keyword}". Relevant extracted text: ${cleanedText.slice(start, end)}`;
  }

  return `The document does not provide enough clear information to answer this question directly. Please review the extracted text manually or ask a more specific question.`;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
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
    const question = String(body.question || "").trim();

    if (!question) {
      return NextResponse.json(
        { error: "Question is required." },
        { status: 400 }
      );
    }

    const { data: version, error: versionError } = await supabase
      .from("document_versions")
      .select("content_text")
      .eq("document_id", id)
      .order("version_no", { ascending: false })
      .limit(1)
      .single();

    if (versionError || !version) {
      return NextResponse.json(
        { error: "No document version was found." },
        { status: 404 }
      );
    }

    const documentText = version.content_text?.trim();

    if (!documentText) {
      return NextResponse.json(
        { error: "Please extract text from the PDF before asking questions." },
        { status: 400 }
      );
    }

    const answer = findRelevantAnswer(documentText, question);

    const { error: insertError } = await supabase
      .from("document_ai_messages")
      .insert({
        document_id: id,
        user_id: user.id,
        question,
        answer,
      });

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "ASK_MOCK_DOCUMENT_AI",
      target_table: "documents",
      target_id: id,
      metadata: {
        question,
        mode: "offline_mock",
      },
    });

    return NextResponse.json({
      answer,
    });
  } catch (error) {
    console.error("AI chat API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while answering the question.",
      },
      { status: 500 }
    );
  }
}