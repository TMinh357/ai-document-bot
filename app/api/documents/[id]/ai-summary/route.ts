import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  AIConfigError,
  AIQuotaError,
  AIRateLimitError,
  summarizeDocument,
} from "@/lib/openai";
import { RateLimitExceededError, enforceAiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
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

    await enforceAiRateLimit(user.id);

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

    const result = await summarizeDocument(documentText);

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
      action: "GENERATE_AI_SUMMARY",
      target_table: "documents",
      target_id: id,
      metadata: {
        model: result.model,
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
        truncated: result.truncated,
      },
    });

    return NextResponse.json({
      summary: result.summary,
      keyPoints: result.keyPoints,
      riskNotes: result.riskNotes,
    });
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        }
      );
    }
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof AIRateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof AIQuotaError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }

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
