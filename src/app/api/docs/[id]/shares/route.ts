import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { canManageSharing, getDocAccess } from "@/server/access";
import { getDb } from "@/server/db";
import { documentShares, users } from "@/server/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = z.string().uuid();

function notFound() {
  return NextResponse.json(
    { error: { code: "not_found", message: "Document not found." } },
    { status: 404 },
  );
}

function forbidden(msg = "Only the owner can manage sharing.") {
  return NextResponse.json({ error: { code: "forbidden", message: msg } }, { status: 403 });
}

async function readParams(params: Promise<{ id: string }>) {
  const { id } = await params;
  return UUID.safeParse(id).success ? id : null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await readParams(ctx.params);
  if (!id) return notFound();
  const session = await getSessionUser();
  const { level, document } = await getDocAccess(session?.id, id);
  if (!level || !document) return notFound();
  if (!canManageSharing(level)) return forbidden();

  const db = await getDb();
  const rows = await db
    .select({
      id: documentShares.id,
      email: documentShares.email,
      role: documentShares.role,
      status: documentShares.status,
      createdAt: documentShares.createdAt,
      userId: documentShares.userId,
      userName: users.name,
    })
    .from(documentShares)
    .leftJoin(users, eq(users.id, documentShares.userId))
    .where(eq(documentShares.documentId, id));

  return NextResponse.json({ shares: rows });
}

const postSchema = z.object({
  email: z.string().email(),
  role: z.enum(["viewer", "commenter", "editor"]),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await readParams(ctx.params);
  if (!id) return notFound();
  const session = await getSessionUser();
  const { level, document } = await getDocAccess(session?.id, id);
  if (!level || !document) return notFound();
  if (!canManageSharing(level)) return forbidden();

  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Enter a valid email and role." } },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase().trim();
  if (email === session!.email.toLowerCase()) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "You already own this document." } },
      { status: 400 },
    );
  }

  const db = await getDb();
  const invitee = (
    await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
  )[0];

  const existing = (
    await db
      .select()
      .from(documentShares)
      .where(
        and(eq(documentShares.documentId, id), eq(documentShares.email, email)),
      )
      .limit(1)
  )[0];

  let share;
  if (existing) {
    const patch: Partial<typeof documentShares.$inferInsert> = { role: parsed.data.role };
    if (invitee && existing.status === "pending") {
      patch.userId = invitee.id;
      patch.status = "active";
    }
    [share] = await db
      .update(documentShares)
      .set(patch)
      .where(eq(documentShares.id, existing.id))
      .returning();
  } else {
    [share] = await db
      .insert(documentShares)
      .values({
        documentId: id,
        email,
        userId: invitee?.id ?? null,
        role: parsed.data.role,
        status: invitee ? "active" : "pending",
        invitedBy: session!.id,
      })
      .returning();
  }

  return NextResponse.json({ share, userName: invitee?.name ?? null }, { status: 201 });
}
