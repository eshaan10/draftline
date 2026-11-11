import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { docEvents, users } from "@/server/schema";
import { getDocAccess } from "@/server/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = z.string().uuid();

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.safeParse(id).success) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Document not found." } },
      { status: 404 },
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Authentication required." } },
      { status: 401 },
    );
  }

  const { level, document } = await getDocAccess(user.id, id);
  if (!document) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Document not found." } },
      { status: 404 },
    );
  }
  if (!level) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Document not found." } },
      { status: 404 },
    );
  }
  if (level === "viewer") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Editor, commenter, or owner access required to view replay." } },
      { status: 403 },
    );
  }

  const db = await getDb();
  const rows = await db
    .select({
      seq: docEvents.seq,
      kind: docEvents.kind,
      steps: docEvents.steps,
      inserted: docEvents.inserted,
      deleted: docEvents.deleted,
      clientT: docEvents.clientT,
      receivedAt: docEvents.receivedAt,
      checkpoint: docEvents.checkpoint,
      userId: docEvents.userId,
      userName: users.name,
    })
    .from(docEvents)
    .innerJoin(users, eq(users.id, docEvents.userId))
    .where(eq(docEvents.documentId, id))
    .orderBy(asc(docEvents.seq));

  const nextSeq = rows.length > 0 ? rows[rows.length - 1].seq + 1 : 0;

  // Build authors map: userId -> name
  const authors: Record<string, string> = {};
  for (const r of rows) {
    if (!authors[r.userId]) authors[r.userId] = r.userName;
  }

  const serialized = rows.map((e) => ({
    seq: e.seq,
    kind: e.kind,
    steps: e.steps as unknown[],
    inserted: e.inserted,
    deleted: e.deleted,
    clientT: e.clientT,
    receivedAt: e.receivedAt.toISOString(),
    checkpoint: e.checkpoint ?? null,
    userId: e.userId,
  }));

  return NextResponse.json({ events: serialized, nextSeq, authors });
}
