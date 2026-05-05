import { NextResponse } from "next/server";
import PDFParser from "pdf2json";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type PdfTextRun = {
  T?: string;
};

type PdfTextItem = {
  R?: PdfTextRun[];
};

type PdfPage = {
  Texts?: PdfTextItem[];
};

type PdfData = {
  Pages?: PdfPage[];
};

function decodePdfText(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    pdfParser.on("pdfParser_dataError", (errorData: unknown) => {
  let errorMessage = "Failed to parse the PDF file.";

  if (errorData instanceof Error) {
    errorMessage = errorData.message;
  }

  if (
    typeof errorData === "object" &&
    errorData !== null &&
    "parserError" in errorData
  ) {
    const parserError = (errorData as { parserError?: unknown }).parserError;

    if (parserError instanceof Error) {
      errorMessage = parserError.message;
    } else if (typeof parserError === "string") {
      errorMessage = parserError;
    }
  }

  reject(new Error(errorMessage));
});

    pdfParser.on("pdfParser_dataReady", (pdfData: PdfData) => {
      const pages = pdfData.Pages || [];

      const extractedText = pages
        .map((page) => {
          const textItems = page.Texts || [];

          return textItems
            .map((textItem) => {
              const runs = textItem.R || [];

              return runs
                .map((run) => decodePdfText(run.T || ""))
                .join("");
            })
            .join(" ");
        })
        .join("\n\n")
        .replace(/[ \t]+/g, " ")
        .trim();

      resolve(extractedText);
    });

    pdfParser.parseBuffer(buffer);
  });
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

    const extractedText = await extractTextFromPdfBuffer(buffer);

    if (!extractedText) {
      return NextResponse.json(
        {
          error:
            "No readable text was found in this PDF. Please try a text-based PDF instead of a scanned image PDF.",
        },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("document_versions")
      .update({
        content_text: extractedText,
      })
      .eq("id", version.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "EXTRACT_DOCUMENT_TEXT",
      target_table: "documents",
      target_id: id,
      metadata: {
        version_id: version.id,
        character_count: extractedText.length,
        parser: "pdf2json",
      },
    });

    return NextResponse.json({
      text: extractedText,
      characterCount: extractedText.length,
    });
  } catch (error) {
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