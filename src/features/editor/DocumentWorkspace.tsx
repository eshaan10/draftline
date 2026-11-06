"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { EditorToolbar } from "./Toolbar";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "offline" | "conflict";

type DocumentShape = {
  id: string;
  title: string;
  version: number;
  content: unknown;
  updatedAt: string;
};

export function DocumentWorkspace({
  user,
  document,
  access,
}: {
  user: { id: string; name: string };
  document: DocumentShape;
  access: "owner" | "editor" | "commenter" | "viewer";
}) {
  const router = useRouter();
  const canEdit = access === "owner" || access === "editor";

  const [title, setTitle] = useState(document.title);
  const [titleStatus, setTitleStatus] = useState<SaveStatus>("saved");
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [version, setVersion] = useState(document.version);
  const [conflict, setConflict] = useState<null | { latest: DocumentShape }>(null);

  const dirtyRef = useRef(false);
  const latestContentRef = useRef<unknown>(document.content);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retriesRef = useRef(0);

  const editor = useEditor({
    immediatelyRender: false,
    editable: canEdit,
    content: document.content as object,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: "Start writing...",
      }),
      CharacterCount,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ allowBase64: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    editorProps: {
      attributes: {
        class: "ProseMirror",
        "aria-label": "Document body",
      },
    },
    onUpdate: ({ editor }) => {
      if (!canEdit || conflict) return;
      latestContentRef.current = editor.getJSON();
      dirtyRef.current = true;
      setStatus("dirty");
      scheduleSave();
    },
    onBlur: () => {
      if (dirtyRef.current) save();
    },
  });

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      save();
    }, 1500);
  }, []);

  const save = useCallback(async () => {
    if (!dirtyRef.current || conflict) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStatus("saving");
    try {
      const res = await fetch(`/api/docs/${document.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: latestContentRef.current,
          baseVersion: version,
        }),
      });
      if (res.status === 409) {
        const latestRes = await fetch(`/api/docs/${document.id}`);
        const latest = latestRes.ok ? (await latestRes.json()).document : null;
        setStatus("conflict");
        setConflict({ latest });
        return;
      }
      if (!res.ok) throw new Error("save_failed");
      const data = await res.json();
      setVersion(data.document.version);
      dirtyRef.current = false;
      retriesRef.current = 0;
      setStatus("saved");
    } catch {
      setStatus("offline");
      retriesRef.current += 1;
      const delay = Math.min(30000, 1500 * 2 ** retriesRef.current);
      timerRef.current = setTimeout(save, delay);
    }
  }, [conflict, document.id, version]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  async function saveTitle(next: string) {
    const trimmed = next.trim();
    if (!canEdit || trimmed.length === 0 || trimmed === document.title) {
      setTitle(document.title);
      return;
    }
    setTitleStatus("saving");
    try {
      const res = await fetch(`/api/docs/${document.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) throw new Error("rename_failed");
      setTitleStatus("saved");
    } catch {
      setTitleStatus("offline");
    }
  }

  async function reloadFromServer() {
    const res = await fetch(`/api/docs/${document.id}`);
    if (!res.ok) {
      router.refresh();
      return;
    }
    const { document: latest } = await res.json();
    setVersion(latest.version);
    setTitle(latest.title);
    editor?.commands.setContent(latest.content, { emitUpdate: false });
    latestContentRef.current = latest.content;
    dirtyRef.current = false;
    setStatus("saved");
    setConflict(null);
  }

  async function keepMyVersion() {
    const res = await fetch(`/api/docs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: `${title} (my version)`,
        content: latestContentRef.current,
      }),
    });
    if (!res.ok) return;
    const { document: created } = await res.json();
    dirtyRef.current = false;
    router.push(`/docs/${created.id}`);
  }

  return (
    <main className="min-h-screen pb-24">
      <header
        className="sticky top-0 z-20 border-b"
        style={{ background: "var(--bg)", borderColor: "var(--border)" }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Link
              href="/docs"
              className="btn-ghost shrink-0 rounded-md px-2 py-1 text-xs"
              aria-label="Back to documents"
            >
              ←
            </Link>
            <input
              value={title}
              disabled={!canEdit}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleStatus("dirty");
              }}
              onBlur={() => saveTitle(title)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              aria-label="Document title"
              className="w-full truncate bg-transparent text-lg font-semibold outline-none"
            />
          </div>
          <div className="flex items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
            <StatusChip status={status} titleStatus={titleStatus} canEdit={canEdit} />
            <span>Signed in as {user.name}</span>
          </div>
        </div>
        <EditorToolbar editor={editor} disabled={!canEdit} />
      </header>

      {conflict && (
        <div
          className="mx-auto mt-4 max-w-4xl rounded-md border px-4 py-3"
          style={{ background: "#fffbeb", borderColor: "#fcd34d", color: "#92400e" }}
        >
          <p className="font-medium">This document changed elsewhere.</p>
          <p className="mt-1 text-sm">
            Your changes are not saved. Reload to get the latest version, or keep your version as a new document.
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={reloadFromServer} className="btn-primary rounded-md px-3 py-1.5 text-sm">
              Reload
            </button>
            <button onClick={keepMyVersion} className="btn-ghost rounded-md px-3 py-1.5 text-sm">
              Keep my version
            </button>
          </div>
        </div>
      )}

      <section className="mx-auto mt-6 max-w-4xl px-4">
        <div className="paper prose-page">
          <EditorContent editor={editor} />
        </div>
        <p className="mt-3 text-right text-xs" style={{ color: "var(--muted)" }}>
          {editor?.storage.characterCount?.characters?.() ?? 0} characters
          {" · "}
          {editor?.storage.characterCount?.words?.() ?? 0} words
        </p>
      </section>
    </main>
  );
}

function StatusChip({
  status,
  titleStatus,
  canEdit,
}: {
  status: SaveStatus;
  titleStatus: SaveStatus;
  canEdit: boolean;
}) {
  if (!canEdit) {
    return (
      <span
        className="rounded-full border px-2 py-0.5"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
      >
        Read only
      </span>
    );
  }
  const combined = status === "saved" && titleStatus !== "saved" ? titleStatus : status;
  const map: Record<SaveStatus, { label: string; tone: string; bg: string; border: string }> = {
    idle: { label: "Saved", tone: "var(--muted)", bg: "transparent", border: "var(--border)" },
    dirty: { label: "Saving...", tone: "var(--muted)", bg: "transparent", border: "var(--border)" },
    saving: { label: "Saving...", tone: "var(--muted)", bg: "transparent", border: "var(--border)" },
    saved: { label: "Saved", tone: "var(--brand)", bg: "var(--brand-soft)", border: "var(--brand-border)" },
    offline: { label: "Offline, will retry", tone: "#92400e", bg: "#fef3c7", border: "#fcd34d" },
    conflict: { label: "Conflict", tone: "#991b1b", bg: "#fee2e2", border: "#fecaca" },
  };
  const s = map[combined];
  return (
    <span
      className="rounded-full border px-2 py-0.5"
      style={{ borderColor: s.border, background: s.bg, color: s.tone }}
    >
      {s.label}
    </span>
  );
}
