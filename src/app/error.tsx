"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center px-6">
      <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        Something went wrong
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        We hit an unexpected error.
      </h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Try again in a moment. If this keeps happening, head back to your documents.
      </p>
      <div className="mt-6 flex gap-2">
        <button
          onClick={reset}
          className="btn-primary rounded-md px-3 py-2 text-sm font-medium"
        >
          Try again
        </button>
        <a
          href="/docs"
          className="btn-ghost rounded-md px-3 py-2 text-sm"
        >
          Back to documents
        </a>
      </div>
    </main>
  );
}
