"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { generateHTML } from "@tiptap/html";
import { relativeTime } from "./relativeTime";
import { buildExtensions } from "@/features/editor/editorExtensions";
import { ImportButton } from "@/features/upload/ImportButton";
import { ThemeToggle } from "@/features/theme/ThemeToggle";

export type DocRow = {
  id: string;
  title: string;
  version: number;
  updatedAt: string;
  createdAt: string;
  preview: unknown;
  lastEditor: { name: string; at: string } | null;
};

export type SharedRow = DocRow & { role: "viewer" | "commenter" | "editor"; ownerName: string };

export function DocsDashboard({
  user,
  owned: ownedInitial,
  shared,
}: {
  user: { id: string; name: string; role: string };
  owned: DocRow[];
  shared: SharedRow[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [owned, setOwned] = useState<DocRow[]>(ownedInitial);
  const [dragOver, setDragOver] = useState(false);

  const filteredOwned = useMemo(() => filterByTitle(owned, query), [owned, query]);
  const filteredShared = useMemo(() => filterByTitle(shared, query), [shared, query]);

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

  async function renameDoc(id: string, currentTitle: string) {
    const next = window.prompt("Rename document", currentTitle);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === currentTitle) return;
    const res = await fetch(`/api/docs/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    if (!res.ok) {
      setError("Could not rename that document.");
      return;
    }
    setOwned((rows) =>
      rows.map((r) => (r.id === id ? { ...r, title: trimmed, updatedAt: new Date().toISOString() } : r)),
    );
  }

  async function deleteDoc(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/docs/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not delete that document.");
      return;
    }
    setOwned((rows) => rows.filter((r) => r.id !== id));
  }

  async function handleDropFile(file: File) {
    setDragOver(false);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/import", { method: "POST", body: fd });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg =
        res.status === 413
          ? "File exceeds the 4 MB limit."
          : res.status === 415
            ? "Only .docx, .md, and .txt files are supported."
            : (body?.error?.message as string | undefined) ?? "Import failed.";
      setError(msg);
      return;
    }
    const { document, warnings } = (await res.json()) as {
      document: { id: string };
      warnings: string[];
    };
    const dest = `/docs/${document.id}${warnings.length > 0 ? "?imported=1" : ""}`;
    startTransition(() => router.push(dest));
  }

  return (
    <main
      className="mx-auto max-w-6xl px-6 py-10"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) void handleDropFile(file);
      }}
      style={dragOver ? { outline: "2px dashed var(--brand)", outlineOffset: "-4px" } : undefined}
    >
      <header className="flex items-center justify-between border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <p className="flex items-center gap-1 text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            <span
              className="inline-flex items-center justify-center rounded"
              style={{ width: 18, height: 18, background: "var(--brand)", color: "var(--brand-fg)", fontSize: 13, fontWeight: 700, lineHeight: 1 }}
            >
              /
            </span>
            draftline<span style={{ color: "var(--brand)", fontWeight: 700 }}>/</span>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your documents</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/assignments" className="btn-ghost rounded-md px-3 py-1.5 text-sm">
            Assignments
          </Link>
          {user.role === "teacher" && (
            <Link href="/classes" className="btn-ghost rounded-md px-3 py-1.5 text-sm">
              Classes
            </Link>
          )}
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            Signed in as {user.name}
          </span>
          <ThemeToggle />
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
        <ImportButton />
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Supports .docx, .md and .txt, up to 4 MB. Or drag a file anywhere on the page.
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title"
          className="input w-full max-w-sm rounded-md px-3 py-2 text-sm"
        />
      </section>

      {error && (
        <p
          className="mt-4 rounded-md border px-3 py-2 text-sm"
          style={{ color: "#b91c1c", borderColor: "#fecaca", background: "#fef2f2" }}
        >
          {error}
        </p>
      )}

      <Section
        title="My documents"
        rows={filteredOwned}
        kind="owned"
        empty={ownedEmpty(owned.length, query)}
        onRename={renameDoc}
        onDelete={deleteDoc}
      />
      <SharedSection
        rows={filteredShared}
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
  if (count === 0) return "Start by creating a document. Changes save automatically while you type.";
  if (query.trim().length > 0) return "No documents match that search.";
  return "You have no documents.";
}

function Section({
  title,
  rows,
  kind,
  empty,
  onRename,
  onDelete,
}: {
  title: string;
  rows: DocRow[];
  kind: "owned";
  empty: string;
  onRename?: (id: string, title: string) => void;
  onDelete?: (id: string, title: string) => void;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        {title}
      </h2>
      {rows.length === 0 ? (
        <p
          className="mt-3 rounded-md border px-4 py-6 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--muted)" }}
        >
          {empty}
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((row) => (
            <li key={row.id}>
              <DocCard row={row} kind={kind} onRename={onRename} onDelete={onDelete} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SharedSection({ rows, empty }: { rows: SharedRow[]; empty: string }) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        Shared with me
      </h2>
      {rows.length === 0 ? (
        <p
          className="mt-3 rounded-md border px-4 py-6 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--muted)" }}
        >
          {empty}
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((row) => (
            <li key={row.id}>
              <SharedCard row={row} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const ROLE_LABEL: Record<"viewer" | "commenter" | "editor", string> = {
  viewer: "Viewer",
  commenter: "Commenter",
  editor: "Editor",
};

function DocCard({
  row,
  kind,
  onRename,
  onDelete,
}: {
  row: DocRow;
  kind: "owned";
  onRename?: (id: string, title: string) => void;
  onDelete?: (id: string, title: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <article
      className="group relative overflow-hidden rounded-md border transition hover:border-[color:var(--brand-border)]"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <Link href={`/docs/${row.id}`} className="block">
        <Thumbnail preview={row.preview} />
        <div className="flex items-start justify-between gap-2 border-t p-3" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.title || "Untitled document"}</p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
              {row.lastEditor
                ? `Last edited by ${row.lastEditor.name}, ${relativeTime(row.lastEditor.at)}`
                : `Edited ${relativeTime(row.updatedAt)}`}
            </p>
          </div>
          <span
            className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide"
            style={{
              borderColor: "var(--brand-border)",
              background: "var(--brand-soft)",
              color: "var(--brand)",
            }}
          >
            Owned
          </span>
        </div>
      </Link>
      {kind === "owned" && onRename && onDelete && (
        <div ref={menuRef} className="absolute right-2 top-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setMenuOpen((o) => !o);
            }}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="rounded-md border px-1.5 py-0.5 text-xs opacity-0 transition group-hover:opacity-100 focus:opacity-100"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            aria-label="Document actions"
          >
            ⋯
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-1 w-32 overflow-hidden rounded-md border text-sm shadow"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onRename(row.id, row.title);
                }}
                className="block w-full px-3 py-1.5 text-left hover:bg-[color:var(--brand-soft)]"
              >
                Rename
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(row.id, row.title);
                }}
                className="block w-full px-3 py-1.5 text-left hover:bg-[color:var(--brand-soft)]"
                style={{ color: "#b91c1c" }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function SharedCard({ row }: { row: SharedRow }) {
  return (
    <article
      className="group relative overflow-hidden rounded-md border transition hover:border-[color:var(--brand-border)]"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <Link href={`/docs/${row.id}`} className="block">
        <Thumbnail preview={row.preview} />
        <div className="flex items-start justify-between gap-2 border-t p-3" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.title || "Untitled document"}</p>
            <p className="mt-0.5 truncate text-xs" style={{ color: "var(--muted)" }}>
              {row.lastEditor
                ? `${row.ownerName} · Last edited by ${row.lastEditor.name}, ${relativeTime(row.lastEditor.at)}`
                : `Shared by ${row.ownerName} · Edited ${relativeTime(row.updatedAt)}`}
            </p>
          </div>
          <span
            className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            {ROLE_LABEL[row.role]}
          </span>
        </div>
      </Link>
    </article>
  );
}

function Thumbnail({ preview }: { preview: unknown }) {
  const html = useMemo(() => {
    try {
      const safe =
        preview && typeof preview === "object" && (preview as { type?: string }).type === "doc"
          ? preview
          : { type: "doc", content: [] };
      return generateHTML(safe as object, buildExtensions());
    } catch {
      return "";
    }
  }, [preview]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.25);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / 816);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="relative w-full overflow-hidden"
      style={{ aspectRatio: "8.5 / 11", background: "#ffffff" }}
    >
      <div
        className="prose-page"
        style={{
          width: "816px",
          height: "1056px",
          padding: "96px",
          transformOrigin: "top left",
          position: "absolute",
          top: 0,
          left: 0,
          transform: `scale(${scale})`,
          color: "#111827",
          fontFamily: "Arial, sans-serif",
          fontSize: "11pt",
          lineHeight: 1.15,
          pointerEvents: "none",
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
