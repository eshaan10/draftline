import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { withTransaction, type Tx } from "./tx";
import {
  assignments,
  classMembers,
  docEvents,
  documents,
  submissions,
} from "./schema";

const BLANK_DOC = { type: "doc", content: [{ type: "paragraph" }] } as const;

// Core transactional write: one student copy, one submission row, and a seq-0
// import-kind checkpoint event so B4's replay can start from here. Match the
// event shape used by src/app/api/import/route.ts and
// src/features/replay/recorder.ts exactly.
export async function createCopyForMember(
  tx: Tx,
  opts: {
    assignmentId: string;
    studentId: string;
    title: string;
    content: unknown;
  },
): Promise<{ documentId: string; submissionId: string }> {
  const [doc] = await tx
    .insert(documents)
    .values({
      ownerId: opts.studentId,
      title: opts.title,
      content: opts.content as object,
      assignmentId: opts.assignmentId,
    })
    .returning();

  const [sub] = await tx
    .insert(submissions)
    .values({
      assignmentId: opts.assignmentId,
      studentId: opts.studentId,
      documentId: doc.id,
      status: "not_started",
      isLate: false,
    })
    .returning();

  await tx.insert(docEvents).values({
    documentId: doc.id,
    seq: 0,
    userId: opts.studentId,
    kind: "import",
    steps: [],
    inserted: 0,
    deleted: 0,
    checkpoint: opts.content as object,
    clientT: 0,
  });

  return { documentId: doc.id, submissionId: sub.id };
}

// Called from activatePendingForUser (auth.ts) and from newly-activated class
// members. For every active class membership, ensure a copy exists for every
// assignment in that class. All inserts for a given assignment go through one
// withTransaction so a mid-flight failure never leaves a doc without a
// submission or an event.
export async function materializeCopiesForUser(user: {
  id: string;
  email: string;
}): Promise<void> {
  const db = await getDb();
  const memberships = await db
    .select({ classId: classMembers.classId })
    .from(classMembers)
    .where(
      and(eq(classMembers.userId, user.id), eq(classMembers.status, "active")),
    );
  if (memberships.length === 0) return;

  const toCreate: Array<{ assignmentId: string; title: string; content: unknown }> = [];
  for (const m of memberships) {
    const asmts = await db
      .select()
      .from(assignments)
      .where(eq(assignments.classId, m.classId));
    for (const a of asmts) {
      const existing = await db
        .select({ id: submissions.id })
        .from(submissions)
        .where(
          and(
            eq(submissions.assignmentId, a.id),
            eq(submissions.studentId, user.id),
          ),
        )
        .limit(1);
      if (existing.length > 0) continue;

      let content: unknown = BLANK_DOC;
      if (a.templateDocId) {
        const t = await db
          .select({ content: documents.content })
          .from(documents)
          .where(eq(documents.id, a.templateDocId))
          .limit(1);
        content = t[0]?.content ?? BLANK_DOC;
      }
      toCreate.push({ assignmentId: a.id, title: a.title, content });
    }
  }

  if (toCreate.length === 0) return;

  await withTransaction(async (tx) => {
    for (const item of toCreate) {
      await createCopyForMember(tx, {
        assignmentId: item.assignmentId,
        studentId: user.id,
        title: item.title,
        content: item.content,
      });
    }
  });
}

export { BLANK_DOC };
