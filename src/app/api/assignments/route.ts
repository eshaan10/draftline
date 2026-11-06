import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import {
  assignments,
  classMembers,
  classes,
  documents,
  submissions,
} from "@/server/schema";
import { withTransaction } from "@/server/tx";
import { BLANK_DOC, createCopyForMember } from "@/server/assignmentCopies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json(
    { error: { code: "unauthorized", message: "Sign in to continue." } },
    { status: 401 },
  );
}

function forbidden() {
  return NextResponse.json(
    { error: { code: "forbidden", message: "Only teachers can create assignments." } },
    { status: 403 },
  );
}

function badRequest(message: string) {
  return NextResponse.json({ error: { code: "bad_request", message } }, { status: 400 });
}

// GET /api/assignments: for teachers, list all their assignments; for students,
// list all assignments whose class they are an active member of.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const db = await getDb();

  if (user.role === "teacher") {
    const rows = await db
      .select({
        assignment: assignments,
        className: classes.name,
      })
      .from(assignments)
      .innerJoin(classes, eq(classes.id, assignments.classId))
      .where(eq(assignments.teacherId, user.id))
      .orderBy(desc(assignments.createdAt));
    return NextResponse.json({
      assignments: rows.map((r) => ({ ...r.assignment, className: r.className })),
    });
  }

  // Student view: via active class membership. Also returns the student's
  // own submission row so the UI can show status.
  const memberRows = await db
    .select({ classId: classMembers.classId })
    .from(classMembers)
    .where(
      and(eq(classMembers.userId, user.id), eq(classMembers.status, "active")),
    );
  const classIds = memberRows.map((m) => m.classId);
  if (classIds.length === 0) {
    return NextResponse.json({ assignments: [] });
  }
  const rows = await db
    .select({
      assignment: assignments,
      className: classes.name,
      submission: submissions,
    })
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
  return NextResponse.json({
    assignments: rows.map((r) => ({
      ...r.assignment,
      className: r.className,
      submission: r.submission,
    })),
  });
}

const EMPTY_INSTRUCTIONS = { type: "doc", content: [{ type: "paragraph" }] } as const;

const createSchema = z.object({
  classId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  instructions: z.unknown().optional(),
  dueAt: z.string(),
  templateDocId: z.string().uuid().nullable().optional(),
});

// POST /api/assignments: create an assignment and fan out one submission +
// student-owned document copy + seq-0 import event per active class member.
// Everything runs inside withTransaction so a mid-flight failure (e.g. a bad
// template content or an FK race) leaves nothing behind.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== "teacher") return forbidden();

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return badRequest("Fill in title, class, and due date.");

  const dueAt = new Date(parsed.data.dueAt);
  if (Number.isNaN(dueAt.getTime())) return badRequest("Due date is not a valid date.");

  const db = await getDb();
  const cls = (
    await db.select().from(classes).where(eq(classes.id, parsed.data.classId)).limit(1)
  )[0];
  if (!cls || cls.teacherId !== user.id) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Class not found." } },
      { status: 404 },
    );
  }

  // Resolve template content outside the tx so the tx stays small.
  let templateContent: unknown = EMPTY_INSTRUCTIONS;
  if (parsed.data.templateDocId) {
    const t = (
      await db
        .select({ ownerId: documents.ownerId, content: documents.content })
        .from(documents)
        .where(eq(documents.id, parsed.data.templateDocId))
        .limit(1)
    )[0];
    if (!t || t.ownerId !== user.id) {
      return badRequest("Pick a template document you own.");
    }
    templateContent = t.content;
  } else {
    templateContent = BLANK_DOC;
  }

  const members = await db
    .select({ userId: classMembers.userId })
    .from(classMembers)
    .where(
      and(
        eq(classMembers.classId, cls.id),
        eq(classMembers.status, "active"),
      ),
    );
  const activeStudentIds = members
    .map((m) => m.userId)
    .filter((v): v is string => typeof v === "string");

  const assignment = await withTransaction(async (tx) => {
    const [a] = await tx
      .insert(assignments)
      .values({
        classId: cls.id,
        teacherId: user.id,
        title: parsed.data.title,
        instructions: (parsed.data.instructions ?? EMPTY_INSTRUCTIONS) as object,
        dueAt,
        templateDocId: parsed.data.templateDocId ?? null,
      })
      .returning();

    for (const studentId of activeStudentIds) {
      await createCopyForMember(tx, {
        assignmentId: a.id,
        studentId,
        title: parsed.data.title,
        content: templateContent,
      });
    }

    return a;
  });

  return NextResponse.json({ assignment }, { status: 201 });
}
