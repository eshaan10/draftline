import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center px-6">
      <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        404
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">We could not find that page.</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        The document may have been deleted, or you do not have access to it.
      </p>
      <Link
        href="/docs"
        className="btn-primary mt-6 inline-flex rounded-md px-3 py-2 text-sm font-medium"
      >
        Back to your documents
      </Link>
    </main>
  );
}
