import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { docEvents } from "@/server/schema";
import { canWrite, getDocAccess } from "@/server/access";

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
  if (!level || !canWrite(level)) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Editor or owner access required to view replay." } },
      { status: 403 },
    );
  }

  const db = await getDb();
  const events = await db
    .select()
    .from(docEvents)
    .where(eq(docEvents.documentId, id))
    .orderBy(asc(docEvents.seq));

  const nextSeq = events.length > 0 ? events[events.length - 1].seq + 1 : 0;

  const serialized = events.map((e) => ({
    seq: e.seq,
    kind: e.kind,
    steps: e.steps as unknown[],
    inserted: e.inserted,
    deleted: e.deleted,
    clientT: e.clientT,
    receivedAt: e.receivedAt.toISOString(),
    checkpoint: e.checkpoint ?? null,
  }));

  return NextResponse.json({ events: serialized, nextSeq });
}
