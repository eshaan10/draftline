import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import {
  assignments,
  classes,
  classMembers,
  submissions,
  users,
} from "@/server/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = z.string().uuid();

function notFound() {
  return NextResponse.json(
    { error: { code: "not_found", message: "Assignment not found." } },
    { status: 404 },
  );
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.safeParse(id).success) return notFound();
  const user = await getSessionUser();
  if (!user) return notFound();

  const db = await getDb();
  const rows = await db
    .select({ assignment: assignments, className: classes.name, classTeacherId: classes.teacherId })
    .from(assignments)
    .innerJoin(classes, eq(classes.id, assignments.classId))
    .where(eq(assignments.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return notFound();

  if (user.role === "teacher" && row.classTeacherId === user.id) {
    // Teacher view: full student table.
    const studentRows = await db
      .select({
        submission: submissions,
        user: users,
      })
      .from(submissions)
      .innerJoin(users, eq(users.id, submissions.studentId))
      .where(eq(submissions.assignmentId, id));
    return NextResponse.json({
      role: "teacher",
      assignment: { ...row.assignment, className: row.className },
      students: studentRows.map((s) => ({
        id: s.user.id,
        name: s.user.name,
        email: s.user.email,
        submission: s.submission,
      })),
    });
  }

  // Student view: only if they are an active member of the class.
  const member = await db
    .select()
    .from(classMembers)
    .where(
      and(
        eq(classMembers.classId, row.assignment.classId),
        eq(classMembers.userId, user.id),
        eq(classMembers.status, "active"),
      ),
    )
    .limit(1);
  if (member.length === 0) return notFound();

  const mine = (
    await db
      .select()
      .from(submissions)
      .where(
        and(eq(submissions.assignmentId, id), eq(submissions.studentId, user.id)),
      )
      .limit(1)
  )[0];

  return NextResponse.json({
    role: "student",
    assignment: { ...row.assignment, className: row.className },
    submission: mine,
  });
}
