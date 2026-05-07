"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export type BoundingRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type Highlight = {
  id: string;
  document_version_id: string;
  reviewer_id: string;
  reviewer_name: string;
  page_number: number;
  selected_text: string;
  comment: string;
  bounding_rects: BoundingRect[];
  created_at: string;
};

type PendingSelection = {
  text: string;
  pageNumber: number;
  rects: BoundingRect[];
  popoverLeft: number;
  popoverTop: number;
};

type Props = {
  documentId: string;
  versionId: string;
  signedUrl: string;
  externalUrl: string | null;
  initialHighlights: Highlight[];
  canHighlight: boolean;
  currentUserId: string;
};

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function InlinePdfViewer({
  documentId,
  versionId,
  signedUrl,
  externalUrl,
  initialHighlights,
  canHighlight,
  currentUserId,
}: Props) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [highlights, setHighlights] = useState<Highlight[]>(initialHighlights);
  const [pendingSelection, setPendingSelection] =
    useState<PendingSelection | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const pageContainerRef = useRef<HTMLDivElement | null>(null);

  function clearSelection() {
    setPendingSelection(null);
    setCommentDraft("");
    if (typeof window !== "undefined") {
      window.getSelection()?.removeAllRanges();
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        clearSelection();
        setActiveHighlightId(null);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleMouseUp() {
    if (!canHighlight) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (!text) return;

    const range = selection.getRangeAt(0);
    const pageEl = pageContainerRef.current;
    if (!pageEl || !pageEl.contains(range.commonAncestorContainer)) return;

    const pageRect = pageEl.getBoundingClientRect();
    if (pageRect.width === 0 || pageRect.height === 0) return;

    const clientRects = Array.from(range.getClientRects()).filter(
      (r) => r.width > 0 && r.height > 0
    );

    if (clientRects.length === 0) return;

    const rects: BoundingRect[] = clientRects.map((rect) => ({
      left: ((rect.left - pageRect.left) / pageRect.width) * 100,
      top: ((rect.top - pageRect.top) / pageRect.height) * 100,
      width: (rect.width / pageRect.width) * 100,
      height: (rect.height / pageRect.height) * 100,
    }));

    const lastRect = clientRects[clientRects.length - 1];

    setPendingSelection({
      text,
      pageNumber,
      rects,
      popoverLeft: lastRect.right - pageRect.left,
      popoverTop: lastRect.bottom - pageRect.top + 6,
    });
    setCommentDraft("");
    setError("");
  }

  async function submitHighlight(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingSelection || !commentDraft.trim()) return;

    setSubmitting(true);
    setError("");

    const response = await fetch(`/api/documents/${documentId}/highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        versionId,
        pageNumber: pendingSelection.pageNumber,
        selectedText: pendingSelection.text,
        comment: commentDraft.trim(),
        boundingRects: pendingSelection.rects,
      }),
    });

    setSubmitting(false);

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result?.error || "Failed to save highlight.");
      return;
    }

    const newHighlight: Highlight = await response.json();
    setHighlights((prev) => [...prev, newHighlight]);
    clearSelection();
  }

  async function deleteHighlight(highlightId: string) {
    if (!confirm("Delete this highlight?")) return;

    const response = await fetch(
      `/api/documents/${documentId}/highlights/${highlightId}`,
      { method: "DELETE" }
    );

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result?.error || "Failed to delete highlight.");
      return;
    }

    setHighlights((prev) => prev.filter((h) => h.id !== highlightId));
    setActiveHighlightId((prev) => (prev === highlightId ? null : prev));
  }

  function jumpToHighlight(highlight: Highlight) {
    setPageNumber(highlight.page_number);
    setActiveHighlightId(highlight.id);
  }

  const currentPageHighlights = highlights.filter(
    (h) => h.page_number === pageNumber
  );

  return (
    <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">PDF Viewer</h2>
          <p className="muted-copy mt-1 text-sm">
            {canHighlight
              ? "Select text to add a passage-specific comment. Comments appear in the sidebar."
              : "Inline view of the latest version. Reviewers in the current round can leave passage comments."}
          </p>
        </div>

        {externalUrl && (
          <a
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            className="self-start rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            Open in new tab
          </a>
        )}
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-slate-50 px-4 py-2">
            <button
              type="button"
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
              disabled={pageNumber <= 1}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50"
            >
              ← Prev
            </button>

            <span className="text-sm font-medium text-gray-700">
              Page {pageNumber} of {numPages || "—"}
            </span>

            <button
              type="button"
              onClick={() =>
                setPageNumber((p) => Math.min(numPages || p, p + 1))
              }
              disabled={!numPages || pageNumber >= numPages}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50"
            >
              Next →
            </button>

            <div className="ml-auto flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600">Zoom</label>
              <select
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm"
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
              >
                {ZOOM_LEVELS.map((z) => (
                  <option key={z} value={z}>
                    {Math.round(z * 100)}%
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="relative mt-4 flex justify-center overflow-auto rounded-2xl border border-gray-200 bg-gray-100 p-4">
            <div
              ref={pageContainerRef}
              className="relative inline-block"
              onMouseUp={handleMouseUp}
            >
              <Document
                file={signedUrl}
                onLoadSuccess={({ numPages: total }) => setNumPages(total)}
                onLoadError={(err) => {
                  console.error("PDF load error:", err);
                  setError("Failed to load PDF.");
                }}
                loading={
                  <div className="p-10 text-sm text-gray-500">
                    Loading PDF...
                  </div>
                }
                error={
                  <div className="p-10 text-sm text-red-600">
                    Could not load PDF.
                  </div>
                }
              >
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  renderTextLayer={true}
                  renderAnnotationLayer={false}
                />
              </Document>

              {currentPageHighlights.map((h) =>
                h.bounding_rects.map((rect, i) => (
                  <div
                    key={`${h.id}-${i}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveHighlightId(h.id);
                    }}
                    className={`absolute cursor-pointer transition-colors ${
                      activeHighlightId === h.id
                        ? "bg-yellow-400/60 ring-2 ring-yellow-600"
                        : "bg-yellow-300/40 hover:bg-yellow-300/60"
                    }`}
                    style={{
                      left: `${rect.left}%`,
                      top: `${rect.top}%`,
                      width: `${rect.width}%`,
                      height: `${rect.height}%`,
                    }}
                    title={`${h.reviewer_name}: ${h.comment}`}
                  />
                ))
              )}

              {pendingSelection && pendingSelection.pageNumber === pageNumber && (
                <div
                  className="absolute z-10 w-72 rounded-2xl border border-gray-200 bg-white p-4 shadow-lg"
                  style={{
                    left: Math.min(
                      pendingSelection.popoverLeft,
                      Math.max(
                        0,
                        (pageContainerRef.current?.clientWidth || 0) - 290
                      )
                    ),
                    top: pendingSelection.popoverTop,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
                    Highlight selected
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-600">
                    “{pendingSelection.text}”
                  </p>

                  <form onSubmit={submitHighlight} className="mt-3 space-y-2">
                    <textarea
                      autoFocus
                      className="textarea-field min-h-20 text-sm"
                      placeholder="Comment on this passage..."
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      required
                    />

                    {error && <p className="text-xs text-red-600">{error}</p>}

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={submitting || !commentDraft.trim()}
                        className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                      >
                        {submitting ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Passage Comments
            </h3>
            <p className="mt-1 text-xs text-gray-600">
              {highlights.length} comment{highlights.length === 1 ? "" : "s"} on
              this version
            </p>
          </div>

          <div className="max-h-[600px] divide-y divide-gray-100 overflow-y-auto">
            {highlights.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">
                No passage comments yet.
              </p>
            ) : (
              highlights
                .slice()
                .sort((a, b) => {
                  if (a.page_number !== b.page_number) {
                    return a.page_number - b.page_number;
                  }
                  return (
                    new Date(a.created_at).getTime() -
                    new Date(b.created_at).getTime()
                  );
                })
                .map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => jumpToHighlight(h)}
                    className={`block w-full px-4 py-3 text-left transition-colors ${
                      activeHighlightId === h.id
                        ? "bg-yellow-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-teal-800">
                          {h.reviewer_name} · Page {h.page_number}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs italic text-gray-500">
                          “{h.selected_text}”
                        </p>
                        <p className="mt-2 whitespace-pre-line text-sm text-gray-800">
                          {h.comment}
                        </p>
                      </div>

                      {h.reviewer_id === currentUserId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteHighlight(h.id);
                          }}
                          className="text-xs font-medium text-red-600 hover:text-red-800"
                          title="Delete this highlight"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-gray-400">
                      {new Date(h.created_at).toLocaleString()}
                    </p>
                  </button>
                ))
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
