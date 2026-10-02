export type StorageKind = "device" | "visit";

export type BookMeta = {
  id: string;
  title: string;
  fileName: string;
  size: number;
  addedAt: number;
  lastOpenedAt: number;
  pageCount: number;
  lastPage: number;
  coverUrl: string | null;
  storage: StorageKind;
};

type FileRecord = {
  id: string;
  data: Blob;
};

const DB_NAME = "folio";
const DB_VERSION = 1;

const sessionBooks = new Map<string, { meta: BookMeta; data: Blob }>();

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("The save was aborted."));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("books")) {
        db.createObjectStore("books", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function compareFileNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function titleFromFileName(fileName: string): string {
  const stripped = fileName.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
  return stripped || "Untitled";
}

export function sortBooks(books: BookMeta[]): BookMeta[] {
  return books.toSorted((a, b) => compareFileNames(a.fileName, b.fileName) || a.addedAt - b.addedAt);
}

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false;
  return (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error.code === 22
  );
}

export async function listBooks(): Promise<BookMeta[]> {
  const db = await openDb();
  const transaction = db.transaction("books", "readonly");
  const stored = await requestToPromise(
    transaction.objectStore("books").getAll() as IDBRequest<BookMeta[]>,
  );
  await transactionDone(transaction);
  const byId = new Map<string, BookMeta>();
  for (const book of stored) byId.set(book.id, book);
  for (const entry of sessionBooks.values()) byId.set(entry.meta.id, entry.meta);
  return sortBooks([...byId.values()]);
}

export async function getBook(id: string): Promise<BookMeta | null> {
  const visiting = sessionBooks.get(id);
  if (visiting) return visiting.meta;
  const db = await openDb();
  const transaction = db.transaction("books", "readonly");
  const book = await requestToPromise(
    transaction.objectStore("books").get(id) as IDBRequest<BookMeta | undefined>,
  );
  await transactionDone(transaction);
  return book ?? null;
}

export async function getBookFile(id: string): Promise<Blob | null> {
  const visiting = sessionBooks.get(id);
  if (visiting) return visiting.data;
  const db = await openDb();
  const transaction = db.transaction("files", "readonly");
  const record = await requestToPromise(
    transaction.objectStore("files").get(id) as IDBRequest<FileRecord | undefined>,
  );
  await transactionDone(transaction);
  return record?.data ?? null;
}

export async function saveBook(
  meta: BookMeta,
  data: Blob,
): Promise<StorageKind> {
  const db = await openDb();
  try {
    const transaction = db.transaction(["books", "files"], "readwrite");
    transaction.objectStore("books").put(meta);
    transaction.objectStore("files").put({ id: meta.id, data } satisfies FileRecord);
    await transactionDone(transaction);
    return "device";
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    const visitMeta: BookMeta = { ...meta, storage: "visit" };
    sessionBooks.set(meta.id, { meta: visitMeta, data });
    return "visit";
  }
}

export async function saveProgress(id: string, lastPage: number): Promise<void> {
  const visiting = sessionBooks.get(id);
  if (visiting) {
    visiting.meta = {
      ...visiting.meta,
      lastPage,
      lastOpenedAt: Date.now(),
    };
    sessionBooks.set(id, visiting);
    return;
  }

  const db = await openDb();
  const transaction = db.transaction("books", "readwrite");
  const store = transaction.objectStore("books");
  const request = store.get(id) as IDBRequest<BookMeta | undefined>;
  request.onsuccess = () => {
    const book = request.result;
    if (!book) return;
    book.lastPage = lastPage;
    book.lastOpenedAt = Date.now();
    store.put(book);
  };
  await transactionDone(transaction);
}

export async function deleteBook(id: string): Promise<void> {
  sessionBooks.delete(id);
  const db = await openDb();
  const transaction = db.transaction(["books", "files"], "readwrite");
  transaction.objectStore("books").delete(id);
  transaction.objectStore("files").delete(id);
  await transactionDone(transaction);
}

export async function storageEstimate(): Promise<{
  usage: number;
  quota: number;
} | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const estimate = await navigator.storage.estimate();
    if (estimate.usage == null || estimate.quota == null) return null;
    return { usage: estimate.usage, quota: estimate.quota };
  } catch {
    return null;
  }
}

export async function askToKeepStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* The browser decides. Reading still works either way. */
  }
}
