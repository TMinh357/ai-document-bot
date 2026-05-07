import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const src = "node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
const dest = "public/pdf.worker.min.mjs";

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);

console.log(`pdfjs worker copied: ${src} -> ${dest}`);
