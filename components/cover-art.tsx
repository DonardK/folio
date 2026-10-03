"use client";

import { useEffect, useRef, useState } from "react";
import { COVER_VERSION } from "@/lib/book";
import { fetchBookUrl, saveCover } from "@/lib/library-client";
import { renderCoverFromUrl } from "@/lib/pdf";

const queue: Array<() => Promise<void>> = [];
let running = 0;

function enqueue(job: () => Promise<void>) {
  queue.push(job);
  void drain();
}

async function drain() {
  if (running >= 2) return;
  const job = queue.shift();
  if (!job) return;
  running += 1;
  try {
    await job();
  } finally {
    running -= 1;
    void drain();
  }
}

export default function CoverArt({
  bookId,
  title,
  coverUrl,
  coverVersion,
  onReady,
}: {
  bookId: string;
  title: string;
  coverUrl: string | null;
  coverVersion?: number;
  onReady: (bookId: string, coverUrl: string) => void;
}) {
  const ready = coverVersion === COVER_VERSION && Boolean(coverUrl);
  const [src, setSrc] = useState(ready ? coverUrl : null);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    if (coverVersion === COVER_VERSION && coverUrl) return;
    let cancelled = false;
    enqueue(async () => {
      if (cancelled) return;
      try {
        const fileUrl = await fetchBookUrl(bookId);
        if (cancelled) return;
        const next = await renderCoverFromUrl(fileUrl);
        if (cancelled || !next) return;
        await saveCover(bookId, next);
        if (!cancelled) {
          setSrc(next);
          onReadyRef.current(bookId, next);
        }
      } catch {
        /* The frame stays empty and can try again on the next visit. */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bookId, coverUrl, coverVersion]);

  if (!src) {
    return <span className="cover-fallback">{title.slice(0, 1)}</span>;
  }

  return (
    // Stored covers are local image data, not remote optimizer URLs.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" />
  );
}
