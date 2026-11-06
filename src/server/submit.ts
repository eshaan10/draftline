import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { assignments, submissions } from "./schema";

export type SubmitResult =
  | { ok: true; submission: typeof submissions.$inferSelect }
  | { error: "not_found" }
  | { error: "locked"; message: string };

// A submission doc is locked read-only for the student when they have already
// submitted AND the due date has passed. Before the due date: always writable.
// After the due date, unsubmitted: still writable so the student can submit
// one more time (that submission will be marked late).
export function isSubmissionLocked(
  submission: Pick<typeof submissions.$inferSelect, "status">,
  assignment: Pick<typeof assignments.$inferSelect, "dueAt">,
  now: Date,
): boolean {
  return submission.status === "submitted" && now.getTime() > assignment.dueAt.getTime();
}

export function computeIsLate(now: Date, dueAt: Date): boolean {
  return now.getTime() > dueAt.getTime();
}

// Submit a student's assignment. Injectable `now` for testing the boundary.
export async function performSubmit(opts: {
  userId: string;
  assignmentId: string;
  now: Date;
}): Promise<SubmitResult> {
  const db = await getDb();
  const rows = await db
    .select({
      submission: submissions,
      assignment: assignments,
    })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .where(
      and(
        eq(submissions.assignmentId, opts.assignmentId),
        eq(submissions.studentId, opts.userId),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return { error: "not_found" };

  // Lock check runs first: if the doc is already locked, the submit request
  // itself should fail with a clear message.
  if (isSubmissionLocked(row.submission, row.assignment, opts.now)) {
    return {
      error: "locked",
      message: "This submission is closed.",
    };
  }

  const isLate = computeIsLate(opts.now, row.assignment.dueAt);
  const firstSubmittedAt = row.submission.firstSubmittedAt ?? opts.now;

  const [updated] = await db
    .update(submissions)
    .set({
      status: "submitted",
      firstSubmittedAt,
      submittedAt: opts.now,
      isLate,
    })
    .where(eq(submissions.id, row.submission.id))
    .returning();

  return { ok: true, submission: updated };
}
