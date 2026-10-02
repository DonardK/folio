import type { Metadata } from "next";
import Login from "@/components/login";
import ReaderRoot from "@/components/reader-root";
import { isSignedIn } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Reading · Folio",
};

export default async function ReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await isSignedIn())) return <Login />;
  return <ReaderRoot bookId={id} />;
}
