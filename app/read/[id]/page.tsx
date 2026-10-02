import type { Metadata } from "next";
import ReaderRoot from "@/components/reader-root";

export const metadata: Metadata = {
  title: "Reading · Folio",
};

export default async function ReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReaderRoot bookId={id} />;
}
