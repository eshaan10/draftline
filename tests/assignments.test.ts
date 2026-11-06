import { beforeAll, describe, expect, it, vi } from "vitest";
import type { User } from "@/server/schema";

const session = { current: null as User | null };

vi.mock("next/headers", () => ({
  cookies: async () => ({ set() {}, get() { return undefined; }, delete() {} }),
}));

vi.mock("@/server/auth", async () => {
  const actual = await vi.importActual<typeof import("@/server/auth")>("@/server/auth");
  return {
    ...actual,
    getSessionUser: async () => session.current,
  };
});

const { getDb } = await import("@/server/db");
const schemaMod = await import("@/server/schema");
const authMod = await import("@/server/auth");
const submitMod = await import("@/server/submit");
const txMod = await import("@/server/tx");
const bcryptMod = await import("bcryptjs");
const bcrypt = bcryptMod.default ?? bcryptMod;

const classesRoute = await import("@/app/api/classes/route");
const classesOne = await import("@/app/api/classes/[id]/route");
const classMembersRoute = await import("@/app/api/classes/[id]/members/route");
const classMembersOne = await import("@/app/api/classes/[id]/members/[memberId]/route");
const assignmentsRoute = await import("@/app/api/assignments/route");
const assignmentsOne = await import("@/app/api/assignments/[id]/route");
const docsOne = await import("@/app/api/docs/[id]/route");

const { users, classes, classMembers, assignments, submissions, documents, docEvents } = schemaMod;

