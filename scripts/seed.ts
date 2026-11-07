// Demo story seed -- idempotent, safe to run multiple times.
//
// Story:
//   Ms. Rivera teaches "Period 3 English".
//   "Personal essay" due in 3 days:
//     Ana -- realistic typing + paste history (Replay works on first click)
//     Ben -- not started
//     Cam -- submitted on time
//   "Reading response" due 2 days ago:
//     Dee -- submitted late (shows Late badge)
//   "Class syllabus" shared: Ana (viewer), Ben (editor), newstudent@demo.test (pending).

import { config } from "dotenv";
config({ path: ".env.local" });

import bcrypt from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../src/server/db";
import {
  assignments,
  classMembers,
  classes,
  docEvents,
  documents,
  documentShares,
  submissions,
  users,
} from "../src/server/schema";
import { withTransaction } from "../src/server/tx";
import { createCopyForMember } from "../src/server/assignmentCopies";

import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Node as PMNode, Slice, Fragment } from "@tiptap/pm/model";
import { ReplaceStep } from "@tiptap/pm/transform";

const schema = getSchema([StarterKit]);
const BLANK_DOC = { type: "doc", content: [{ type: "paragraph" }] } as const;

function daysFromNow(d: number): Date {
  const t = new Date();
  t.setDate(t.getDate() + d);
  return t;
}

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3_600_000);
}

function findText(doc: PMNode, text: string): number {
  let found = -1;
  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (node.isText && node.text?.includes(text) && found === -1) {
      found = pos + node.text.indexOf(text);
    }
  });
  return found;
}

/** Insert plain text at [from, to) in the doc. Returns the new doc and the step JSON. */
function pmInsertText(
  doc: PMNode,
  text: string,
  from: number,
  to = from,
): { doc: PMNode; stepJson: object } {
  const slice = new Slice(Fragment.from(schema.text(text)), 0, 0);
  const step = new ReplaceStep(from, to, slice);
  const result = step.apply(doc);
  if (!result.doc) throw new Error(`pmInsertText failed: ${result.failed}`);
  return { doc: result.doc, stepJson: step.toJSON() };
}

/** Append a paragraph node at the end of the doc. */
function pmAppendParagraph(
  doc: PMNode,
  text: string,
): { doc: PMNode; stepJson: object } {
  const para = schema.node("paragraph", null, schema.text(text));
  const slice = new Slice(Fragment.from(para), 0, 0);
  const step = new ReplaceStep(doc.content.size, doc.content.size, slice);
  const result = step.apply(doc);
  if (!result.doc) throw new Error(`pmAppendParagraph failed: ${result.failed}`);
  return { doc: result.doc, stepJson: step.toJSON() };
}

const DEMO_USERS = [
  { email: "rivera@demo.test", name: "Ms. Rivera", role: "teacher" as const },
  { email: "ana@demo.test",    name: "Ana",        role: "student" as const },
  { email: "ben@demo.test",    name: "Ben",        role: "student" as const },
  { email: "cam@demo.test",    name: "Cam",        role: "student" as const },
  { email: "dee@demo.test",    name: "Dee",        role: "student" as const },
];

