import { upload } from "@vercel/blob/client";
import { titleFromFileName, type BookRecord } from "@/lib/book";

export { titleFromFileName };

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || "The request failed.";
  } catch {
    return "The request failed.";
  }
}

export async function fetchBooks(): Promise<BookRecord[]> {
  const response = await fetch("/api/books", { cache: "no-store" });
  if (response.status === 401) throw new Error("Sign in required.");
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { books: BookRecord[] };
  return body.books;
}

export async function fetchBook(id: string): Promise<BookRecord | null> {
  const response = await fetch(`/api/books/${id}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { book: BookRecord };
  return body.book;
}

export async function createBook(input: {
  id: string;
  title: string;
  fileName: string;
  size: number;
  pageCount: number;
  coverUrl: string | null;
}): Promise<void> {
  const response = await fetch("/api/books", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function removeBook(id: string): Promise<void> {
  const response = await fetch(`/api/books/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await readError(response));
}

export async function saveReadingProgress(
  id: string,
  lastPage: number,
  keepalive = false,
): Promise<void> {
  await fetch(`/api/books/${id}/progress`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lastPage }),
    keepalive,
  });
}

export async function fetchBookUrl(id: string): Promise<string> {
  const response = await fetch(`/api/books/${id}/file`, { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { url: string };
  return body.url;
}

export async function uploadBookFile(
  id: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  await upload(`pdfs/${id}.pdf`, file, {
    access: "private",
    handleUploadUrl: "/api/blob/upload",
    contentType: file.type || "application/pdf",
    multipart: file.size > 8 * 1024 * 1024,
    onUploadProgress: ({ percentage }) => onProgress(Math.round(percentage)),
  });
}
