"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { EditorToolbar } from "./Toolbar";
import { buildExtensions } from "./editorExtensions";
import { OutlineSidebar } from "./OutlineSidebar";
import { LinkPopover } from "./LinkPopover";
import { ShareDialog } from "./ShareDialog";
import { AttachmentsPanel } from "@/features/upload/AttachmentsPanel";
import { createRecorder, type Recorder } from "@/features/replay/recorder";
import { relativeTime } from "@/features/docs/relativeTime";

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
  replayNextSeq,
  showImportNotice,
  lastEditor,
}: {
  user: { id: string; name: string };
  document: DocumentShape;
  access: "owner" | "editor" | "commenter" | "viewer";
  replayNextSeq: number;
  showImportNotice?: boolean;
  lastEditor?: { name: string; at: string } | null;
}) {
  const router = useRouter();
  const canEdit = access === "owner" || access === "editor";
  const isOwner = access === "owner";
  const [shareOpen, setShareOpen] = useState(false);
  const [importNotice, setImportNotice] = useState(showImportNotice ?? false);
  // Ref so paste/drop handlers can call the latest upload fn without stale closure.
  const uploadImageRef = useRef<(file: File) => void>(() => {});
  // Recorder ref: created on mount if canEdit, destroyed on unmount.
  const recorderRef = useRef<Recorder | null>(null);

  const [title, setTitle] = useState(document.title);
  const [titleStatus, setTitleStatus] = useState<SaveStatus>("saved");
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [version, setVersion] = useState(document.version);
  const [conflict, setConflict] = useState<null | { latest: DocumentShape | null }>(null);

  // All refs the save loop reads from. State is mirrored into refs so the
  // save function can be stable (useCallback with [] deps) without going stale.
  const versionRef = useRef(document.version);
  const dirtyRef = useRef(false);
  const latestContentRef = useRef<unknown>(document.content);
  const conflictRef = useRef(false);
  const savingRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retriesRef = useRef(0);
  const canEditRef = useRef(canEdit);

  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  const flushSave = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (conflictRef.current || !dirtyRef.current || !canEditRef.current) return;
    if (savingRef.current) return savingRef.current;

    const run = (async () => {
      setStatus("saving");
      try {
        while (!conflictRef.current && dirtyRef.current) {
          const snapshot = latestContentRef.current;
          const base = versionRef.current;
          const res = await fetch(`/api/docs/${document.id}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: snapshot, baseVersion: base }),
          });

          if (res.status === 409) {
            let latest: DocumentShape | null = null;
            try {
              const latestRes = await fetch(`/api/docs/${document.id}`);
              if (latestRes.ok) latest = (await latestRes.json()).document;
            } catch {
              // ignore: we still show the banner even without the latest doc
            }
            conflictRef.current = true;
            setConflict({ latest });
            setStatus("conflict");
            return;
          }

          if (!res.ok) {
            setStatus("offline");
            retriesRef.current += 1;
            const delay = Math.min(30000, 1500 * 2 ** retriesRef.current);
            timerRef.current = setTimeout(() => {
              void flushSave();
            }, delay);
            return;
          }

          const data = await res.json();
          versionRef.current = data.document.version;
          setVersion(data.document.version);
          retriesRef.current = 0;

          if (latestContentRef.current === snapshot) {
            dirtyRef.current = false;
            setStatus("saved");
            return;
          }
          // New edits arrived while saving. Loop and save the latest snapshot
          // in the same flight; no second request races this one.
        }
      } finally {
        savingRef.current = null;
      }
    })();

    savingRef.current = run;
    return run;
  }, [document.id]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flushSave();
    }, 1500);
  }, [flushSave]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: canEdit,
    content: document.content as object,
    extensions: buildExtensions(),
    editorProps: {
      attributes: { class: "ProseMirror", "aria-label": "Document body" },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        const imgs = files.filter((f) => f.type.startsWith("image/"));
        if (imgs.length > 0) {
          imgs.forEach((f) => uploadImageRef.current(f));
          return true;
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
        const imgs = files.filter((f) => f.type.startsWith("image/"));
        if (imgs.length > 0) {
          imgs.forEach((f) => uploadImageRef.current(f));
          return true;
        }
        return false;
      },
    },
    onTransaction: ({ editor: ed, transaction }) => {
      if (canEditRef.current && recorderRef.current) {
        recorderRef.current.record(
          // The transaction type from @tiptap/react's onTransaction matches
          // what the recorder expects at runtime.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          transaction as any,
          () => ed.getJSON(),
        );
      }
    },
    onUpdate: ({ editor }) => {
      if (!canEditRef.current || conflictRef.current) return;
      latestContentRef.current = editor.getJSON();
      dirtyRef.current = true;
      setStatus("saving");
      scheduleSave();
    },
    onBlur: () => {
      if (!dirtyRef.current || conflictRef.current) return;
      void flushSave();
      recorderRef.current?.onBlur();
    },
  });

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

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // Recorder lifecycle: create once on mount (if editable), destroy on unmount.
  useEffect(() => {
    if (!canEdit) return;
    recorderRef.current = createRecorder({
      docId: document.id,
      initialContent: document.content,
      nextSeq: replayNextSeq,
    });
    return () => {
      recorderRef.current?.destroy();
      recorderRef.current = null;
    };
    // Intentionally only runs once on mount; replayNextSeq is the initial value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const { document: updated } = await res.json();
      versionRef.current = updated.version;
      setVersion(updated.version);
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
    versionRef.current = latest.version;
    setVersion(latest.version);
    setTitle(latest.title);
    editor?.commands.setContent(latest.content, { emitUpdate: false });
    latestContentRef.current = latest.content;
    dirtyRef.current = false;
    conflictRef.current = false;
    setStatus("saved");
    setConflict(null);
  }

  // Keep uploadImageRef.current pointing at the latest editor so paste/drop never go stale.
  uploadImageRef.current = async (file: File) => {
    if (!editor || !canEdit) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", "image");
    const res = await fetch(`/api/docs/${document.id}/attachments`, { method: "POST", body: fd });
    if (!res.ok) return;
    const { attachment } = (await res.json()) as { attachment: { url: string } };
    editor.chain().focus().setImage({ src: attachment.url }).run();
  };

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
            <AccessChip access={access} />
            <StatusChip status={status} titleStatus={titleStatus} canEdit={canEdit} />
            {canEdit && (
              <Link
                href={`/docs/${document.id}/replay`}
                className="btn-ghost rounded-md px-3 py-1 text-xs font-medium"
              >
                Replay
              </Link>
            )}
            {isOwner && (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="btn-primary rounded-md px-3 py-1 text-xs font-medium"
              >
                Share
              </button>
            )}
            {lastEditor && (
              <span>
                Last edited by {lastEditor.name}, {relativeTime(lastEditor.at)}
              </span>
            )}
            <span>Signed in as {user.name}</span>
          </div>
        </div>
        <EditorToolbar
          editor={editor}
          disabled={!canEdit}
          onInsertImage={canEdit ? (f) => uploadImageRef.current(f) : undefined}
        />
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

      {importNotice && (
        <div
          className="mx-auto mt-4 max-w-4xl rounded-md border px-4 py-3"
          style={{ background: "#f0fdf4", borderColor: "#86efac", color: "#166534" }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm">Some formatting may differ from the original.</p>
            <button
              type="button"
              onClick={() => setImportNotice(false)}
              aria-label="Dismiss"
              className="ml-4 rounded px-1 text-sm font-medium hover:opacity-70"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <section className="workspace mx-auto mt-6 flex max-w-[1400px] gap-4 px-4">
        <OutlineSidebar editor={editor} />
        <div className="flex-1 min-w-0">
          <div className="paper-sheet prose-page">
            <EditorContent editor={editor} />
          </div>
          {editor && canEdit && <LinkPopover editor={editor} />}
          <p className="mt-3 text-right text-xs" style={{ color: "var(--muted)" }}>
            {editor?.storage.characterCount?.characters?.() ?? 0} characters
            {" · "}
            {editor?.storage.characterCount?.words?.() ?? 0} words
          </p>
        </div>
        <AttachmentsPanel docId={document.id} userId={user.id} canEdit={canEdit} />
      </section>

      {isOwner && (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          docId={document.id}
          docTitle={title}
        />
      )}
    </main>
  );
}

function AccessChip({ access }: { access: "owner" | "editor" | "commenter" | "viewer" }) {
  const map = {
    owner: { label: "Owner", color: "var(--brand)", bg: "var(--brand-soft)", border: "var(--brand-border)" },
    editor: { label: "Editor", color: "var(--brand)", bg: "var(--brand-soft)", border: "var(--brand-border)" },
    commenter: { label: "Commenter", color: "var(--muted)", bg: "transparent", border: "var(--border)" },
    viewer: { label: "View only", color: "var(--muted)", bg: "transparent", border: "var(--border)" },
  } as const;
  const s = map[access];
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide"
      style={{ borderColor: s.border, background: s.bg, color: s.color }}
      title={`Access: ${s.label}`}
    >
      {s.label}
    </span>
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
  const combined: SaveStatus =
    status === "conflict"
      ? "conflict"
      : status === "offline"
        ? "offline"
        : status === "saving" || status === "dirty"
          ? "saving"
          : titleStatus !== "saved"
            ? titleStatus
            : "saved";
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