async function main() {
  const db = await getDb();
  const passwordHash = await bcrypt.hash("demo1234", 10);

  // ---- 1. Users ----------------------------------------------------------
  for (const u of DEMO_USERS) {
    await db
      .insert(users)
      .values({ ...u, passwordHash })
      .onConflictDoNothing({ target: users.email });
  }
  const allUsers = await db
    .select()
    .from(users)
    .where(inArray(users.email, DEMO_USERS.map((u) => u.email)));
  const byEmail = Object.fromEntries(allUsers.map((u) => [u.email, u]));
  const rivera = byEmail["rivera@demo.test"];
  const ana    = byEmail["ana@demo.test"];
  const ben    = byEmail["ben@demo.test"];
  const cam    = byEmail["cam@demo.test"];
  const dee    = byEmail["dee@demo.test"];
  console.log("Users ready.");

  // ---- 2. Class ----------------------------------------------------------
  let cls = (await db
    .select().from(classes)
    .where(and(eq(classes.teacherId, rivera.id), eq(classes.name, "Period 3 English")))
    .limit(1))[0];
  if (!cls) {
    [cls] = await db.insert(classes)
      .values({ teacherId: rivera.id, name: "Period 3 English" })
      .returning();
    console.log("Created class:", cls.name);
  }

  // ---- 3. Class members --------------------------------------------------
  for (const student of [ana, ben, cam, dee]) {
    const existing = await db
      .select().from(classMembers)
      .where(and(eq(classMembers.classId, cls.id), eq(classMembers.userId, student.id)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(classMembers).values({
        classId: cls.id, userId: student.id, email: student.email, status: "active",
      });
    }
  }

  // ---- 4. Template doc for "Personal essay" ------------------------------
  let templateDoc = (await db
    .select().from(documents)
    .where(and(eq(documents.ownerId, rivera.id), eq(documents.title, "Personal essay -- template")))
    .limit(1))[0];
  if (!templateDoc) {
    [templateDoc] = await db.insert(documents).values({
      ownerId: rivera.id,
      title: "Personal essay -- template",
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Title:" }] },
          { type: "paragraph" },
          { type: "paragraph", content: [{ type: "text", text: "Introduction (hook and thesis):" }] },
          { type: "paragraph" },
          { type: "paragraph", content: [{ type: "text", text: "Body paragraph 1:" }] },
          { type: "paragraph" },
          { type: "paragraph", content: [{ type: "text", text: "Body paragraph 2:" }] },
          { type: "paragraph" },
          { type: "paragraph", content: [{ type: "text", text: "Conclusion:" }] },
        ],
      },
    }).returning();
    console.log("Created template doc.");
  }

  // ---- 5. Assignment: "Personal essay" (due in 3 days) -------------------
  let essayAssignment = (await db
    .select().from(assignments)
    .where(and(eq(assignments.classId, cls.id), eq(assignments.title, "Personal essay")))
    .limit(1))[0];
  if (!essayAssignment) {
    [essayAssignment] = await db.insert(assignments).values({
      classId: cls.id,
      teacherId: rivera.id,
      title: "Personal essay",
      instructions: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", marks: [{ type: "bold" }], text: "Personal Essay Assignment" }] },
          { type: "paragraph", content: [{ type: "text", text: "Write a 3 to 5 paragraph personal essay about an experience from this past year that taught you something meaningful about yourself or your community." }] },
          { type: "paragraph", content: [{ type: "text", text: "Requirements:" }] },
          { type: "bulletList", content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Minimum 300 words" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Clear introduction, body paragraphs, and conclusion" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Specific details and real examples" }] }] },
          ]},
        ],
      },
      dueAt: daysFromNow(3),
      templateDocId: templateDoc.id,
    }).returning();
    console.log("Created assignment: Personal essay");
  }

  for (const student of [ana, ben, cam, dee]) {
    const existing = await db
      .select().from(submissions)
      .where(and(eq(submissions.assignmentId, essayAssignment.id), eq(submissions.studentId, student.id)))
      .limit(1);
    if (existing.length === 0) {
      await withTransaction(async (tx) => {
        await createCopyForMember(tx, {
          assignmentId: essayAssignment.id,
          studentId: student.id,
          title: essayAssignment.title,
          content: templateDoc.content,
        });
      });
      console.log(`  Created copy for ${student.name}`);
    }
  }

  // ---- 6. Ana's realistic typing history --------------------------------
  const anaSub = (await db
    .select().from(submissions)
    .where(and(eq(submissions.assignmentId, essayAssignment.id), eq(submissions.studentId, ana.id)))
    .limit(1))[0];

  if (anaSub) {
    const hasHistory = (await db
      .select({ seq: docEvents.seq }).from(docEvents)
      .where(and(eq(docEvents.documentId, anaSub.documentId), eq(docEvents.seq, 1)))).length > 0;

    if (!hasHistory) {
      let doc = PMNode.fromJSON(schema, BLANK_DOC);
      let clientT = 0;
      const eventsToInsert: Array<typeof docEvents.$inferInsert> = [];

      // seq 1: type the essay title into the first paragraph
      {
        const r = pmInsertText(doc, "Personal Essay: My Summer Experience", 1);
        doc = r.doc;
        clientT += 3200;
        eventsToInsert.push({ documentId: anaSub.documentId, seq: 1, userId: ana.id, kind: "type", steps: [r.stepJson], inserted: 36, deleted: 0, checkpoint: null, clientT });
      }

      // seq 2: type a body paragraph
      {
        const bodyText = "This past summer was unlike any other. I spent most of my time volunteering at the local library, helping coordinate the summer reading program for elementary school kids.";
        const r = pmAppendParagraph(doc, bodyText);
        doc = r.doc;
        clientT += 9100;
        eventsToInsert.push({ documentId: anaSub.documentId, seq: 2, userId: ana.id, kind: "type", steps: [r.stepJson], inserted: bodyText.length, deleted: 0, checkpoint: null, clientT });
      }

      // seq 3: paste a paragraph (kind="paste" so replay highlights it)
      {
        const pasteText = "Reading aloud to younger students taught me that patience is as important as knowledge. Watching their faces light up when a story got exciting made every afternoon worth it.";
        const r = pmAppendParagraph(doc, pasteText);
        doc = r.doc;
        clientT += 1800;
        eventsToInsert.push({ documentId: anaSub.documentId, seq: 3, userId: ana.id, kind: "paste", steps: [r.stepJson], inserted: pasteText.length, deleted: 0, checkpoint: null, clientT });
      }

      // seq 4: type the conclusion (after a 70s idle gap so facts show 2 sessions)
      {
        const conclusionText = "This experience changed how I think about leadership. I plan to continue volunteering and hope to inspire others in my class to do the same.";
        const r = pmAppendParagraph(doc, conclusionText);
        doc = r.doc;
        clientT += 70_000 + 7400;
        eventsToInsert.push({ documentId: anaSub.documentId, seq: 4, userId: ana.id, kind: "type", steps: [r.stepJson], inserted: conclusionText.length, deleted: 0, checkpoint: null, clientT });
      }

      // seq 5: edit -- replace "inspire" with "motivate" (checkpoint included)
      {
        const pos = findText(doc, "inspire");
        if (pos >= 0) {
          const r = pmInsertText(doc, "motivate", pos, pos + "inspire".length);
          doc = r.doc;
          clientT += 4600;
          eventsToInsert.push({ documentId: anaSub.documentId, seq: 5, userId: ana.id, kind: "type", steps: [r.stepJson], inserted: 8, deleted: 7, checkpoint: doc.toJSON(), clientT });
        }
      }

      await db.insert(docEvents).values(eventsToInsert);
      await db.update(documents).set({ content: doc.toJSON() }).where(eq(documents.id, anaSub.documentId));
      await db.update(submissions).set({ status: "in_progress" }).where(eq(submissions.id, anaSub.id));
      console.log(`  Added ${eventsToInsert.length} events for Ana (Replay ready)`);
    }
  }

  // ---- 7. Cam: submitted on time ----------------------------------------
  const camSub = (await db
    .select().from(submissions)
    .where(and(eq(submissions.assignmentId, essayAssignment.id), eq(submissions.studentId, cam.id)))
    .limit(1))[0];
  if (camSub && camSub.status !== "submitted") {
    await db.update(documents).set({
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Lessons from the Garden" }] },
          { type: "paragraph", content: [{ type: "text", text: "Last spring I planted a vegetable garden for the first time. What seemed simple turned into one of the most humbling experiences of my life. Plants do not follow instructions; they follow sun, water, and time." }] },
          { type: "paragraph", content: [{ type: "text", text: "I learned that patience and consistent effort matter more than enthusiasm alone. Every day I showed up, watered, pulled weeds, and waited. The tomatoes that finally grew tasted better than any I had bought at the store." }] },
          { type: "paragraph", content: [{ type: "text", text: "I plan to expand the garden next year and teach my younger brother how to grow his own food. Small skills, practiced regularly, build into something real." }] },
        ],
      },
    }).where(eq(documents.id, camSub.documentId));
    await db.update(submissions).set({
      status: "submitted", isLate: false,
      firstSubmittedAt: hoursAgo(14), submittedAt: hoursAgo(14),
    }).where(eq(submissions.id, camSub.id));
    console.log("  Marked Cam submitted on time");
  }

  // ---- 8. Assignment: "Reading response" (due 2 days ago) ----------------
  let readingAssignment = (await db
    .select().from(assignments)
    .where(and(eq(assignments.classId, cls.id), eq(assignments.title, "Reading response")))
    .limit(1))[0];
  if (!readingAssignment) {
    [readingAssignment] = await db.insert(assignments).values({
      classId: cls.id,
      teacherId: rivera.id,
      title: "Reading response",
      instructions: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", marks: [{ type: "bold" }], text: "Reading Response" }] },
          { type: "paragraph", content: [{ type: "text", text: "Write 1 to 2 paragraphs responding to the short story assigned in class. What did it make you think about? Did anything surprise you?" }] },
        ],
      },
      dueAt: daysFromNow(-2),
      templateDocId: null,
    }).returning();
    console.log("Created assignment: Reading response");
  }

  for (const student of [ana, ben, cam, dee]) {
    const existing = await db
      .select().from(submissions)
      .where(and(eq(submissions.assignmentId, readingAssignment.id), eq(submissions.studentId, student.id)))
      .limit(1);
    if (existing.length === 0) {
      await withTransaction(async (tx) => {
        await createCopyForMember(tx, {
          assignmentId: readingAssignment.id,
          studentId: student.id,
          title: readingAssignment.title,
          content: BLANK_DOC,
        });
      });
    }
  }

  // ---- 9. Dee: late submission on "Reading response" ---------------------
  const deeSub = (await db
    .select().from(submissions)
    .where(and(eq(submissions.assignmentId, readingAssignment.id), eq(submissions.studentId, dee.id)))
    .limit(1))[0];
  if (deeSub && deeSub.status !== "submitted") {
    await db.update(documents).set({
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "The story made me think about how easy it is to misunderstand someone before you know their full situation. The main character reminded me of a time I judged a classmate unfairly." }] },
        ],
      },
    }).where(eq(documents.id, deeSub.documentId));
    await db.update(submissions).set({
      status: "submitted", isLate: true,
      firstSubmittedAt: hoursAgo(20), submittedAt: hoursAgo(20),
    }).where(eq(submissions.id, deeSub.id));
    console.log("  Marked Dee submitted late");
  }

  // ---- 10. Class syllabus (shared doc) -----------------------------------
  let syllabusDoc = (await db
    .select().from(documents)
    .where(and(eq(documents.ownerId, rivera.id), eq(documents.title, "Class syllabus")))
    .limit(1))[0];
  if (!syllabusDoc) {
    [syllabusDoc] = await db.insert(documents).values({
      ownerId: rivera.id,
      title: "Class syllabus",
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", marks: [{ type: "bold" }], text: "Period 3 English -- Class Syllabus" }] },
          { type: "paragraph", content: [{ type: "text", text: "Welcome to Period 3 English. This course focuses on developing strong writing habits, analytical reading, and clear communication." }] },
          { type: "paragraph", content: [{ type: "text", text: "Units this semester:" }] },
          { type: "bulletList", content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Personal narrative" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Short story analysis" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Argumentative essay" }] }] },
          ]},
          { type: "paragraph", content: [{ type: "text", text: "Grading: 40% essays, 30% reading responses, 20% participation, 10% revisions." }] },
        ],
      },
    }).returning();
    console.log("Created Class syllabus doc");
  }

  const shareTargets = [
    { email: ana.email, userId: ana.id,  role: "viewer" as const, status: "active" as const },
    { email: ben.email, userId: ben.id,  role: "editor" as const, status: "active" as const },
    { email: "newstudent@demo.test", userId: null, role: "viewer" as const, status: "pending" as const },
  ];
  for (const t of shareTargets) {
    const existing = await db
      .select().from(documentShares)
      .where(and(eq(documentShares.documentId, syllabusDoc.id), eq(documentShares.email, t.email)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(documentShares).values({
        documentId: syllabusDoc.id,
        email: t.email,
        userId: t.userId,
        role: t.role,
        status: t.status,
        invitedBy: rivera.id,
      });
    }
  }
  console.log("Shares on Class syllabus: Ana (viewer), Ben (editor), newstudent (pending)");

  console.log("\nSeed complete. All demo accounts use password: demo1234");
  console.log("Sign up with newstudent@demo.test to test pending invite activation.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
