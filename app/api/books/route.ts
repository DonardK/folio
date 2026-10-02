import { NextResponse } from "next/server";
import { isSignedIn } from "@/lib/auth";
import { listStoredBooks, parseNewBook, saveStoredBook } from "@/lib/library-store";

export async function GET() {
  if (!(await isSignedIn())) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const books = await listStoredBooks();
  return NextResponse.json({ books });
}

export async function POST(request: Request) {
  if (!(await isSignedIn())) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const input = parseNewBook(await request.json().catch(() => null));
  if (!input) {
    return NextResponse.json({ error: "That book could not be saved." }, { status: 400 });
  }
  try {
    const book = await saveStoredBook(input);
    return NextResponse.json({ book });
  } catch {
    return NextResponse.json(
      { error: "The file did not finish uploading. Try adding it again." },
      { status: 400 },
    );
  }
}
