"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import CoverArt from "@/components/cover-art";
import { COVER_VERSION, type BookRecord } from "@/lib/book";
import {
  createBook,
  fetchBooks,
  removeBook,
  titleFromFileName,
  uploadBookFile,
} from "@/lib/library-client";
import { openPdf, pdfErrorMessage, renderCover, warmPdf } from "@/lib/pdf";

type Notice = { tone: "ok" | "warn"; text: string };

export default function Shelf() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState<{
    done: number;
    total: number;
    name: string;
    percent: number;
  } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function refresh() {
    const nextBooks = await fetchBooks();
    setBooks(nextBooks);
    setReady(true);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nextBooks = await fetchBooks();
        if (cancelled) return;
        setBooks(nextBooks);
      } catch (error) {
        if (!cancelled) {
          setNotice({
            tone: "warn",
            text: error instanceof Error ? error.message : "The shelf could not be opened.",
          });
        }
      } finally {
        if (!cancelled) setReady(true);
      }
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

  const rememberCover = useCallback((id: string, coverUrl: string) => {
    setBooks((current) =>
      current.map((book) =>
        book.id === id ? { ...book, coverUrl, coverVersion: COVER_VERSION } : book,
      ),
    );
  }, []);

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
    const problems: string[] = [];

    setNotice(null);
    for (let index = 0; index < pdfs.length; index += 1) {
      const file = pdfs[index];
      setPending({ done: index, total: pdfs.length, name: file.name, percent: 0 });
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
          await uploadBookFile(id, file, (percent) => {
            setPending({ done: index, total: pdfs.length, name: file.name, percent });
          });
          await createBook({
            id,
            title: titleFromFileName(file.name),
            fileName: file.name,
            size: file.size,
            pageCount,
            coverUrl,
          });
          existing.add(key);
          added += 1;
        } finally {
          await doc.loadingTask.destroy();
        }
      } catch (error) {
        problems.push(`${file.name}: ${pdfErrorMessage(error)}`);
      }
    }

    setPending(null);
    await refresh();

    const parts: string[] = [];
    if (added > 0) {
      parts.push(added === 1 ? "Added 1 book." : `Added ${added} books.`);
    }
    if (skipped > 0) {
      parts.push(
        `Skipped ${skipped} file${skipped === 1 ? "" : "s"} that ${skipped === 1 ? "was" : "were"} not a PDF.`,
      );
    }
    parts.push(...problems);
    if (parts.length > 0) {
      setNotice({
        tone: problems.length > 0 || skipped > 0 ? "warn" : "ok",
        text: parts.join(" "),
      });
    }
  }

  async function remove(id: string) {
    await removeBook(id);
    setConfirmId(null);
    await refresh();
  }

  async function signOut() {
    await fetch("/api/logout", { method: "POST" });
    router.refresh();
  }

  const continueBook = books.reduce<BookRecord | null>((latest, book) => {
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
            Books are saved on this site. Open this link anywhere, sign in, and continue where you left off.
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
          <button type="button" className="remove" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      {pending ? (
        <p className="banner" role="status">
          Adding {pending.done + 1} of {pending.total}
          {pending.percent > 0 ? ` · ${pending.percent}%` : ""}: {pending.name}
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
          <span>Where you left off</span>
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
                  <CoverArt
                    bookId={book.id}
                    title={book.title}
                    coverUrl={book.coverUrl}
                    coverVersion={book.coverVersion}
                    onReady={rememberCover}
                  />
                </span>
                <span className="book-title">{book.title}</span>
                <span className="book-meta">
                  {book.pageCount} {book.pageCount === 1 ? "page" : "pages"}
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
