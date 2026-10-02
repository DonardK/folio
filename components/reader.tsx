"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import PageCanvas from "@/components/page-canvas";
import {
  getBook,
  getBookFile,
  listBooks,
  saveProgress,
  type BookMeta,
} from "@/lib/books";
import { openPdf, pdfErrorMessage, warmPdf } from "@/lib/pdf";
import {
  consumeOpenAt,
  hasSeenHint,
  markHintSeen,
  readSettings,
  setOpenAt,
  writeSettings,
  type FitMode,
} from "@/lib/settings";
import {
  nextAnchor,
  pagesForAnchor,
  previousAnchor,
  spreadLabel,
  type ViewMode,
} from "@/lib/spreads";

type LoadState =
  | { status: "loading"; title: string }
  | { status: "error"; message: string }
  | {
      status: "ready";
      book: BookMeta;
      doc: PDFDocumentProxy;
      library: BookMeta[];
    };

type StageSize = { width: number; height: number };

export default function Reader({ bookId }: { bookId: string }) {
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement>(null);
  const actions = useRef({ next: () => {}, previous: () => {} });
  const [load, setLoad] = useState<LoadState>({ status: "loading", title: "Opening" });
  const [anchor, setAnchor] = useState(1);
  const [scrub, setScrub] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => readSettings().viewMode);
  const [fit, setFit] = useState<FitMode>(() => readSettings().fit);
  const [chrome, setChrome] = useState(true);
  const [hint, setHint] = useState(() => !hasSeenHint());
  const [stage, setStage] = useState<StageSize>({ width: 0, height: 0 });
  const [seenBookId, setSeenBookId] = useState(bookId);

  if (seenBookId !== bookId) {
    setSeenBookId(bookId);
    setLoad({ status: "loading", title: "Opening" });
    setScrub(null);
    setAnchor(1);
  }

  useEffect(() => {
    warmPdf();
  }, []);

  useEffect(() => {
    writeSettings({ viewMode, fit });
  }, [fit, viewMode]);

  useEffect(() => {
    let cancelled = false;
    let active: PDFDocumentProxy | null = null;

    (async () => {
      try {
        const book = await getBook(bookId);
        if (cancelled) return;
        if (!book) {
          setLoad({
            status: "error",
            message: "That book is not on this device.",
          });
          return;
        }
        setLoad({ status: "loading", title: book.title });
        document.title = `${book.title} · Folio`;

        const file = await getBookFile(bookId);
        if (cancelled) return;
        if (!file) {
          setLoad({
            status: "error",
            message: "The file for this book is missing. Add it again from the shelf.",
          });
          return;
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        if (cancelled) return;
        const doc = await openPdf(bytes);
        if (cancelled) {
          await doc.loadingTask.destroy();
          return;
        }
        active = doc;
        const library = await listBooks();
        if (cancelled) return;

        const requested = consumeOpenAt();
        const initial = requested == null ? book.lastPage || 1 : requested;
        const page = Math.min(doc.numPages, Math.max(1, Math.trunc(initial)));
        setAnchor(page);
        setLoad({ status: "ready", book, doc, library });
        void saveProgress(bookId, page);
      } catch (error) {
        if (cancelled) return;
        setLoad({ status: "error", message: pdfErrorMessage(error) });
      }
    })();

    return () => {
      cancelled = true;
      void active?.loadingTask.destroy();
      document.title = "Folio";
    };
  }, [bookId]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const styles = getComputedStyle(element);
        const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
        const padY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
        const width = Math.round(element.clientWidth - padX);
        const height = Math.round(element.clientHeight - padY);
        setStage((current) =>
          current.width === width && current.height === height ? current : { width, height },
        );
      });
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [load.status]);

  const ready = load.status === "ready" ? load : null;
  const pageCount = ready?.doc.numPages ?? 0;
  const renderPages =
    ready && pageCount > 0 ? pagesForAnchor(anchor, pageCount, viewMode) : [];
  const labelPages =
    ready && pageCount > 0
      ? pagesForAnchor(scrub ?? anchor, pageCount, viewMode)
      : [];

  const bookIndex = ready
    ? ready.library.findIndex((book) => book.id === ready.book.id)
    : -1;
  const previousBook = bookIndex > 0 ? ready?.library[bookIndex - 1] ?? null : null;
  const nextBook =
    ready && bookIndex >= 0 && bookIndex < ready.library.length - 1
      ? ready.library[bookIndex + 1]
      : null;

  const dismissHint = useCallback(() => {
    setHint(false);
    markHintSeen();
  }, []);

  const goNext = useCallback(() => {
    if (!ready) return;
    const upcoming = nextAnchor(anchor, ready.doc.numPages, viewMode);
    if (upcoming != null) {
      setAnchor(upcoming);
      setScrub(null);
      void saveProgress(ready.book.id, upcoming);
      dismissHint();
      return;
    }
    if (nextBook) {
      setOpenAt(1);
      router.push(`/read/${nextBook.id}`);
    }
  }, [anchor, dismissHint, nextBook, ready, router, viewMode]);

  const goPrevious = useCallback(() => {
    if (!ready) return;
    const upcoming = previousAnchor(anchor, ready.doc.numPages, viewMode);
    if (upcoming != null) {
      setAnchor(upcoming);
      setScrub(null);
      void saveProgress(ready.book.id, upcoming);
      dismissHint();
      return;
    }
    if (previousBook) {
      setOpenAt(Number.MAX_SAFE_INTEGER);
      router.push(`/read/${previousBook.id}`);
    }
  }, [anchor, dismissHint, previousBook, ready, router, viewMode]);

  useEffect(() => {
    actions.current.next = goNext;
    actions.current.previous = goPrevious;
  }, [goNext, goPrevious]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        actions.current.next();
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        actions.current.previous();
      } else if (event.key === "v") {
        setViewMode((current) => (current === "single" ? "spread" : "single"));
      } else if (event.key === "f") {
        setFit((current) => (current === "page" ? "width" : "page"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function commitScrub(value: number) {
    if (!ready) return;
    const page = pagesForAnchor(value, ready.doc.numPages, viewMode)[0] ?? value;
    setScrub(null);
    setAnchor(page);
    void saveProgress(ready.book.id, page);
    dismissHint();
  }

  function changeView(mode: ViewMode) {
    setViewMode(mode);
    setScrub(null);
  }

  function changeFit(next: FitMode) {
    setFit(next);
  }

  const gesture = useRef<{ x: number; y: number; id: number } | null>(null);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    gesture.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (!start || start.id !== event.pointerId || !ready) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const ratio = (event.clientX - bounds.left) / bounds.width;
      if (ratio < 0.28) actions.current.previous();
      else if (ratio > 0.72) actions.current.next();
      else setChrome((current) => !current);
      return;
    }
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) actions.current.next();
      else actions.current.previous();
    }
  }

  const layouts = usePageLayout(ready?.doc ?? null, renderPages, stage, fit);
  const atStart = renderPages[0] === 1;
  const atEnd = renderPages.length > 0 && renderPages[renderPages.length - 1] === pageCount;
  const label = spreadLabel(labelPages, pageCount);

  return (
    <main className="reader">
      <div
        ref={stageRef}
        className={`stage${fit === "width" ? " is-width" : ""}${hint ? " has-hint" : ""}`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          gesture.current = null;
        }}
      >
        {load.status === "loading" ? (
          <p className="stage-message">{load.title}</p>
        ) : null}
        {load.status === "error" ? (
          <div className="stage-message">
            <p>{load.message}</p>
            <Link href="/" className="text-link">
              Back to shelf
            </Link>
          </div>
        ) : null}
        {ready && layouts ? (
          <div className="sheet-row">
            {layouts.map((layout) => (
              <PageCanvas
                key={layout.page}
                doc={ready.doc}
                pageNumber={layout.page}
                cssWidth={layout.cssWidth}
                cssHeight={layout.cssHeight}
              />
            ))}
          </div>
        ) : null}
      </div>

      <header className={chrome ? "chrome chrome-top" : "chrome chrome-top is-hidden"}>
        <Link href="/" className="chrome-back">
          Shelf
        </Link>
        <p className="chrome-title">
          {ready?.book.title ?? (load.status === "loading" ? load.title : "Folio")}
        </p>
        <p className="chrome-pages">{label}</p>
      </header>

      <footer className={chrome ? "chrome chrome-bottom" : "chrome chrome-bottom is-hidden"}>
        {hint ? (
          <p className="hint">
            The cover stays on one page. Two-page view starts after it. Tap the middle to hide this bar.
          </p>
        ) : null}
        <label className="scrub">
          <span className="sr-only">Page</span>
          <input
            type="range"
            min={1}
            max={Math.max(pageCount, 1)}
            step={1}
            disabled={!ready}
            value={Math.min(scrub ?? anchor, Math.max(pageCount, 1))}
            aria-valuetext={label}
            onInput={(event) => setScrub(Number(event.currentTarget.value))}
            onPointerUp={(event) => commitScrub(Number(event.currentTarget.value))}
            onKeyUp={(event) => commitScrub(Number(event.currentTarget.value))}
            onBlur={(event) => commitScrub(Number(event.currentTarget.value))}
          />
        </label>
        <div className="chrome-controls">
          <button
            type="button"
            className="nav-button"
            onClick={goPrevious}
            disabled={!ready || (atStart && !previousBook)}
          >
            {atStart && previousBook ? "Previous book" : "Previous"}
          </button>
          <div className="segment" role="group" aria-label="Page view">
            <button
              type="button"
              aria-pressed={viewMode === "single"}
              onClick={() => changeView("single")}
            >
              1 page
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "spread"}
              title="The cover stays alone. Following pages open as a pair."
              onClick={() => changeView("spread")}
            >
              2 pages
            </button>
          </div>
          <div className="segment" role="group" aria-label="Page fit">
            <button type="button" aria-pressed={fit === "page"} onClick={() => changeFit("page")}>
              Whole
            </button>
            <button type="button" aria-pressed={fit === "width"} onClick={() => changeFit("width")}>
              Width
            </button>
          </div>
          <button
            type="button"
            className="nav-button"
            onClick={goNext}
            disabled={!ready || (atEnd && !nextBook)}
          >
            {atEnd && nextBook ? "Next book" : "Next"}
          </button>
        </div>
      </footer>
      <div
        className="read-progress"
        style={{ transform: `scaleX(${pageCount > 0 ? (scrub ?? anchor) / pageCount : 0})` }}
      />
    </main>
  );
}

