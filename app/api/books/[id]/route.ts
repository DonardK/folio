import { NextResponse } from "next/server";
import { isSignedIn } from "@/lib/auth";
import { isBookId } from "@/lib/book";
import { deleteStoredBook, getStoredBook } from "@/lib/library-store";

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
  return NextResponse.json({ book });
}

export async function DELETE(_request: Request, context: Context) {
  if (!(await isSignedIn())) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await context.params;
  if (!isBookId(id)) {
    return NextResponse.json({ error: "Unknown book." }, { status: 404 });
  }
  await deleteStoredBook(id);
  return NextResponse.json({ ok: true });
}
