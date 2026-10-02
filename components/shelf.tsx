"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  askToKeepStorage,
  deleteBook,
  listBooks,
  saveBook,
  storageEstimate,
  titleFromFileName,
  type BookMeta,
} from "@/lib/books";
import { openPdf, pdfErrorMessage, renderCover, warmPdf } from "@/lib/pdf";

type Notice = { tone: "ok" | "warn"; text: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function Shelf() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [ready, setReady] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState<{ done: number; total: number; name: string } | null>(
    null,
  );
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);

  async function refresh() {
    const [nextBooks, estimate] = await Promise.all([listBooks(), storageEstimate()]);
    setBooks(nextBooks);
    setStorage(estimate);
    setReady(true);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [nextBooks, estimate] = await Promise.all([listBooks(), storageEstimate()]);
      if (cancelled) return;
      setBooks(nextBooks);
      setStorage(estimate);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (books.length === 0) return;
    const id = window.setTimeout(() => warmPdf(), 500);
    return () => window.clearTimeout(id);
  }, [books.length]);

  async function addFiles(fileList: FileList | File[]) {
    const incoming = [...fileList];
    const pdfs = incoming.filter(
      (file) => file.size > 0 && (file.type === "application/pdf" || /\.pdf$/i.test(file.name)),
    );
    const skipped = incoming.length - pdfs.length;
    if (pdfs.length === 0) {
      setNotice({
        tone: "warn",
        text: skipped > 0 ? "Those files are not PDFs." : "Choose a PDF to add.",
      });
      return;
    }

    const existing = new Set(books.map((book) => `${book.fileName}:${book.size}`));
    let added = 0;
    let visits = 0;
    const problems: string[] = [];

    setNotice(null);
    for (let index = 0; index < pdfs.length; index += 1) {
      const file = pdfs[index];
      setPending({ done: index, total: pdfs.length, name: file.name });
      const key = `${file.name}:${file.size}`;
      if (existing.has(key)) {
        problems.push(`${titleFromFileName(file.name)} is already on the shelf.`);
        continue;
      }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const doc = await openPdf(bytes);
        try {
          const pageCount = doc.numPages;
          if (pageCount < 1) throw new Error("This PDF has no pages.");
          const coverUrl = await renderCover(doc);
          const id = crypto.randomUUID();
          const meta: BookMeta = {
            id,
            title: titleFromFileName(file.name),
            fileName: file.name,
            size: file.size,
            addedAt: Date.now(),
            lastOpenedAt: 0,
            pageCount,
            lastPage: 1,
            coverUrl,
            storage: "device",
          };
          const kind = await saveBook(meta, file);
          existing.add(key);
          added += 1;
          if (kind === "visit") visits += 1;
        } finally {
          await doc.loadingTask.destroy();
        }
      } catch (error) {
        problems.push(`${file.name}: ${pdfErrorMessage(error)}`);
      }
    }

    setPending(null);
    await askToKeepStorage();
    await refresh();

    const parts: string[] = [];
    if (added > 0) {
      parts.push(added === 1 ? "Added 1 book." : `Added ${added} books.`);
    }
    if (visits > 0) {
      parts.push(
        visits === 1
          ? "1 book was too large to keep on this device. It stays open until you leave or refresh."
          : `${visits} books were too large to keep. They stay open until you leave or refresh.`,
      );
    }
    if (skipped > 0) parts.push(`Skipped ${skipped} file${skipped === 1 ? "" : "s"} that ${skipped === 1 ? "was" : "were"} not a PDF.`);
    parts.push(...problems);
    if (parts.length > 0) {
      setNotice({ tone: visits > 0 || problems.length > 0 || skipped > 0 ? "warn" : "ok", text: parts.join(" ") });
    }
  }

  async function remove(id: string) {
    await deleteBook(id);
    setConfirmId(null);
    await refresh();
  }

  const continueBook = books.reduce<BookMeta | null>((latest, book) => {
    if (book.lastOpenedAt <= 0) return latest;
    if (!latest || book.lastOpenedAt > latest.lastOpenedAt) return book;
    return latest;
  }, null);

  return (
    <main
      className={dragOver ? "shelf is-drag" : "shelf"}
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepth.current += 1;
        setDragOver(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragOver(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        if (event.dataTransfer.files.length > 0) void addFiles(event.dataTransfer.files);
      }}
    >
      <header className="shelf-head">
        <div>
          <p className="eyebrow">Folio</p>
          <h1>Your shelf</h1>
          <p className="lede">
            Books stay in this browser. They are not uploaded. Add them on your phone to read them there.
            Order follows the file name, so volume 2 stays before volume 10.
          </p>
        </div>
        <div className="shelf-actions">
          <button
            type="button"
            className="primary"
            onClick={() => inputRef.current?.click()}
            disabled={pending != null}
          >
            Add PDFs
          </button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={(event) => {
              const list = event.currentTarget.files;
              if (list && list.length > 0) void addFiles(list);
              event.currentTarget.value = "";
            }}
          />
          {storage ? (
            <p className="storage-note">
              {formatBytes(storage.usage)} used on this device
            </p>
          ) : null}
        </div>
      </header>

      {pending ? (
        <p className="banner" role="status">
          Adding {pending.done + 1} of {pending.total}: {pending.name}
        </p>
      ) : null}
      {notice ? (
        <p className={notice.tone === "warn" ? "banner is-warn" : "banner"} role="status">
          {notice.text}
        </p>
      ) : null}

      {!ready ? <p className="empty-note">Opening your shelf…</p> : null}

      {ready && books.length === 0 ? (
        <button type="button" className="dropwell" onClick={() => inputRef.current?.click()}>
          <span>Drop PDFs here</span>
          <span>or choose files</span>
        </button>
      ) : null}

      {continueBook && books.length > 0 ? (
        <Link href={`/read/${continueBook.id}`} className="continue" onMouseEnter={warmPdf} onFocus={warmPdf}>
          <span>Continue</span>
          <strong>{continueBook.title}</strong>
          <em>
            {continueBook.lastPage > 1 ? `Page ${continueBook.lastPage}` : "Cover"} of {continueBook.pageCount}
          </em>
        </Link>
      ) : null}

      {books.length > 0 ? (
        <ul className="book-grid">
          {books.map((book) => (
            <li key={book.id} className="book-card">
              <Link
                href={`/read/${book.id}`}
                className="book-open"
                onMouseEnter={warmPdf}
                onFocus={warmPdf}
              >
                <span className="cover-frame">
                  {book.coverUrl ? (
                    // Local data URLs cannot be optimized by the image loader.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={book.coverUrl} alt="" />
                  ) : (
                    <span className="cover-fallback">{book.title.slice(0, 1)}</span>
                  )}
                </span>
                <span className="book-title">{book.title}</span>
                <span className="book-meta">
                  {book.pageCount} {book.pageCount === 1 ? "page" : "pages"}
                  {book.storage === "visit" ? " · this visit" : ""}
                </span>
                {book.lastPage > 1 ? (
                  <span className="book-progress" aria-hidden="true">
                    <span style={{ transform: `scaleX(${book.lastPage / book.pageCount})` }} />
                  </span>
                ) : null}
              </Link>
              {confirmId === book.id ? (
                <div className="confirm">
                  <p>Remove this book from the shelf?</p>
                  <button type="button" onClick={() => void remove(book.id)}>
                    Remove
                  </button>
                  <button type="button" onClick={() => setConfirmId(null)}>
                    Keep
                  </button>
                </div>
              ) : (
                <button type="button" className="remove" onClick={() => setConfirmId(book.id)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
