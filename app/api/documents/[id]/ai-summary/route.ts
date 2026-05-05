import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function cleanExtractedText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function splitIntoSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function createMockSummary(documentText: string) {
  const cleanedText = cleanExtractedText(documentText);
  const sentences = splitIntoSentences(cleanedText);

  const summarySentences = sentences.slice(0, 3);

  const summary =
    summarySentences.length > 0
      ? summarySentences.join(" ")
      : cleanedText.slice(0, 700);

  const lowerText = cleanedText.toLowerCase();

  const keyPoints: string[] = [];

  if (lowerText.includes("objective") || lowerText.includes("objectives")) {
    keyPoints.push("The document defines clear objectives for the system.");
  }

  if (lowerText.includes("database") || lowerText.includes("supabase")) {
    keyPoints.push("The system includes database design and data management.");
  }

  if (lowerText.includes("approval") || lowerText.includes("review")) {
    keyPoints.push("The workflow includes review and approval activities.");
  }

  if (lowerText.includes("role") || lowerText.includes("access")) {
    keyPoints.push("The system considers user roles and access control.");
  }

  if (keyPoints.length === 0) {
    keyPoints.push("The document contains project requirements and implementation details.");
    keyPoints.push("The content can be used as input for document review.");
    keyPoints.push("The document should be checked for completeness and clarity.");
  }

  const riskNotes: string[] = [];

  if (!lowerText.includes("test")) {
    riskNotes.push("Testing information is not clearly visible in the extracted text.");
  }

  if (!lowerText.includes("security") && !lowerText.includes("access")) {
    riskNotes.push("Security and access control details may need further clarification.");
  }

  if (!lowerText.includes("timeline") && !lowerText.includes("schedule")) {
    riskNotes.push("Project timeline or schedule information may be incomplete.");
  }

  if (riskNotes.length === 0) {
    riskNotes.push("No major risk was detected from the extracted text.");
    riskNotes.push("Reviewer should still manually verify important requirements.");
  }

  return {
    summary,
    keyPoints: keyPoints.map((point) => `- ${point}`).join("\n"),
    riskNotes: riskNotes.map((note) => `- ${note}`).join("\n"),
  };
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
        { error: "Please extract text from the PDF before generating a summary." },
        { status: 400 }
      );
    }

    const result = createMockSummary(documentText);

    const { error: insertError } = await supabase
      .from("document_ai_results")
      .insert({
        document_id: id,
        user_id: user.id,
        summary: result.summary,
        key_points: result.keyPoints,
        risk_notes: result.riskNotes,
      });

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "GENERATE_MOCK_AI_SUMMARY",
      target_table: "documents",
      target_id: id,
      metadata: {
        mode: "offline_mock",
      },
    });

    return NextResponse.json({
      summary: result.summary,
      keyPoints: result.keyPoints,
      riskNotes: result.riskNotes,
    });
  } catch (error) {
    console.error("AI summary API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while generating the summary.",
      },
      { status: 500 }
    );
  }
}