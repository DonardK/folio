import { del, get, head, list, put } from "@vercel/blob";
import {
  compareFileNames,
  COVER_VERSION,
  isBookId,
  metaPathname,
  pdfPathname,
  type BookRecord,
} from "@/lib/book";

const COVER_LIMIT = 400_000;

function isBookRecord(value: unknown): value is BookRecord {
  if (!value || typeof value !== "object") return false;
  const book = value as Partial<BookRecord>;
  return (
    typeof book.id === "string" &&
    isBookId(book.id) &&
    typeof book.title === "string" &&
    typeof book.fileName === "string" &&
    typeof book.pathname === "string" &&
    typeof book.pageCount === "number" &&
    typeof book.lastPage === "number"
  );
}

async function readMeta(id: string): Promise<BookRecord | null> {
  const result = await get(metaPathname(id), { access: "private" });
  if (!result || result.statusCode !== 200) return null;
  const text = await new Response(result.stream).text();
  const parsed: unknown = JSON.parse(text);
  return isBookRecord(parsed) ? parsed : null;
}

export async function listStoredBooks(): Promise<BookRecord[]> {
  const books: BookRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "meta/", cursor, limit: 200 });
    const records = await Promise.all(
      page.blobs.map(async (blob) => {
        const result = await get(blob.url, { access: "private" });
        if (!result || result.statusCode !== 200) return null;
        try {
          const parsed: unknown = JSON.parse(await new Response(result.stream).text());
          return isBookRecord(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }),
    );
    for (const record of records) {
      if (record) books.push(record);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return books.toSorted(
    (a, b) => compareFileNames(a.fileName, b.fileName) || a.addedAt - b.addedAt,
  );
}

export async function getStoredBook(id: string): Promise<BookRecord | null> {
  if (!isBookId(id)) return null;
  return readMeta(id);
}

export type NewBookInput = {
  id: string;
  title: string;
  fileName: string;
  size: number;
  pageCount: number;
  coverUrl: string | null;
};

export function parseNewBook(value: unknown): NewBookInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<NewBookInput>;
  if (typeof input.id !== "string" || !isBookId(input.id)) return null;
  if (typeof input.title !== "string" || input.title.length < 1 || input.title.length > 300) return null;
  if (typeof input.fileName !== "string" || input.fileName.length < 1 || input.fileName.length > 300) {
    return null;
  }
  if (typeof input.size !== "number" || input.size < 1 || input.size > 1024 * 1024 * 1024) return null;
  if (typeof input.pageCount !== "number" || input.pageCount < 1 || input.pageCount > 5000) return null;
  if (input.coverUrl != null) {
    if (typeof input.coverUrl !== "string" || !input.coverUrl.startsWith("data:image/jpeg;base64,")) {
      return null;
    }
    if (input.coverUrl.length > COVER_LIMIT) return null;
  }
  return {
    id: input.id,
    title: input.title,
    fileName: input.fileName,
    size: input.size,
    pageCount: Math.trunc(input.pageCount),
    coverUrl: input.coverUrl ?? null,
  };
}

export async function saveStoredBook(input: NewBookInput): Promise<BookRecord> {
  const pathname = pdfPathname(input.id);
  await head(pathname);
  const book: BookRecord = {
    ...input,
    addedAt: Date.now(),
    lastOpenedAt: 0,
    lastPage: 1,
    pathname,
    coverVersion: COVER_VERSION,
  };
  await put(metaPathname(input.id), JSON.stringify(book), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
  });
  return book;
}

export async function saveStoredProgress(id: string, lastPage: number): Promise<BookRecord | null> {
  const book = await readMeta(id);
  if (!book) return null;
  const page = Math.min(book.pageCount, Math.max(1, Math.trunc(lastPage)));
  const next: BookRecord = { ...book, lastPage: page, lastOpenedAt: Date.now() };
  await put(metaPathname(id), JSON.stringify(next), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
  });
  return next;
}

export async function saveStoredCover(id: string, coverUrl: string): Promise<BookRecord | null> {
  if (!coverUrl.startsWith("data:image/jpeg;base64,") || coverUrl.length > COVER_LIMIT) return null;
  const book = await readMeta(id);
  if (!book) return null;
  const next: BookRecord = { ...book, coverUrl, coverVersion: COVER_VERSION };
  await put(metaPathname(id), JSON.stringify(next), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
  });
  return next;
}

export async function deleteStoredBook(id: string): Promise<void> {
  if (!isBookId(id)) return;
  await Promise.all([
    del(pdfPathname(id)).catch(() => undefined),
    del(metaPathname(id)).catch(() => undefined),
  ]);
}
