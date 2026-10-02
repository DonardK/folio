export type ViewMode = "single" | "spread";

export function clampPage(page: number, pageCount: number): number {
  if (pageCount < 1) return 1;
  return Math.min(pageCount, Math.max(1, Math.trunc(page)));
}

/** Pages visible together. The cover (page 1) is always alone. */
export function pagesForAnchor(
  anchor: number,
  pageCount: number,
  mode: ViewMode,
): number[] {
  if (pageCount < 1) return [];
  const page = clampPage(anchor, pageCount);
  if (mode === "single" || page === 1) return [page];

  const start = 2 + Math.floor((page - 2) / 2) * 2;
  const pages = [start];
  if (start + 1 <= pageCount) pages.push(start + 1);
  return pages;
}

export function nextAnchor(
  anchor: number,
  pageCount: number,
  mode: ViewMode,
): number | null {
  const pages = pagesForAnchor(anchor, pageCount, mode);
  if (pages.length === 0) return null;
  const last = pages[pages.length - 1];
  if (last >= pageCount) return null;
  return last + 1;
}

export function previousAnchor(
  anchor: number,
  pageCount: number,
  mode: ViewMode,
): number | null {
  const pages = pagesForAnchor(anchor, pageCount, mode);
  if (pages.length === 0 || pages[0] <= 1) return null;
  if (mode === "single" || pages[0] === 2) return pages[0] - 1;
  return pages[0] - 2;
}

export function spreadLabel(pages: number[], pageCount: number): string {
  if (pages.length === 0 || pageCount < 1) return "";
  if (pages[0] === 1 && pages.length === 1) {
    return `Cover · 1 of ${pageCount}`;
  }
  if (pages.length === 1) return `${pages[0]} of ${pageCount}`;
  return `${pages[0]}–${pages[1]} of ${pageCount}`;
}
