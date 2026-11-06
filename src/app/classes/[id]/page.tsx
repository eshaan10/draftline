import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import {
  assignments,
  classes,
  classMembers,
  documents,
  users,
} from "@/server/schema";
import { ClassDetailPage } from "@/features/classes/ClassDetailPage";

export const dynamic = "force-dynamic";

const UUID = z.string().uuid();

export default async function ClassDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.safeParse(id).success) notFound();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/docs");

  const db = await getDb();
  const cls = (await db.select().from(classes).where(eq(classes.id, id)).limit(1))[0];
  if (!cls || cls.teacherId !== user.id) notFound();

  const members = await db
    .select({
      id: classMembers.id,
      email: classMembers.email,
      status: classMembers.status,
      userName: users.name,
    })
    .from(classMembers)
    .leftJoin(users, eq(users.id, classMembers.userId))
    .where(eq(classMembers.classId, id));

  const asmts = await db
    .select()
    .from(assignments)
    .where(eq(assignments.classId, id))
    .orderBy(desc(assignments.createdAt));

  const teacherDocs = await db
    .select({ id: documents.id, title: documents.title })
    .from(documents)
    .where(and(eq(documents.ownerId, user.id)))
    .orderBy(desc(documents.updatedAt));

  return (
    <ClassDetailPage
      user={{ id: user.id, name: user.name }}
      classInfo={{ id: cls.id, name: cls.name }}
      members={members.map((m) => ({
        id: m.id,
        email: m.email,
        status: m.status,
        userName: m.userName,
      }))}
      assignments={asmts.map((a) => ({
        id: a.id,
        title: a.title,
        dueAt: a.dueAt.toISOString(),
      }))}
      teacherDocs={teacherDocs}
    />
  );
}
