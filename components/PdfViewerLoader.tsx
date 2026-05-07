"use client";

import dynamic from "next/dynamic";

const InlinePdfViewer = dynamic(() => import("./InlinePdfViewer"), {
  ssr: false,
  loading: () => (
    <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <h2 className="text-2xl font-bold text-gray-900">PDF Viewer</h2>
      <p className="muted-copy mt-1 text-sm">Loading viewer...</p>
    </section>
  ),
});

export default InlinePdfViewer;
