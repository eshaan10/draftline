import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/server/auth";

export default async function SignupPage() {
  const user = await getSessionUser();
  if (user) redirect("/docs");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Create an account</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Join Draftline to write, share, and review drafts together.
      </p>

      <form action="/api/auth/signup" method="POST" className="mt-8 space-y-3">
        <input
          name="name"
          required
          placeholder="Full name"
          className="input w-full rounded-md px-3 py-2"
        />
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
          minLength={8}
          required
          autoComplete="new-password"
          placeholder="Password (8+ characters)"
          className="input w-full rounded-md px-3 py-2"
        />
        <select name="role" required className="input w-full rounded-md px-3 py-2">
          <option value="student">I am a student</option>
          <option value="teacher">I am a teacher</option>
        </select>
        <button type="submit" className="btn-primary w-full rounded-md px-3 py-2 font-medium">
          Create account
        </button>
      </form>

      <p className="mt-10 text-sm" style={{ color: "var(--muted)" }}>
        Already have an account?{" "}
        <Link href="/login" className="font-medium underline" style={{ color: "var(--brand)" }}>
          Sign in
        </Link>
      </p>
    </main>
  );
}
