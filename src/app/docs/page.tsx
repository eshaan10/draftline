import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";

export default async function DocsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex items-center justify-between border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Draftline
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your documents</h1>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="btn-ghost rounded-md px-3 py-1.5 text-sm">
            Sign out
          </button>
        </form>
      </header>
      <section className="mt-10 text-lg">Hello, {user.name}</section>
    </main>
  );
}
