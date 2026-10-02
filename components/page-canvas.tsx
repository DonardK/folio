"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

const MAX_PIXELS = 12_000_000;

type PageCanvasProps = {
  doc: PDFDocumentProxy;
  pageNumber: number;
  cssWidth: number;
  cssHeight: number;
};

export default function PageCanvas({
  doc,
  pageNumber,
  cssWidth,
  cssHeight,
}: PageCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState("");
  const attempt = `${pageNumber}:${cssWidth}x${cssHeight}`;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || cssWidth < 2 || cssHeight < 2) return;

    let cancelled = false;
    let task: RenderTask | null = null;

    (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const base = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const fittedScale = cssWidth / base.width;
        let outputScale = fittedScale * dpr;
        let pixelWidth = cssWidth * dpr;
        let pixelHeight = cssHeight * dpr;
        if (pixelWidth * pixelHeight > MAX_PIXELS) {
          const shrink = Math.sqrt(MAX_PIXELS / (pixelWidth * pixelHeight));
          outputScale *= shrink;
          pixelWidth *= shrink;
          pixelHeight *= shrink;
        }

        const viewport = page.getViewport({ scale: outputScale });
        const buffer = document.createElement("canvas");
        buffer.width = Math.max(1, Math.ceil(viewport.width));
        buffer.height = Math.max(1, Math.ceil(viewport.height));
        task = page.render({ canvas: buffer, viewport });
        await task.promise;
        if (cancelled) return;

        const canvas = document.createElement("canvas");
        canvas.width = buffer.width;
        canvas.height = buffer.height;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not draw this page.");
        context.drawImage(buffer, 0, 0);
        if (cancelled) return;
        host.replaceChildren(canvas);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof Error && error.name === "RenderingCancelledException") return;
        setFailure(attempt);
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [attempt, cssHeight, cssWidth, doc, pageNumber]);

  return (
    <div className="page-sheet" style={{ width: cssWidth, height: cssHeight }}>
      <div ref={hostRef} className="page-bitmap" />
      {failure === attempt ? <p className="page-error">This page could not be drawn.</p> : null}
    </div>
  );
}
