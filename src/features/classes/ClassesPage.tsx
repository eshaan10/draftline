"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Row = { id: string; name: string; createdAt: string };

export function ClassesPage({
  user,
  classes,
}: {
  user: { id: string; name: string };
  classes: Row[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function createClass(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    const res = await fetch("/api/classes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setCreating(false);
    if (!res.ok) {
      setError("Could not create class.");
      return;
    }
    const body = await res.json();
    setName("");
    startTransition(() => router.push(`/classes/${body.class.id}`));
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="flex items-center justify-between border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Teacher
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Classes</h1>
        </div>
        <div className="flex items-center gap-3 text-sm" style={{ color: "var(--muted)" }}>
          <Link href="/docs" className="btn-ghost rounded-md px-3 py-1.5">Docs</Link>
          <Link href="/assignments" className="btn-ghost rounded-md px-3 py-1.5">Assignments</Link>
          <span>Signed in as {user.name}</span>
        </div>
      </header>

      <form onSubmit={createClass} className="mt-6 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New class name (e.g. English 101)"
          className="input flex-1 rounded-md px-3 py-2 text-sm"
          required
        />
        <button
          type="submit"
          disabled={creating}
          className="btn-primary rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60"
        >
          {creating ? "Creating..." : "Create class"}
        </button>
      </form>

      {error && (
        <p className="mt-3 rounded-md border px-3 py-2 text-xs" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>
          {error}
        </p>
      )}

      <section className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
          Your classes
        </p>
        {classes.length === 0 ? (
          <p className="mt-3 rounded-md border px-4 py-6 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--muted)" }}>
            Create a class to start adding students and assignments.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {classes.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/classes/${c.id}`}
                  className="block rounded-md border p-4 transition hover:border-[color:var(--brand-border)]"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <p className="text-base font-medium">{c.name}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                    Created {new Date(c.createdAt).toLocaleDateString()}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
