import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { assignments, classes, submissions } from "@/server/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = z.string().uuid();

const FeedbackBody = z.object({
  studentId: z.string().uuid(),
  feedback: z.string().max(2000),
});

function forbidden() {
  return NextResponse.json(
    { error: { code: "forbidden", message: "You do not have permission to leave feedback here." } },
    { status: 403 },
  );
}

function notFound() {
  return NextResponse.json(
    { error: { code: "not_found", message: "Assignment not found." } },
    { status: 404 },
  );
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.safeParse(id).success) return notFound();

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Sign in to continue." } },
      { status: 401 },
    );
  }

  const parsed = FeedbackBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "Invalid request body." } },
      { status: 400 },
    );
  }

  const { studentId, feedback } = parsed.data;

  const db = await getDb();

  // Verify: calling user is the teacher of this assignment's class.
  const rows = await db
    .select({ teacherId: classes.teacherId })
    .from(assignments)
    .innerJoin(classes, eq(classes.id, assignments.classId))
    .where(eq(assignments.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return notFound();
  if (row.teacherId !== user.id) return forbidden();

  // Update the submission.
  const updated = await db
    .update(submissions)
    .set({ feedback, feedbackUpdatedAt: new Date() })
    .where(and(eq(submissions.assignmentId, id), eq(submissions.studentId, studentId)))
    .returning();

  if (updated.length === 0) return notFound();

  return NextResponse.json({ submission: updated[0] });
}