function jsonReq(path: string, method: string, body?: unknown) {
  return new Request(`http://local${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

async function makeUser(email: string, role: "teacher" | "student" = "student"): Promise<User> {
  const db = await getDb();
  const [u] = await db
    .insert(users)
    .values({
      email,
      name: email.split("@")[0],
      role,
      passwordHash: await bcrypt.hash("password", 4),
    })
    .returning();
  return u;
}

async function makeClass(teacher: User, name: string) {
  session.current = teacher;
  const res = await classesRoute.POST(jsonReq("/api/classes", "POST", { name }));
  expect(res.status).toBe(201);
  const body = await res.json();
  return body.class as typeof classes.$inferSelect;
}

async function addStudent(teacher: User, classId: string, email: string) {
  session.current = teacher;
  const res = await classMembersRoute.POST(
    jsonReq(`/api/classes/${classId}/members`, "POST", { email }),
    { params: Promise.resolve({ id: classId }) },
  );
  return (await res.json()).member;
}

async function makeAssignment(
  teacher: User,
  classId: string,
  opts: { title?: string; dueAt?: Date; instructions?: unknown; templateDocId?: string | null } = {},
) {
  session.current = teacher;
  const body = {
    classId,
    title: opts.title ?? "Essay",
    dueAt: (opts.dueAt ?? new Date(Date.now() + 86_400_000)).toISOString(),
    instructions: opts.instructions ?? { type: "doc", content: [{ type: "paragraph" }] },
    templateDocId: opts.templateDocId ?? null,
  };
  const res = await assignmentsRoute.POST(jsonReq("/api/assignments", "POST", body));
  return { status: res.status, body: await res.json() };
}

describe("assignment creation", () => {
  let teacher: User;
  let ana: User;
  let ben: User;
  let classId: string;

  beforeAll(async () => {
    teacher = await makeUser("rivera-asmt@matrix.test", "teacher");
    ana = await makeUser("ana-asmt@matrix.test");
    ben = await makeUser("ben-asmt@matrix.test");
    const cls = await makeClass(teacher, "English 101");
    classId = cls.id;
    await addStudent(teacher, classId, ana.email);
    await addStudent(teacher, classId, ben.email);
  });

  it("creates one submission + copy doc + seq-0 import event per active member", async () => {
    const { status, body } = await makeAssignment(teacher, classId, { title: "Essay 1" });
    expect(status).toBe(201);
    const assignmentId = body.assignment.id as string;

    const db = await getDb();
    const { eq } = await import("drizzle-orm");
    const subs = await db.select().from(submissions).where(eq(submissions.assignmentId, assignmentId));
    expect(subs.length).toBe(2);
    const docs = await db.select().from(documents).where(eq(documents.assignmentId, assignmentId));
    expect(docs.length).toBe(2);
    for (const d of docs) {
      const evs = await db.select().from(docEvents).where(eq(docEvents.documentId, d.id));
      expect(evs.length).toBe(1);
      expect(evs[0].seq).toBe(0);
      expect(evs[0].kind).toBe("import");
      expect(evs[0].checkpoint).toBeTruthy();
    }
  });

  it("withTransaction rolls back on failure: no rows persist from the failed call", async () => {
    const db = await getDb();
    const { eq } = await import("drizzle-orm");
    const before = (await db.select().from(assignments)).length;
    await expect(
      txMod.withTransaction(async (tx) => {
        await tx.insert(assignments).values({
          classId,
          teacherId: teacher.id,
          title: "Will be rolled back",
          instructions: { type: "doc", content: [] },
          dueAt: new Date(),
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const after = (await db.select().from(assignments)).length;
    expect(after).toBe(before);
    // Verify the rolled-back title is nowhere.
    const matches = await db
      .select()
      .from(assignments)
      .where(eq(assignments.title, "Will be rolled back"));
    expect(matches.length).toBe(0);
  });

  it("copies are independent of the template (editing the template later does not change copies)", async () => {
    // Make a template doc owned by the teacher with distinctive content.
    const db = await getDb();
    const original = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "ORIGINAL" }] }],
    };
    const [tpl] = await db
      .insert(documents)
      .values({ ownerId: teacher.id, title: "Template", content: original })
      .returning();

    const { status, body } = await makeAssignment(teacher, classId, {
      title: "Essay 2",
      templateDocId: tpl.id,
    });
    expect(status).toBe(201);
    const aid = body.assignment.id as string;

    // Mutate the template after the assignment is created.
    const { eq } = await import("drizzle-orm");
    await db
      .update(documents)
      .set({ content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "CHANGED" }] }] } })
      .where(eq(documents.id, tpl.id));

    const copies = await db.select().from(documents).where(eq(documents.assignmentId, aid));
    expect(copies.length).toBe(2);
    for (const c of copies) {
      expect(JSON.stringify(c.content)).toContain("ORIGINAL");
      expect(JSON.stringify(c.content)).not.toContain("CHANGED");
    }
  });
});

describe("teacher access to a student's copy", () => {
  let teacher: User;
  let strangerTeacher: User;
  let student: User;
  let docId: string;

  beforeAll(async () => {
    teacher = await makeUser("tch1@matrix.test", "teacher");
    strangerTeacher = await makeUser("tch2@matrix.test", "teacher");
    student = await makeUser("stu1@matrix.test");
    const cls = await makeClass(teacher, "Section A");
    await addStudent(teacher, cls.id, student.email);
    const { body } = await makeAssignment(teacher, cls.id, { title: "T1" });
    const db = await getDb();
    const { eq } = await import("drizzle-orm");
    const copies = await db
      .select()
      .from(documents)
      .where(eq(documents.assignmentId, body.assignment.id));
    docId = copies[0].id;
  });

  it("teacher of the assignment sees commenter access and gets 403 on PUT", async () => {
    session.current = teacher;
    const getRes = await docsOne.GET(jsonReq(`/api/docs/${docId}`, "GET"), {
      params: Promise.resolve({ id: docId }),
    });
    expect(getRes.status).toBe(200);
    const got = await getRes.json();
    expect(got.access).toBe("commenter");

    const putRes = await docsOne.PUT(
      jsonReq(`/api/docs/${docId}`, "PUT", {
        content: { type: "doc", content: [] },
        baseVersion: got.document.version,
      }),
      { params: Promise.resolve({ id: docId }) },
    );
    expect(putRes.status).toBe(403);
  });

  it("stranger teacher gets 404 (existence does not leak)", async () => {
    session.current = strangerTeacher;
    const getRes = await docsOne.GET(jsonReq(`/api/docs/${docId}`, "GET"), {
      params: Promise.resolve({ id: docId }),
    });
    expect(getRes.status).toBe(404);
  });
});

describe("late computation at the deadline boundary", () => {
  let teacher: User;
  let student: User;
  let dueAt: Date;
  let assignmentId: string;

  beforeAll(async () => {
    teacher = await makeUser("late-tch@matrix.test", "teacher");
    student = await makeUser("late-stu@matrix.test");
    const cls = await makeClass(teacher, "Boundary");
    await addStudent(teacher, cls.id, student.email);
    dueAt = new Date("2026-05-01T12:00:00Z");
    const { body } = await makeAssignment(teacher, cls.id, { dueAt, title: "Late test" });
    assignmentId = body.assignment.id;
  });

  it("is on time one second before the deadline", async () => {
    const result = await submitMod.performSubmit({
      userId: student.id,
      assignmentId,
      now: new Date(dueAt.getTime() - 1000),
    });
    expect("ok" in result && result.ok).toBe(true);
    if ("ok" in result) {
      expect(result.submission.isLate).toBe(false);
    }
  });

  it("is on time exactly at the deadline (not greater than due_at)", async () => {
    // Resubmit at exactly due_at.
    const result = await submitMod.performSubmit({
      userId: student.id,
      assignmentId,
      now: new Date(dueAt.getTime()),
    });
    expect("ok" in result && result.ok).toBe(true);
    if ("ok" in result) {
      expect(result.submission.isLate).toBe(false);
    }
  });

  it("is late one second after the deadline; doc then locks", async () => {
    // Reset status so the student can submit again at the new time.
    // They've already submitted on time once; a submit at now > due should be
    // blocked because isSubmissionLocked returns true (already submitted + past due).
    const result = await submitMod.performSubmit({
      userId: student.id,
      assignmentId,
      now: new Date(dueAt.getTime() + 1000),
    });
    expect("error" in result && result.error === "locked").toBe(true);
  });

  it("unsubmitted student can submit once after the deadline and it is marked late", async () => {
    const otherStudent = await makeUser("late-other@matrix.test");
    const db = await getDb();
    const { eq, and } = await import("drizzle-orm");
    // Attach them as an active class member for this assignment's class.
    const a = (
      await db.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1)
    )[0];
    await db.insert(classMembers).values({
      classId: a.classId,
      userId: otherStudent.id,
      email: otherStudent.email,
      status: "active",
    });
    // No copy exists for them because they joined after creation; create one
    // manually to simulate the "joined late then there's a doc" state.
    const [doc] = await db
      .insert(documents)
      .values({
        ownerId: otherStudent.id,
        title: a.title,
        content: { type: "doc", content: [{ type: "paragraph" }] },
        assignmentId: a.id,
      })
      .returning();
    await db.insert(submissions).values({
      assignmentId: a.id,
      studentId: otherStudent.id,
      documentId: doc.id,
      status: "not_started",
      isLate: false,
    });

    const result = await submitMod.performSubmit({
      userId: otherStudent.id,
      assignmentId,
      now: new Date(dueAt.getTime() + 60_000),
    });
    expect("ok" in result && result.ok).toBe(true);
    if ("ok" in result) {
      expect(result.submission.isLate).toBe(true);
    }

    // A second submit attempt should now be locked.
    const again = await submitMod.performSubmit({
      userId: otherStudent.id,
      assignmentId,
      now: new Date(dueAt.getTime() + 120_000),
    });
    expect("error" in again && again.error === "locked").toBe(true);
  });
});

describe("resubmit behavior", () => {
  let teacher: User;
  let student: User;
  let assignmentId: string;

  beforeAll(async () => {
    teacher = await makeUser("rs-tch@matrix.test", "teacher");
    student = await makeUser("rs-stu@matrix.test");
    const cls = await makeClass(teacher, "Resubmit");
    await addStudent(teacher, cls.id, student.email);
    const { body } = await makeAssignment(teacher, cls.id, {
      dueAt: new Date(Date.now() + 86_400_000),
      title: "Resubmit test",
    });
    assignmentId = body.assignment.id;
  });

  it("resubmit before the deadline updates submitted_at but keeps first_submitted_at", async () => {
    const t1 = new Date("2026-04-01T10:00:00Z");
    const t2 = new Date("2026-04-01T11:30:00Z");
    const first = await submitMod.performSubmit({
      userId: student.id,
      assignmentId,
      now: t1,
    });
    expect("ok" in first && first.ok).toBe(true);
    const second = await submitMod.performSubmit({
      userId: student.id,
      assignmentId,
      now: t2,
    });
    expect("ok" in second && second.ok).toBe(true);
    if ("ok" in first && "ok" in second) {
      expect(second.submission.firstSubmittedAt?.toISOString()).toBe(
        first.submission.firstSubmittedAt?.toISOString(),
      );
      expect(second.submission.submittedAt?.toISOString()).toBe(t2.toISOString());
    }
  });
});

describe("pending class member activation creates copies", () => {
  it("a student who signs up after an assignment exists gets a copy on signup", async () => {
    const teacher = await makeUser("late-join-tch@matrix.test", "teacher");
    const cls = await makeClass(teacher, "LateJoin");
    const pendingEmail = "pending-join@matrix.test";
    await addStudent(teacher, cls.id, pendingEmail);
    const { body } = await makeAssignment(teacher, cls.id, { title: "Pending test" });
    const aid = body.assignment.id as string;

    // Before signup: no copy exists for pendingEmail.
    const db = await getDb();
    const { eq } = await import("drizzle-orm");
    const beforeDocs = await db
      .select()
      .from(documents)
      .where(eq(documents.assignmentId, aid));
    expect(beforeDocs.length).toBe(0);

    session.current = null;
    const result = await authMod.signup({
      email: pendingEmail,
      name: "Late Joiner",
      password: "password123",
      role: "student",
    });
    expect("user" in result).toBe(true);

    const afterDocs = await db
      .select()
      .from(documents)
      .where(eq(documents.assignmentId, aid));
    expect(afterDocs.length).toBe(1);
    if ("user" in result) {
      expect(afterDocs[0].ownerId).toBe(result.user.id);
    }
    const afterSubs = await db
      .select()
      .from(submissions)
      .where(eq(submissions.assignmentId, aid));
    expect(afterSubs.length).toBe(1);
    const afterEvents = await db
      .select()
      .from(docEvents)
      .where(eq(docEvents.documentId, afterDocs[0].id));
    expect(afterEvents.length).toBe(1);
    expect(afterEvents[0].kind).toBe("import");
    expect(afterEvents[0].seq).toBe(0);
  });
});
