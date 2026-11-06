import { redirect } from "next/navigation";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import {
  assignments,
  classMembers,
  classes,
  submissions,
} from "@/server/schema";

export const dynamic = "force-dynamic";

function statusChip(submission: typeof submissions.$inferSelect | null, dueAt: Date) {
  const now = new Date();
  if (!submission) return { label: "Not started", tone: "muted" as const };
  if (submission.status === "submitted") {
    return submission.isLate
      ? { label: "Submitted late", tone: "warn" as const }
      : { label: "Submitted", tone: "brand" as const };
  }
  if (submission.status === "in_progress") {
    return { label: "In progress", tone: "muted" as const };
  }
  if (now > dueAt) return { label: "Late", tone: "warn" as const };
  return { label: "Not started", tone: "muted" as const };
}

export default async function AssignmentsRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const db = await getDb();

  if (user.role === "teacher") {
    const rows = await db
      .select({ assignment: assignments, className: classes.name })
      .from(assignments)
      .innerJoin(classes, eq(classes.id, assignments.classId))
      .where(eq(assignments.teacherId, user.id))
      .orderBy(desc(assignments.createdAt));
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <header className="flex items-center justify-between border-b pb-4" style={{ borderColor: "var(--border)" }}>
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>Teacher</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Assignments</h1>
          </div>
          <div className="flex items-center gap-3 text-sm" style={{ color: "var(--muted)" }}>
            <Link href="/classes" className="btn-ghost rounded-md px-3 py-1.5">Classes</Link>
            <Link href="/docs" className="btn-ghost rounded-md px-3 py-1.5">Docs</Link>
            <span>Signed in as {user.name}</span>
          </div>
        </header>
        {rows.length === 0 ? (
          <p className="mt-6 rounded-md border px-4 py-6 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--muted)" }}>
            Create a class and an assignment to get started.
          </p>
        ) : (
          <ul className="mt-6 space-y-2">
            {rows.map((r) => (
              <li key={r.assignment.id}>
                <Link
                  href={`/assignments/${r.assignment.id}`}
                  className="block rounded-md border p-4 transition hover:border-[color:var(--brand-border)]"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <p className="text-base font-medium">{r.assignment.title}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                    {r.className} · Due {new Date(r.assignment.dueAt).toLocaleString()}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    );
  }

  // Student view.
  const memberRows = await db
    .select({ classId: classMembers.classId })
    .from(classMembers)
    .where(and(eq(classMembers.userId, user.id), eq(classMembers.status, "active")));
  const classIds = memberRows.map((m) => m.classId);
  const rows =
    classIds.length === 0
      ? []
      : await db
          .select({ assignment: assignments, className: classes.name, submission: submissions })
          .from(assignments)
          .innerJoin(classes, eq(classes.id, assignments.classId))
          .leftJoin(
            submissions,
            and(
              eq(submissions.assignmentId, assignments.id),
              eq(submissions.studentId, user.id),
            ),
          )
          .where(inArray(assignments.classId, classIds))
          .orderBy(desc(assignments.createdAt));

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="flex items-center justify-between border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>Student</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Assignments</h1>
        </div>
        <div className="flex items-center gap-3 text-sm" style={{ color: "var(--muted)" }}>
          <Link href="/docs" className="btn-ghost rounded-md px-3 py-1.5">Docs</Link>
          <span>Signed in as {user.name}</span>
        </div>
      </header>
      {rows.length === 0 ? (
        <p className="mt-6 rounded-md border px-4 py-6 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--muted)" }}>
          You are not in any classes yet.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {rows.map((r) => {
            const chip = statusChip(r.submission ?? null, r.assignment.dueAt);
            const chipStyle =
              chip.tone === "brand"
                ? { background: "var(--brand-soft)", color: "var(--brand)", borderColor: "var(--brand-border)" }
                : chip.tone === "warn"
                  ? { background: "#fef3c7", color: "#92400e", borderColor: "#fcd34d" }
                  : { background: "transparent", color: "var(--muted)", borderColor: "var(--border)" };
            const countdown = countdownText(r.assignment.dueAt, r.submission ?? null);
            return (
              <li key={r.assignment.id}>
                <Link
                  href={`/assignments/${r.assignment.id}`}
                  className="block rounded-md border p-4 transition hover:border-[color:var(--brand-border)]"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-medium">{r.assignment.title}</p>
                      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                        {r.className} · Due {new Date(r.assignment.dueAt).toLocaleString()}
                      </p>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{countdown}</p>
                    </div>
                    <span
                      className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide"
                      style={chipStyle}
                    >
                      {chip.label}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function countdownText(
  dueAt: Date,
  submission: typeof submissions.$inferSelect | null,
): string {
  if (submission?.status === "submitted") {
    return submission.isLate ? "Submitted late" : "Submitted on time";
  }
  const diff = dueAt.getTime() - Date.now();
  if (diff <= 0) return "Overdue";
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 24) return `Due in ${Math.ceil(hours / 24)} days`;
  if (hours >= 1) return `Due in ${hours}h`;
  return `Due in ${Math.ceil(diff / 60_000)}m`;
}
