import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "folio_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secret(): string | null {
  return process.env.FOLIO_PASSWORD ?? null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function passwordsMatch(input: string, expected: string): boolean {
  const left = createHash("sha256").update(input).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export function passwordConfigured(): boolean {
  return Boolean(secret());
}

export function passwordMatches(input: string): boolean {
  const expected = secret();
  if (!expected) return false;
  return passwordsMatch(input, expected);
}

export function createSessionValue(): string {
  const key = secret();
  if (!key) throw new Error("FOLIO_PASSWORD is not set.");
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `v1.${expires}`;
  return `${payload}.${sign(payload, key)}`;
}

export function sessionIsValid(value: string | undefined | null): boolean {
  const key = secret();
  if (!key || !value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const given = Buffer.from(parts[2]);
  const expected = Buffer.from(sign(payload, key));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  const expires = Number(parts[1]);
  return Number.isFinite(expires) && expires > Date.now();
}

export async function isSignedIn(): Promise<boolean> {
  const jar = await cookies();
  return sessionIsValid(jar.get(SESSION_COOKIE)?.value);
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
