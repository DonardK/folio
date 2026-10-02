import type { ViewMode } from "@/lib/spreads";

export type FitMode = "page" | "width";

export type ReaderSettings = {
  viewMode: ViewMode;
  fit: FitMode;
};

const SETTINGS_KEY = "folio.settings.v1";
const HINT_KEY = "folio.hint.v1";
const OPEN_AT_KEY = "folio.openAt";

const DEFAULTS: ReaderSettings = {
  viewMode: "single",
  fit: "page",
};

export function readSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<ReaderSettings>;
    return {
      viewMode: parsed.viewMode === "spread" ? "spread" : "single",
      fit: parsed.fit === "width" ? "width" : "page",
    };
  } catch {
    return DEFAULTS;
  }
}

export function writeSettings(settings: ReaderSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function hasSeenHint(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return true;
  }
}

export function markHintSeen() {
  localStorage.setItem(HINT_KEY, "1");
}

/** Where to open the next book. `null` means resume the saved page. */
export function setOpenAt(page: number) {
  sessionStorage.setItem(OPEN_AT_KEY, String(page));
}

export function consumeOpenAt(): number | null {
  try {
    const raw = sessionStorage.getItem(OPEN_AT_KEY);
    sessionStorage.removeItem(OPEN_AT_KEY);
    if (!raw) return null;
    const page = Number(raw);
    return Number.isFinite(page) ? page : null;
  } catch {
    return null;
  }
}
