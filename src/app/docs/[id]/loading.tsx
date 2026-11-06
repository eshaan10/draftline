export default function EditorLoading() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="h-6 w-80 animate-pulse rounded-md" style={{ background: "var(--border)" }} />
      <div
        className="mt-8 h-[60vh] animate-pulse rounded-md border"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      />
    </main>
  );
}
