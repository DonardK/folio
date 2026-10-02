import type { PDFDocumentProxy } from "pdfjs-dist";

const MAX_IMAGE_BYTES = 256 * 1024 * 1024;

let workerConfigured = false;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjs.version}`;
    workerConfigured = true;
  }
  return pdfjs;
}

function documentOptions(pdfjs: Awaited<ReturnType<typeof loadPdfjs>>) {
  return {
    verbosity: pdfjs.VerbosityLevel.ERRORS,
    maxImageSize: -1,
    canvasMaxAreaInBytes: MAX_IMAGE_BYTES,
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    wasmUrl: "/pdfjs/wasm/",
    useWasm: true,
  };
}

export function warmPdf(): void {
  void loadPdfjs();
}

export async function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data,
    ...documentOptions(pdfjs),
  });
  return task.promise;
}

export async function openPdfUrl(url: string): Promise<PDFDocumentProxy> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("The book file could not be loaded.");
  }
  const data = new Uint8Array(await response.arrayBuffer());
  return openPdf(data);
}

export async function renderCover(doc: PDFDocumentProxy): Promise<string> {
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = 560 / base.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await page.render({ canvas, viewport }).promise;
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), "image/jpeg", 0.84);
  });
  if (!blob) throw new Error("Could not create a cover.");
  return readAsDataUrl(blob);
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the cover."));
    reader.readAsDataURL(blob);
  });
}

export function pdfErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "PasswordException") {
    return "This PDF is locked with a password.";
  }
  if (name === "InvalidPDFException") {
    return "This file is not a readable PDF.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "This PDF could not be opened.";
}
