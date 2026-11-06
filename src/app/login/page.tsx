import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/server/auth";

const DEMO_USERS = [
  { email: "rivera@demo.test", label: "Ms. Rivera (teacher)" },
  { email: "ana@demo.test", label: "Ana (student)" },
  { email: "ben@demo.test", label: "Ben (student)" },
  { email: "cam@demo.test", label: "Cam (student)" },
  { email: "dee@demo.test", label: "Dee (student)" },
];

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/docs");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Sign in to Draftline</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        A docs editor where the writing process is visible.
      </p>

      <form action="/api/auth/login" method="POST" className="mt-8 space-y-3">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          className="input w-full rounded-md px-3 py-2"
        />
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Password"
          className="input w-full rounded-md px-3 py-2"
        />
        <button
          type="submit"
          className="btn-primary w-full rounded-md px-3 py-2 font-medium"
        >
          Sign in
        </button>
      </form>

      <div className="mt-10">
        <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
          Demo accounts (password demo1234)
        </p>
        <form action="/api/auth/login" method="POST" className="mt-3 grid gap-2">
          <input type="hidden" name="password" value="demo1234" />
          {DEMO_USERS.map((d) => (
            <button
              key={d.email}
              type="submit"
              name="email"
              value={d.email}
              className="btn-ghost rounded-md px-3 py-2 text-left text-sm"
            >
              Sign in as {d.label}
            </button>
          ))}
        </form>
      </div>

      <p className="mt-10 text-sm" style={{ color: "var(--muted)" }}>
        New here?{" "}
        <Link href="/signup" className="font-medium underline" style={{ color: "var(--brand)" }}>
          Create an account
        </Link>
      </p>
    </main>
  );
}
