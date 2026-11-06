import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { classes, classMembers } from "@/server/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = z.string().uuid();

function notFound() {
  return NextResponse.json(
    { error: { code: "not_found", message: "Not found." } },
    { status: 404 },
  );
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id, memberId } = await ctx.params;
  if (!UUID.safeParse(id).success || !UUID.safeParse(memberId).success) return notFound();
  const session = await getSessionUser();
  if (!session) return notFound();
  const db = await getDb();
  const cls = (await db.select().from(classes).where(eq(classes.id, id)).limit(1))[0];
  if (!cls || cls.teacherId !== session.id) return notFound();

  const deleted = await db
    .delete(classMembers)
    .where(and(eq(classMembers.id, memberId), eq(classMembers.classId, id)))
    .returning();
  if (deleted.length === 0) return notFound();
  return NextResponse.json({ ok: true });
}
