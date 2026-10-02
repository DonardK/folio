"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Login() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not sign in.");
      setPending(false);
      return;
    }
    router.refresh();
  }

  return (
    <main className="shelf">
      <form className="login" onSubmit={onSubmit}>
        <p className="eyebrow">Folio</p>
        <h1>Sign in</h1>
        <p className="lede">
          This shelf is private. Your books and the page you left off on are saved on the site, so any
          browser you sign in to can continue.
        </p>
        <label className="login-field">
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? (
          <p className="banner is-warn" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="primary" disabled={pending}>
          {pending ? "Checking…" : "Continue"}
        </button>
      </form>
    </main>
  );
}
