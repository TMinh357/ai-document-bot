import { NextResponse } from "next/server";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AIConfigError,
  AIOcrPageLimitError,
  AIQuotaError,
  AIRateLimitError,
  extractTextFromPdf,
} from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const OCR_FALLBACK_THRESHOLD = 100;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type TextLayerResult = {
  text: string;
  numPages: number;
};

async function extractTextLayer(buffer: Buffer): Promise<TextLayerResult> {
  const result = await pdfParse(buffer);

  const cleaned = result.text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text: cleaned, numPages: result.numpages };
}

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

    const { data: version, error: versionError } = await supabase
      .from("document_versions")
      .select("id, file_path")
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

    if (!version.file_path) {
      return NextResponse.json(
        { error: "No uploaded PDF file was found for this document." },
        { status: 404 }
      );
    }

    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from("documents")
        .createSignedUrl(version.file_path, 60);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      return NextResponse.json(
        { error: "Failed to create a temporary file URL." },
        { status: 500 }
      );
    }

    const fileResponse = await fetch(signedUrlData.signedUrl);

    if (!fileResponse.ok) {
      return NextResponse.json(
        { error: "Failed to download the PDF file." },
        { status: 500 }
      );
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let extractedText = "";
    let numPages = 0;
    let path: "text_layer" | "ocr_vision" = "text_layer";

    try {
      const layer = await extractTextLayer(buffer);
      extractedText = layer.text;
      numPages = layer.numPages;
    } catch {
      // pdf-parse failed entirely — fall through to OCR
      extractedText = "";
    }

    let ocrPromptTokens = 0;
    let ocrCompletionTokens = 0;
    let ocrModel: string | null = null;

    if (extractedText.length < OCR_FALLBACK_THRESHOLD) {
      const ocr = await extractTextFromPdf(buffer, numPages || 1);
      extractedText = ocr.text;
      ocrPromptTokens = ocr.promptTokens;
      ocrCompletionTokens = ocr.completionTokens;
      ocrModel = ocr.model;
      path = "ocr_vision";
    }

    if (!extractedText) {
      return NextResponse.json(
        {
          error:
            "No readable text could be extracted from this PDF (text layer empty and OCR returned nothing).",
        },
        { status: 400 }
      );
    }

    const { data: updateRows, error: updateError } = await supabase
      .from("document_versions")
      .update({
        content_text: extractedText,
      })
      .eq("id", version.id)
      .select("id");

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    if (!updateRows || updateRows.length === 0) {
      const adminClient = createAdminClient();
      const { error: adminUpdateError } = await adminClient
        .from("document_versions")
        .update({
          content_text: extractedText,
        })
        .eq("id", version.id);

      if (adminUpdateError) {
        return NextResponse.json(
          {
            error:
              "Failed to save extracted text to the database: " +
              adminUpdateError.message,
          },
          { status: 500 }
        );
      }
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "EXTRACT_DOCUMENT_TEXT",
      target_table: "documents",
      target_id: id,
      metadata: {
        version_id: version.id,
        character_count: extractedText.length,
        page_count: numPages,
        path,
        ...(path === "ocr_vision"
          ? {
              ocr_model: ocrModel,
              ocr_prompt_tokens: ocrPromptTokens,
              ocr_completion_tokens: ocrCompletionTokens,
            }
          : { parser: "pdf-parse" }),
      },
    });

    return NextResponse.json({
      text: extractedText,
      characterCount: extractedText.length,
      path,
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
    if (error instanceof AIOcrPageLimitError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }

    console.error("Extract text API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while extracting text.",
      },
      { status: 500 }
    );
  }
}
