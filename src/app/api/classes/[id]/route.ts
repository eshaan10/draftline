import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { classes, classMembers, users } from "@/server/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = z.string().uuid();

function notFound() {
  return NextResponse.json(
    { error: { code: "not_found", message: "Class not found." } },
    { status: 404 },
  );
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.safeParse(id).success) return notFound();
  const user = await getSessionUser();
  if (!user) return notFound();
  const db = await getDb();
  const rows = await db.select().from(classes).where(eq(classes.id, id)).limit(1);
  const cls = rows[0];
  if (!cls || cls.teacherId !== user.id) return notFound();

  const members = await db
    .select({
      id: classMembers.id,
      email: classMembers.email,
      status: classMembers.status,
      userId: classMembers.userId,
      userName: users.name,
      createdAt: classMembers.createdAt,
    })
    .from(classMembers)
    .leftJoin(users, eq(users.id, classMembers.userId))
    .where(eq(classMembers.classId, id));

  return NextResponse.json({ class: cls, members });
}
