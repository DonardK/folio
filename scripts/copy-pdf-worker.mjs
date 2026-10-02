import { cp, copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pdfjs = join(root, "node_modules", "pdfjs-dist");
const publicDir = join(root, "public");

await mkdir(publicDir, { recursive: true });
await copyFile(join(pdfjs, "build", "pdf.worker.min.mjs"), join(publicDir, "pdf.worker.min.mjs"));

for (const folder of ["wasm", "cmaps", "standard_fonts"]) {
  await cp(join(pdfjs, folder), join(publicDir, "pdfjs", folder), { recursive: true });
}
