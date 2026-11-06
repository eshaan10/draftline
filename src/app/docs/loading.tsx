export default function DocsLoading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div
        className="h-8 w-48 animate-pulse rounded-md"
        style={{ background: "var(--border)" }}
      />
      <div className="mt-6 flex gap-3">
        <div className="h-9 w-32 animate-pulse rounded-md" style={{ background: "var(--border)" }} />
        <div className="h-9 flex-1 max-w-sm animate-pulse rounded-md" style={{ background: "var(--border)" }} />
      </div>
      <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-md border"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          />
        ))}
      </div>
    </main>
  );
}
