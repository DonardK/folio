export type BookRecord = {
  id: string;
  title: string;
  fileName: string;
  size: number;
  addedAt: number;
  lastOpenedAt: number;
  pageCount: number;
  lastPage: number;
  coverUrl: string | null;
  pathname: string;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isBookId(value: string): boolean {
  return UUID.test(value);
}

export function pdfPathname(id: string): string {
  return `pdfs/${id}.pdf`;
}

export function metaPathname(id: string): string {
  return `meta/${id}.json`;
}

export function compareFileNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function titleFromFileName(fileName: string): string {
  const stripped = fileName.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
  return stripped || "Untitled";
}
