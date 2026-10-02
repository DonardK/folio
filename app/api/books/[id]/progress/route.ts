import { NextResponse } from "next/server";
import { isSignedIn } from "@/lib/auth";
import { isBookId } from "@/lib/book";
import { saveStoredProgress } from "@/lib/library-store";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  if (!(await isSignedIn())) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await context.params;
  if (!isBookId(id)) {
    return NextResponse.json({ error: "Unknown book." }, { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as { lastPage?: unknown } | null;
  const lastPage = body && typeof body.lastPage === "number" ? body.lastPage : NaN;
  if (!Number.isFinite(lastPage)) {
    return NextResponse.json({ error: "Missing page." }, { status: 400 });
  }
  const book = await saveStoredProgress(id, lastPage);
  if (!book) return NextResponse.json({ error: "That book is not on the shelf." }, { status: 404 });
  return NextResponse.json({ book });
}
