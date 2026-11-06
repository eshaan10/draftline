import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import {
  assignments,
  classMembers,
  classes,
  submissions,
  users,
} from "@/server/schema";
import { TeacherAssignmentDashboard } from "@/features/assignments/TeacherAssignmentDashboard";
import { StudentAssignmentPage } from "@/features/assignments/StudentAssignmentPage";

export const dynamic = "force-dynamic";

const UUID = z.string().uuid();

export default async function AssignmentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.safeParse(id).success) notFound();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const db = await getDb();
  const rows = await db
    .select({
      assignment: assignments,
      className: classes.name,
      classTeacherId: classes.teacherId,
    })
    .from(assignments)
    .innerJoin(classes, eq(classes.id, assignments.classId))
    .where(eq(assignments.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) notFound();

  if (user.role === "teacher" && row.classTeacherId === user.id) {
    const studentRows = await db
      .select({
        submission: submissions,
        user: users,
      })
      .from(submissions)
      .innerJoin(users, eq(users.id, submissions.studentId))
      .where(eq(submissions.assignmentId, id));

    return (
      <TeacherAssignmentDashboard
        user={{ id: user.id, name: user.name }}
        assignment={{
          id: row.assignment.id,
          title: row.assignment.title,
          className: row.className,
          dueAt: row.assignment.dueAt.toISOString(),
          classId: row.assignment.classId,
        }}
        students={studentRows.map((s) => ({
          id: s.user.id,
          name: s.user.name,
          email: s.user.email,
          submissionStatus: s.submission.status,
          isLate: s.submission.isLate,
          submittedAt: s.submission.submittedAt?.toISOString() ?? null,
          documentId: s.submission.documentId,
        }))}
      />
    );
  }

  // Student view.
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
  if (member.length === 0) notFound();

  const mine = (
    await db
      .select()
      .from(submissions)
      .where(
        and(eq(submissions.assignmentId, id), eq(submissions.studentId, user.id)),
      )
      .limit(1)
  )[0];
  if (!mine) notFound();

  return (
    <StudentAssignmentPage
      user={{ id: user.id, name: user.name }}
      assignment={{
        id: row.assignment.id,
        title: row.assignment.title,
        className: row.className,
        dueAt: row.assignment.dueAt.toISOString(),
        instructions: row.assignment.instructions,
      }}
      submission={{
        id: mine.id,
        documentId: mine.documentId,
        status: mine.status,
        isLate: mine.isLate,
        submittedAt: mine.submittedAt?.toISOString() ?? null,
        firstSubmittedAt: mine.firstSubmittedAt?.toISOString() ?? null,
      }}
    />
  );
}
