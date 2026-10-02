import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createSessionValue,
  passwordConfigured,
  passwordMatches,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";

export async function POST(request: Request) {
  if (!passwordConfigured()) {
    return NextResponse.json(
      { error: "This site does not have a password yet." },
      { status: 500 },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === "string") password = body.password;
  } catch {
    password = "";
  }

  if (!passwordMatches(password)) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionValue(), sessionCookieOptions);
  return NextResponse.json({ ok: true });
}
