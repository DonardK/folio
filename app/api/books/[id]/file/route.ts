import { issueSignedToken, presignUrl } from "@vercel/blob";
import { NextResponse } from "next/server";
import { isSignedIn } from "@/lib/auth";
import { isBookId } from "@/lib/book";
import { getStoredBook } from "@/lib/library-store";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  if (!(await isSignedIn())) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await context.params;
  if (!isBookId(id)) {
    return NextResponse.json({ error: "Unknown book." }, { status: 404 });
  }
  const book = await getStoredBook(id);
  if (!book) return NextResponse.json({ error: "That book is not on the shelf." }, { status: 404 });

  const validUntil = Date.now() + 2 * 60 * 60 * 1000;
  const token = await issueSignedToken({
    pathname: book.pathname,
    operations: ["get"],
    validUntil,
  });
  const { presignedUrl } = await presignUrl(token, {
    operation: "get",
    pathname: book.pathname,
    access: "private",
    validUntil,
  });
  return NextResponse.json({ url: presignedUrl });
}
