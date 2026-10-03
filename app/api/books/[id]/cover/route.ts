import { NextResponse } from "next/server";
import { isSignedIn } from "@/lib/auth";
import { isBookId } from "@/lib/book";
import { saveStoredCover } from "@/lib/library-store";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  if (!(await isSignedIn())) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await context.params;
  if (!isBookId(id)) {
    return NextResponse.json({ error: "Unknown book." }, { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as { coverUrl?: unknown } | null;
  const coverUrl = body && typeof body.coverUrl === "string" ? body.coverUrl : "";
  const book = await saveStoredCover(id, coverUrl);
  if (!book) return NextResponse.json({ error: "That cover could not be saved." }, { status: 400 });
  return NextResponse.json({ book });
}
