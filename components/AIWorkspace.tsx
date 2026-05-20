"use client";

import { useState } from "react";
import FormattedDate from "./FormattedDate";

type AIMessage = {
  id: string;
  question: string;
  answer: string;
  created_at: string;
};

type AIWorkspaceProps = {
  documentId: string;
  initialExtractedText?: string | null;
  initialSummary?: string | null;
  initialKeyPoints?: string | null;
  initialRiskNotes?: string | null;
  initialMessages?: AIMessage[];
};

async function readApiResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return {
      error: "The server returned an empty response. Please check the API route or server terminal.",
    };
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      error: text || "The server returned an invalid response.",
    };
  }
}

export default function AIWorkspace({
  documentId,
  initialExtractedText,
  initialSummary,
  initialKeyPoints,
  initialRiskNotes,
  initialMessages = [],
}: AIWorkspaceProps) {
  const [extractedText, setExtractedText] = useState(initialExtractedText || "");
  const [summary, setSummary] = useState(initialSummary || "");
  const [keyPoints, setKeyPoints] = useState(initialKeyPoints || "");
  const [riskNotes, setRiskNotes] = useState(initialRiskNotes || "");
  const [messages, setMessages] = useState<AIMessage[]>(initialMessages);

  const [question, setQuestion] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<"info" | "success" | "error">(
    "info"
  );
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isAsking, setIsAsking] = useState(false);

  function setStatus(message: string, tone: "info" | "success" | "error") {
    setStatusMessage(message);
    setStatusTone(tone);
  }

  async function extractText() {
    setStatus(
      "Extracting text… (scanned PDFs run OCR and may take up to 30 seconds)",
      "info"
    );
    setIsExtracting(true);

    try {
      const response = await fetch(`/api/documents/${documentId}/extract-text`, {
        method: "POST",
      });

      const data = await readApiResponse(response);

      if (!response.ok || data.error) {
        setStatus(data.error || "Failed to extract text.", "error");
        setIsExtracting(false);
        return;
      }

      setExtractedText(data.text || "");
      setStatus(
        data.path === "ocr_vision"
          ? "Text extraction completed via OCR (this PDF had no text layer)."
          : "Text extraction completed.",
        "success"
      );
    } catch (error) {
      setStatus("Failed to connect to the text extraction API.", "error");
    }

    setIsExtracting(false);
  }

  async function generateSummary() {
    setStatus("Generating AI summary…", "info");
    setIsSummarizing(true);

    try {
      const response = await fetch(`/api/documents/${documentId}/ai-summary`, {
        method: "POST",
      });

      const data = await readApiResponse(response);

      if (!response.ok || data.error) {
        setStatus(data.error || "Failed to generate summary.", "error");
        setIsSummarizing(false);
        return;
      }

      setSummary(data.summary || "");
      setKeyPoints(data.keyPoints || "");
      setRiskNotes(data.riskNotes || "");
      setStatus("AI summary generated.", "success");
    } catch (error) {
      setStatus("Failed to connect to the AI summary API.", "error");
    }

    setIsSummarizing(false);
  }

  async function askQuestion(e: React.FormEvent) {
    e.preventDefault();

    if (!question.trim()) {
      return;
    }

    setStatusMessage("");
    setIsAsking(true);

    const currentQuestion = question.trim();

    try {
      const response = await fetch(`/api/documents/${documentId}/ai-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: currentQuestion,
        }),
      });

      const data = await readApiResponse(response);

      if (!response.ok || data.error) {
        setStatus(data.error || "Failed to answer the question.", "error");
        setIsAsking(false);
        return;
      }

      setMessages((previousMessages) => [
        {
          id: crypto.randomUUID(),
          question: currentQuestion,
          answer: data.answer,
          created_at: new Date().toISOString(),
        },
        ...previousMessages,
      ]);

      setQuestion("");
    } catch (error) {
      setStatus(
        "Failed to connect to the AI question answering API.",
        "error"
      );
    }

    setIsAsking(false);
  }

  return (
    <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-teal-700">
            AI Assistant
          </p>

          <h2 className="mt-2 text-2xl font-bold text-gray-900">
            Document Intelligence
          </h2>

          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            Extract text from the uploaded PDF, generate a review summary, and
            ask questions about the document content.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={extractText}
            disabled={isExtracting}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
          >
            {isExtracting ? "Extracting..." : "Extract Text"}
          </button>

          <button
            onClick={generateSummary}
            disabled={isSummarizing}
            className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {isSummarizing ? "Generating..." : "Generate Summary"}
          </button>
        </div>
      </div>

      {statusMessage && (
        <p
          role="status"
          aria-live="polite"
          className={`mt-4 rounded-xl border p-3 text-sm ${
            statusTone === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : statusTone === "error"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-slate-200 bg-slate-50 text-gray-700"
          }`}
        >
          {statusMessage}
        </p>
      )}

      {summary || keyPoints || riskNotes ? (
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 p-5 lg:col-span-2">
            <h3 className="font-semibold text-gray-900">AI Summary</h3>

            {summary ? (
              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-gray-700">
                {summary}
              </p>
            ) : (
              <p className="mt-3 text-sm text-gray-500">
                Summary not available for this run.
              </p>
            )}
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900">Key Points</h3>

              {keyPoints ? (
                <p className="mt-3 whitespace-pre-line text-sm leading-7 text-gray-700">
                  {keyPoints}
                </p>
              ) : (
                <p className="mt-3 text-sm text-gray-500">
                  Key points not available for this run.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900">Risk Notes</h3>

              {riskNotes ? (
                <p className="mt-3 whitespace-pre-line text-sm leading-7 text-gray-700">
                  {riskNotes}
                </p>
              ) : (
                <p className="mt-3 text-sm text-gray-500">
                  Risk notes not available for this run.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-slate-50 p-6 text-center">
          <p className="text-sm font-semibold text-gray-700">
            No AI analysis yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            Click <span className="font-medium">Generate Summary</span> above to
            produce an overview, key points, and risk notes for this document.
          </p>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900">Ask About This Document</h3>

        <form
          onSubmit={askQuestion}
          className="mt-4 flex flex-col gap-3 md:flex-row"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about the document..."
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-700"
          />

          <button
            type="submit"
            disabled={isAsking}
            className="button-primary disabled:opacity-60"
          >
            {isAsking ? "Asking..." : "Ask AI"}
          </button>
        </form>

        <div className="mt-5 space-y-4">
          {messages.length > 0 ? (
            messages.map((message) => (
              <div key={message.id} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-gray-900">
                  Question: {message.question}
                </p>

                <p className="mt-2 whitespace-pre-line text-sm leading-7 text-gray-700">
                  {message.answer}
                </p>

                <p className="mt-2 text-xs text-gray-500">
                  <FormattedDate value={message.created_at} />
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500">
              No AI questions have been asked yet.
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900">Extracted Text Preview</h3>

        {extractedText ? (
          <p className="mt-3 max-h-64 overflow-auto whitespace-pre-line rounded-xl bg-slate-50 p-4 text-xs leading-6 text-gray-700">
            {extractedText}
          </p>
        ) : (
          <p className="mt-3 text-sm text-gray-500">
            No extracted text available. Click Extract Text to read the uploaded PDF.
          </p>
        )}
      </div>
    </section>
  );
}