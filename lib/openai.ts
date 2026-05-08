import OpenAI, { toFile } from "openai";

const MAX_INPUT_CHARS = 12000;
const DEFAULT_MODEL = "gpt-5.4-mini";
const MAX_OCR_PAGES = 10;

export class AIConfigError extends Error {}
export class AIQuotaError extends Error {}
export class AIRateLimitError extends Error {}
export class AIOcrPageLimitError extends Error {}

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AIConfigError(
      "AI is not configured. Ask the admin to set OPENAI_API_KEY."
    );
  }
  return new OpenAI({ apiKey });
}

function getModel() {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

function truncate(text: string) {
  if (text.length <= MAX_INPUT_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_INPUT_CHARS), truncated: true };
}

function rethrowAsDomainError(error: unknown): never {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) {
      throw new AIConfigError(
        "AI key is invalid. Ask the admin to update OPENAI_API_KEY."
      );
    }
    if (error.status === 429) {
      throw new AIRateLimitError(
        "AI is busy or quota exhausted. Try again in a moment."
      );
    }
    if (error.status === 402) {
      throw new AIQuotaError(
        "AI quota exhausted. Ask the admin to top up the OpenAI account."
      );
    }
  }
  throw error;
}

export type SummaryResult = {
  summary: string;
  keyPoints: string;
  riskNotes: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  truncated: boolean;
};

const SUMMARY_SCHEMA = {
  name: "document_review_summary",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: {
        type: "string",
        description:
          "A concise 3-5 sentence executive summary of the document.",
      },
      key_points: {
        type: "array",
        description: "3-6 short bullet points capturing the main ideas.",
        items: { type: "string" },
      },
      risk_notes: {
        type: "array",
        description:
          "2-5 specific risks, missing pieces, or things a reviewer should double-check before approving.",
        items: { type: "string" },
      },
    },
    required: ["summary", "key_points", "risk_notes"],
  },
  strict: true,
} as const;

const SUMMARY_SYSTEM_PROMPT =
  "You are an assistant that reviews documents for a document-approval workflow. " +
  "You read an extracted PDF text and produce a structured review summary. " +
  "Be objective, concrete, and concise. Never invent facts not present in the text.";

export async function summarizeDocument(
  documentText: string
): Promise<SummaryResult> {
  const { text, truncated } = truncate(documentText);
  const client = getClient();
  const model = getModel();

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        {
          role: "user",
          content:
            "Document text:\n\n" +
            text +
            (truncated
              ? "\n\n[Note: input was truncated to fit length limits.]"
              : ""),
        },
      ],
      response_format: { type: "json_schema", json_schema: SUMMARY_SCHEMA },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("AI returned an empty response.");
    }

    const parsed = JSON.parse(content) as {
      summary: string;
      key_points: string[];
      risk_notes: string[];
    };

    return {
      summary: parsed.summary,
      keyPoints: parsed.key_points.map((p) => `- ${p}`).join("\n"),
      riskNotes: parsed.risk_notes.map((r) => `- ${r}`).join("\n"),
      model,
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      truncated,
    };
  } catch (error) {
    rethrowAsDomainError(error);
  }
}

export type AnswerResult = {
  answer: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  truncated: boolean;
};

const CHAT_SYSTEM_PROMPT =
  "You answer questions strictly about the provided document text. " +
  "If the document does not contain enough information, say so plainly. " +
  "Keep answers concise (under 6 sentences). Never invent facts.";

export async function answerQuestion(
  documentText: string,
  question: string
): Promise<AnswerResult> {
  const { text, truncated } = truncate(documentText);
  const client = getClient();
  const model = getModel();

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: CHAT_SYSTEM_PROMPT },
        {
          role: "user",
          content:
            "Document text:\n\n" +
            text +
            (truncated
              ? "\n\n[Note: input was truncated to fit length limits.]"
              : "") +
            "\n\nQuestion: " +
            question,
        },
      ],
    });

    const answer = response.choices[0]?.message?.content?.trim();
    if (!answer) {
      throw new Error("AI returned an empty answer.");
    }

    return {
      answer,
      model,
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      truncated,
    };
  } catch (error) {
    rethrowAsDomainError(error);
  }
}

export type OcrResult = {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
};

const OCR_SYSTEM_PROMPT =
  "You are an OCR engine. Extract all text from the provided document, " +
  "preserving paragraph breaks and basic structure. " +
  "If text is in Vietnamese, transcribe it as-is with diacritics. " +
  "Output only the extracted text — no commentary, no markdown, no headings of your own.";

function getOcrModel() {
  return process.env.OPENAI_OCR_MODEL || getModel();
}

export async function extractTextFromPdf(
  buffer: Buffer,
  pageCount: number
): Promise<OcrResult> {
  if (pageCount > MAX_OCR_PAGES) {
    throw new AIOcrPageLimitError(
      `OCR is limited to ${MAX_OCR_PAGES} pages per document. This PDF has ${pageCount}.`
    );
  }

  const client = getClient();
  const model = getOcrModel();

  const uploaded = await client.files.create({
    file: await toFile(buffer, "document.pdf", { type: "application/pdf" }),
    purpose: "user_data",
  });

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: OCR_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "file", file: { file_id: uploaded.id } },
            { type: "text", text: "Extract all text from this PDF." },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";

    return {
      text,
      model,
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
    };
  } catch (error) {
    rethrowAsDomainError(error);
  } finally {
    client.files.delete(uploaded.id).catch(() => {
      // best effort cleanup; don't surface upload-cleanup failures to caller
    });
  }
}
