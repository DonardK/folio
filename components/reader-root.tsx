"use client";

import dynamic from "next/dynamic";

const Reader = dynamic(() => import("@/components/reader"), {
  ssr: false,
  loading: () => (
    <main className="reader">
      <p className="stage-message">Opening</p>
    </main>
  ),
});

export default function ReaderRoot({ bookId }: { bookId: string }) {
  return <Reader bookId={bookId} />;
}