type PageLayout = { page: number; cssWidth: number; cssHeight: number };
type PageBox = { page: number; width: number; height: number };

const pageSizeCache = new WeakMap<PDFDocumentProxy, Map<number, { width: number; height: number }>>();

function boxesFor(doc: PDFDocumentProxy, pages: number[]): PageBox[] | null {
  const map = pageSizeCache.get(doc);
  if (!map) return null;
  const boxes: PageBox[] = [];
  for (const page of pages) {
    const size = map.get(page);
    if (!size) return null;
    boxes.push({ page, width: size.width, height: size.height });
  }
  return boxes;
}

function usePageLayout(
  doc: PDFDocumentProxy | null,
  pages: number[],
  stage: StageSize,
  fit: FitMode,
): PageLayout[] | null {
  const pageKey = pages.join(",");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!doc || pages.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const map = pageSizeCache.get(doc) ?? new Map<number, { width: number; height: number }>();
        pageSizeCache.set(doc, map);
        let added = false;
        for (const page of pages) {
          if (map.has(page)) continue;
          const proxy = await doc.getPage(page);
          if (cancelled) return;
          const viewport = proxy.getViewport({ scale: 1 });
          map.set(page, { width: viewport.width, height: viewport.height });
          added = true;
        }
        if (!cancelled && added) setTick((current) => current + 1);
      } catch {
        if (!cancelled) setTick((current) => current + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
    // pageKey is the page list. tick is only a refresh signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pageKey]);

  const boxes = doc && tick >= 0 ? boxesFor(doc, pages) : null;
  if (!doc || !boxes || stage.width < 8 || stage.height < 8) return null;

  const gap = pages.length > 1 ? 16 : 0;
  const innerWidth = Math.max(1, stage.width - 8);
  const innerHeight = Math.max(1, stage.height - 8);
  const sumWidth = boxes.reduce((sum, box) => sum + box.width, 0);
  const maxHeight = boxes.reduce((max, box) => Math.max(max, box.height), 1);
  const scaleWidth = (innerWidth - gap) / sumWidth;
  const scaleHeight = innerHeight / maxHeight;
  const scale = fit === "width" ? scaleWidth : Math.min(scaleWidth, scaleHeight);

  return boxes.map((box) => ({
    page: box.page,
    cssWidth: Math.max(1, Math.round(box.width * scale)),
    cssHeight: Math.max(1, Math.round(box.height * scale)),
  }));
}
