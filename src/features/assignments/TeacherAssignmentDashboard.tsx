"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Student = {
  id: string;
  name: string;
  email: string;
  submissionStatus: "not_started" | "in_progress" | "submitted";
  isLate: boolean;
  submittedAt: string | null;
  documentId: string;
};

type Assignment = {
  id: string;
  title: string;
  className: string;
  dueAt: string;
  classId: string;
};

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "submitted", label: "Submitted" },
  { value: "late", label: "Late" },
] as const;

export function TeacherAssignmentDashboard({
  user,
  assignment,
  students,
}: {
  user: { id: string; name: string };
  assignment: Assignment;
  students: Student[];
}) {
  const [sortBy, setSortBy] = useState<"name" | "status">("name");
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]["value"]>("all");

  const filtered = useMemo(() => {
    const rows = [...students];
    rows.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return a.submissionStatus.localeCompare(b.submissionStatus);
    });
    if (filter === "all") return rows;
    if (filter === "late") return rows.filter((r) => r.isLate);
    return rows.filter((r) => r.submissionStatus === filter);
  }, [students, sortBy, filter]);

  const summary = useMemo(() => {
    let submitted = 0;
    let late = 0;
    let notStarted = 0;
    for (const s of students) {
      if (s.submissionStatus === "submitted") submitted += 1;
      if (s.isLate) late += 1;
      if (s.submissionStatus === "not_started") notStarted += 1;
    }
    return { submitted, late, notStarted };
  }, [students]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex items-center justify-between border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            {assignment.className} · Teacher dashboard
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{assignment.title}</h1>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Due {new Date(assignment.dueAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm" style={{ color: "var(--muted)" }}>
          <Link href={`/classes/${assignment.classId}`} className="btn-ghost rounded-md px-3 py-1.5">
            Class
          </Link>
          <Link href="/assignments" className="btn-ghost rounded-md px-3 py-1.5">All assignments</Link>
          <span>Signed in as {user.name}</span>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-3 gap-3">
        <SummaryCard label="Submitted" value={summary.submitted} />
        <SummaryCard label="Late" value={summary.late} />
        <SummaryCard label="Not started" value={summary.notStarted} />
      </section>

      <section className="mt-6 flex items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <span style={{ color: "var(--muted)" }}>Sort</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="input rounded-md px-2 py-1"
          >
            <option value="name">Name</option>
            <option value="status">Status</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span style={{ color: "var(--muted)" }}>Filter</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="input rounded-md px-2 py-1"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="mt-6 overflow-x-auto rounded-md border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
            <tr>
              <Th>Student</Th>
              <Th>Status</Th>
              <Th>Submitted</Th>
              {/* B4 placeholder: active time column (writing time minus idle gaps) */}
              <Th>Active time</Th>
              {/* B4 placeholder: pasted percent column (from facts.ts) */}
              <Th>Pasted %</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{s.email}</p>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={s.submissionStatus} isLate={s.isLate} />
                </td>
                <td className="px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>
                  {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "—"}
                </td>
                <td className="px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>
                  {/* B4 placeholder: active writing time */}
                  —
                </td>
                <td className="px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>
                  {/* B4 placeholder: pasted % */}
                  —
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Link
                      href={`/docs/${s.documentId}`}
                      className="btn-ghost rounded-md px-2 py-1 text-xs"
                    >
                      Open
                    </Link>
                    {/* B4 placeholder: Replay button. B4 will add this link to /docs/[id]/replay. */}
                    <button
                      type="button"
                      disabled
                      title="Replay is coming in B4"
                      className="btn-ghost rounded-md px-2 py-1 text-xs opacity-50"
                    >
                      Replay
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-xs" style={{ color: "var(--muted)" }}>
                  No students match that filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">{children}</th>;
}

function StatusBadge({
  status,
  isLate,
}: {
  status: "not_started" | "in_progress" | "submitted";
  isLate: boolean;
}) {
  const label =
    status === "submitted"
      ? isLate
        ? "Submitted late"
        : "Submitted"
      : status === "in_progress"
        ? "In progress"
        : "Not started";
  const style =
    status === "submitted" && !isLate
      ? { background: "var(--brand-soft)", color: "var(--brand)", borderColor: "var(--brand-border)" }
      : isLate
        ? { background: "#fef3c7", color: "#92400e", borderColor: "#fcd34d" }
        : { background: "transparent", color: "var(--muted)", borderColor: "var(--border)" };
  return (
    <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide" style={style}>
      {label}
    </span>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="rounded-md border p-4"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
