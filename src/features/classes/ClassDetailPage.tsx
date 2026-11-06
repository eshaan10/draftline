"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Member = { id: string; email: string; status: "pending" | "active"; userName: string | null };
type Assignment = { id: string; title: string; dueAt: string };
type TeacherDoc = { id: string; title: string };

export function ClassDetailPage({
  user,
  classInfo,
  members: initialMembers,
  assignments,
  teacherDocs,
}: {
  user: { id: string; name: string };
  classInfo: { id: string; name: string };
  members: Member[];
  assignments: Assignment[];
  teacherDocs: TeacherDoc[];
}) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [addEmail, setAddEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Assignment create form state
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [templateDocId, setTemplateDocId] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [, startTransition] = useTransition();

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    const email = addEmail.trim();
    if (!email) return;
    setAdding(true);
    setError(null);
    const res = await fetch(`/api/classes/${classInfo.id}/members`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setAdding(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Could not add student.");
      return;
    }
    const body = await res.json();
    setMembers((prev) => {
      const without = prev.filter((m) => m.id !== body.member.id);
      return [...without, { ...body.member, userName: body.userName ?? null }];
    });
    setAddEmail("");
  }

  async function removeMember(id: string) {
    if (!window.confirm("Remove this student from the class?")) return;
    const res = await fetch(`/api/classes/${classInfo.id}/members/${id}`, { method: "DELETE" });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== id));
    }
  }

  async function createAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !dueAt) return;
    setCreating(true);
    setError(null);
    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        classId: classInfo.id,
        title: title.trim(),
        dueAt: new Date(dueAt).toISOString(),
        templateDocId: templateDocId || null,
      }),
    });
    setCreating(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Could not create assignment.");
      return;
    }
    const body = await res.json();
    startTransition(() => router.push(`/assignments/${body.assignment.id}`));
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-center justify-between border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Class
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{classInfo.name}</h1>
        </div>
        <div className="flex items-center gap-3 text-sm" style={{ color: "var(--muted)" }}>
          <Link href="/classes" className="btn-ghost rounded-md px-3 py-1.5">All classes</Link>
          <Link href="/assignments" className="btn-ghost rounded-md px-3 py-1.5">Assignments</Link>
          <span>Signed in as {user.name}</span>
        </div>
      </header>

      {error && (
        <p className="mt-4 rounded-md border px-3 py-2 text-xs" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>
          {error}
        </p>
      )}

      <section className="mt-8 grid gap-10 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Roster
          </h2>
          <form onSubmit={addMember} className="mt-3 flex gap-2">
            <input
              type="email"
              required
              placeholder="student@example.com"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              className="input flex-1 rounded-md px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={adding}
              className="btn-primary rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60"
            >
              {adding ? "Adding..." : "Add"}
            </button>
          </form>
          {members.length === 0 ? (
            <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
              No students yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y" style={{ borderColor: "var(--border)" }}>
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {m.userName ?? m.email}
                    </p>
                    {m.userName && (
                      <p className="truncate text-xs" style={{ color: "var(--muted)" }}>{m.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {m.status === "pending" && (
                      <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide" style={{ borderColor: "#fcd34d", background: "#fef3c7", color: "#92400e" }}>
                        Pending
                      </span>
                    )}
                    <button onClick={() => removeMember(m.id)} className="btn-ghost rounded-md px-2 py-1 text-xs">
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Create assignment
          </h2>
          <form onSubmit={createAssignment} className="mt-3 space-y-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Assignment title"
              className="input w-full rounded-md px-3 py-2 text-sm"
              required
            />
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="input w-full rounded-md px-3 py-2 text-sm"
              required
            />
            <select
              value={templateDocId}
              onChange={(e) => setTemplateDocId(e.target.value)}
              className="input w-full rounded-md px-3 py-2 text-sm"
            >
              <option value="">No template (blank doc)</option>
              {teacherDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title || "Untitled document"}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={creating}
              className="btn-primary w-full rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60"
            >
              {creating ? "Creating..." : "Create assignment"}
            </button>
          </form>

          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Existing assignments
          </h2>
          {assignments.length === 0 ? (
            <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>No assignments yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {assignments.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/assignments/${a.id}`}
                    className="block rounded-md border p-3 transition hover:border-[color:var(--brand-border)]"
                    style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                  >
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                      Due {new Date(a.dueAt).toLocaleString()}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
