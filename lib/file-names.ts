// Storage object keys must stay within a restricted character set, but simply
// stripping everything non-ASCII mangles Vietnamese filenames — "Bản sao của
// TĐ.pdf" became "B_n_sao_c_a_T_.pdf", losing the words themselves. Decompose
// accents and drop the combining marks first, so the name stays readable.

// Combining diacritical marks (U+0300–U+036F), left behind by NFD normalization.
const COMBINING_MARKS = /[̀-ͯ]/g;

export function safeFileName(name: string): string {
  const cleaned = name
    // Split accented characters into base letter + combining mark…
    .normalize("NFD")
    // …then remove the marks, so "ả" becomes "a" rather than "_".
    .replace(COMBINING_MARKS, "")
    // Đ/đ carry a stroke rather than a combining accent, so NFD leaves them.
    .replace(/Đ/g, "D")
    .replace(/đ/g, "d")
    // Collapse anything still outside the safe set, avoiding runs of "_".
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  // A name written entirely in a non-Latin script reduces to just its
  // extension, which would leave the object effectively unnamed.
  const withoutExtension = cleaned.replace(/\.[a-zA-Z0-9]+$/, "");
  if (!withoutExtension) {
    const extension = cleaned.startsWith(".") ? cleaned : "";
    return `file${extension}`;
  }

  return cleaned;
}

// Storage paths are {userId}/{documentId}/{timestamp}-{filename}; show only the
// filename the user recognises.
export function displayFileName(filePath: string | null | undefined): string {
  if (!filePath) return "No file";

  const lastSegment = filePath.split("/").pop() ?? filePath;
  return lastSegment.replace(/^\d+-/, "");
}
