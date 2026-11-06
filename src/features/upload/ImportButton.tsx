"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ImportButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function doImport(file: File) {
    setLoading(true);
    setError(null);
    try {
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
        setLoading(false);
        return;
      }
      const { document, warnings } = (await res.json()) as {
        document: { id: string };
        warnings: string[];
      };
      const dest = `/docs/${document.id}${warnings.length > 0 ? "?imported=1" : ""}`;
      startTransition(() => router.push(dest));
    } catch {
      setError("Could not import the file. Check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".docx,.md,.txt"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void doImport(f);
          // Reset so the same file can be re-uploaded.
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={loading || isPending}
        onClick={() => inputRef.current?.click()}
        className="btn-ghost rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
        title="Supports .docx, .md and .txt, up to 4 MB."
      >
        {loading || isPending ? "Importing..." : "Import file"}
      </button>
      {error && (
        <p
          className="w-full text-sm"
          style={{ color: "#b91c1c" }}
        >
          {error}
        </p>
      )}
    </>
  );
}
