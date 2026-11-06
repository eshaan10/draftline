"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type AttachmentRow = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  kind: "image" | "file";
  createdAt: string;
  uploaderId: string;
  uploaderName: string;
};

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsPanel({
  docId,
  userId,
  canEdit,
}: {
  docId: string;
  userId: string;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/docs/${docId}/attachments`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.attachments ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/docs/${docId}/attachments`, { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          res.status === 413
            ? "File exceeds the 4 MB limit."
            : res.status === 415
              ? "File type not allowed."
              : (body?.error?.message as string | undefined) ?? "Upload failed.";
        setError(msg);
      } else {
        await load();
      }
    } catch {
      setError("Upload failed. Check your connection.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this attachment? This cannot be undone.")) return;
    const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => prev.filter((a) => a.id !== id));
    } else {
      setError("Could not delete the attachment.");
    }
  }

  return (
    <div
      className="shrink-0 w-56 rounded-md border"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--muted)" }}
        aria-expanded={open}
      >
        <span>Attachments</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t px-3 pb-3 pt-2" style={{ borderColor: "var(--border)" }}>
          {canEdit && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,.txt,.md,.csv"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
                className="btn-primary mb-2 w-full rounded-md py-1 text-xs disabled:opacity-60"
              >
                {uploading ? "Uploading..." : "Upload file"}
              </button>
              <p className="mb-2 text-[10px]" style={{ color: "var(--muted)" }}>
                png, jpg, gif, webp, pdf, docx, txt, md, csv up to 4 MB
              </p>
            </>
          )}
          {error && (
            <p className="mb-2 text-xs" style={{ color: "#b91c1c" }}>
              {error}
            </p>
          )}
          {loading ? (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Loading...
            </p>
          ) : items.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              No attachments yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {items.map((att) => (
                <li
                  key={att.id}
                  className="flex items-start justify-between gap-1 rounded-md p-1 text-xs"
                  style={{ background: "var(--bg)" }}
                >
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/api/files/${att.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate font-medium hover:underline"
                      title={att.filename}
                    >
                      {att.filename}
                    </a>
                    <p style={{ color: "var(--muted)" }}>
                      {fmt(att.size)} · {att.uploaderName}
                    </p>
                  </div>
                  {(att.uploaderId === userId || canEdit) && (
                    <button
                      type="button"
                      onClick={() => void remove(att.id)}
                      aria-label={`Delete ${att.filename}`}
                      className="shrink-0 rounded px-1 hover:bg-red-50"
                      style={{ color: "#b91c1c" }}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
