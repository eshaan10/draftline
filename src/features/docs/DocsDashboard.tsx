"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { relativeTime } from "./relativeTime";

export type DocRow = {
  id: string;
  title: string;
  version: number;
  updatedAt: string;
  createdAt: string;
};

export type SharedRow = DocRow & { role: "viewer" | "commenter" | "editor"; ownerName: string };

export function DocsDashboard({
  user,
  owned,
  shared,
}: {
  user: { id: string; name: string };
  owned: DocRow[];
  shared: SharedRow[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredOwned = useMemo(
    () => filterByTitle(owned, query),
    [owned, query],
  );
  const filteredShared = useMemo(
    () => filterByTitle(shared, query),
    [shared, query],
  );

  async function createDoc() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Untitled document" }),
      });
      if (!res.ok) throw new Error("create_failed");
      const { document } = await res.json();
      startTransition(() => router.push(`/docs/${document.id}`));
    } catch {
      setError("Could not create a document. Check your connection and try again.");
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header
        className="flex items-center justify-between border-b pb-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Draftline
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your documents</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            Signed in as {user.name}
          </span>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="btn-ghost rounded-md px-3 py-1.5 text-sm">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={createDoc}
          disabled={creating || isPending}
          className="btn-primary rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {creating || isPending ? "Creating..." : "New document"}
        </button>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title"
          className="input w-full max-w-sm rounded-md px-3 py-2 text-sm"
        />
      </section>

      {error && (
        <p className="mt-4 rounded-md border px-3 py-2 text-sm" style={{ color: "#b91c1c", borderColor: "#fecaca", background: "#fef2f2" }}>
          {error}
        </p>
      )}

      <Section title="My documents" rows={filteredOwned} badge="Owned" empty={ownedEmpty(owned.length, query)} />
      <Section
        title="Shared with me"
        rows={filteredShared}
        badge="Shared"
        empty={
          shared.length === 0
            ? "When someone shares a document with you it will show up here."
            : "No shared documents match that search."
        }
      />
    </main>
  );
}

function filterByTitle<T extends { title: string }>(rows: T[], q: string): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) => r.title.toLowerCase().includes(needle));
}

function ownedEmpty(count: number, query: string) {
  if (count === 0) {
    return "Start by creating a document. Changes save automatically while you type.";
  }
  if (query.trim().length > 0) return "No documents match that search.";
  return "You have no documents.";
}

function Section({
  title,
  rows,
  badge,
  empty,
}: {
  title: string;
  rows: DocRow[];
  badge: "Owned" | "Shared";
  empty: string;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-md border px-4 py-6 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--muted)" }}>
          {empty}
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/docs/${row.id}`}
                className="block rounded-md border p-4 transition hover:border-[color:var(--brand-border)]"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate text-base font-medium">{row.title || "Untitled document"}</span>
                  <span
                    className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide"
                    style={{
                      borderColor: badge === "Owned" ? "var(--brand-border)" : "var(--border)",
                      background: badge === "Owned" ? "var(--brand-soft)" : "transparent",
                      color: badge === "Owned" ? "var(--brand)" : "var(--muted)",
                    }}
                  >
                    {badge}
                  </span>
                </div>
                <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                  Edited {relativeTime(row.updatedAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
