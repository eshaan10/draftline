import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { classes, classMembers, users } from "@/server/schema";
import { materializeCopiesForUser } from "@/server/assignmentCopies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = z.string().uuid();

function notFound() {
  return NextResponse.json(
    { error: { code: "not_found", message: "Class not found." } },
    { status: 404 },
  );
}

const schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.safeParse(id).success) return notFound();
  const session = await getSessionUser();
  if (!session) return notFound();
  const db = await getDb();
  const cls = (await db.select().from(classes).where(eq(classes.id, id)).limit(1))[0];
  if (!cls || cls.teacherId !== session.id) return notFound();

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Enter a valid email." } },
      { status: 400 },
    );
  }
  const email = parsed.data.email.toLowerCase().trim();
  if (email === session.email.toLowerCase()) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "You are the teacher of this class." } },
      { status: 400 },
    );
  }

  const invitee = (
    await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, email)).limit(1)
  )[0];

  const existing = (
    await db
      .select()
      .from(classMembers)
      .where(and(eq(classMembers.classId, id), eq(classMembers.email, email)))
      .limit(1)
  )[0];

  let member;
  if (existing) {
    const patch: Partial<typeof classMembers.$inferInsert> = {};
    if (invitee && existing.status === "pending") {
      patch.userId = invitee.id;
      patch.status = "active";
    }
    if (Object.keys(patch).length === 0) {
      member = existing;
    } else {
      [member] = await db
        .update(classMembers)
        .set(patch)
        .where(eq(classMembers.id, existing.id))
        .returning();
    }
  } else {
    [member] = await db
      .insert(classMembers)
      .values({
        classId: id,
        email,
        userId: invitee?.id ?? null,
        status: invitee ? "active" : "pending",
      })
      .returning();
  }

  // If the member is now active, fan out copies for existing assignments.
  if (invitee && member.status === "active") {
    await materializeCopiesForUser({ id: invitee.id, email });
  }

  return NextResponse.json({ member, userName: invitee?.name ?? null }, { status: 201 });
}
