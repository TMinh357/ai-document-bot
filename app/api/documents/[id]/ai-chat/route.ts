import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  AIConfigError,
  AIQuotaError,
  AIRateLimitError,
  answerQuestion,
} from "@/lib/openai";

export const runtime = "nodejs";

const MAX_QUESTION_CHARS = 1000;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

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

    if (question.length > MAX_QUESTION_CHARS) {
      return NextResponse.json(
        { error: `Question must be ${MAX_QUESTION_CHARS} characters or fewer.` },
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

    const result = await answerQuestion(documentText, question);

    const { error: insertError } = await supabase
      .from("document_ai_messages")
      .insert({
        document_id: id,
        user_id: user.id,
        question,
        answer: result.answer,
      });

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "ASK_DOCUMENT_AI",
      target_table: "documents",
      target_id: id,
      metadata: {
        question,
        model: result.model,
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
        truncated: result.truncated,
      },
    });

    return NextResponse.json({
      answer: result.answer,
    });
  } catch (error) {
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof AIRateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof AIQuotaError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }

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
