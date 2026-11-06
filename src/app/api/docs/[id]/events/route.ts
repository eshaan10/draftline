import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq, max } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { docEvents } from "@/server/schema";
import { canWrite, getDocAccess } from "@/server/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = z.string().uuid();

const eventSchema = z.object({
  seq: z.number().int().nonnegative(),
  kind: z.enum(["type", "paste", "delete", "format", "undo", "import", "other"]),
  steps: z.array(z.unknown()),
  inserted: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
  clientT: z.number().int().nonnegative(),
  checkpoint: z.unknown().nullable().optional(),
});

const bodySchema = z.object({
  events: z.array(eventSchema).min(1),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

  const { level } = await getDocAccess(user.id, id);
  if (!level) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Document not found." } },
      { status: 404 },
    );
  }
  if (!canWrite(level)) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Write access required." } },
      { status: 403 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Invalid event payload." } },
      { status: 400 },
    );
  }

  const events = [...parsed.data.events].sort((a, b) => a.seq - b.seq);

  const db = await getDb();

  // Determine the current max seq for this document.
  const maxRows = await db
    .select({ maxSeq: max(docEvents.seq) })
    .from(docEvents)
    .where(eq(docEvents.documentId, id));
  const maxSeq: number | null = maxRows[0]?.maxSeq ?? null;

  const expectedFirst = maxSeq === null ? 0 : maxSeq + 1;
  if (events[0].seq !== expectedFirst) {
    return NextResponse.json(
      {
        error: {
          code: "seq_gap",
          message: `Expected seq ${expectedFirst}, got ${events[0].seq}.`,
        },
      },
      { status: 409 },
    );
  }

  // Verify contiguous within batch
  for (let i = 1; i < events.length; i++) {
    if (events[i].seq !== events[i - 1].seq + 1) {
      return NextResponse.json(
        {
          error: {
            code: "seq_gap",
            message: `Batch is not contiguous at seq ${events[i].seq}.`,
          },
        },
        { status: 409 },
      );
    }
  }

  // clientT clamping: prevent clients from reporting inflated timestamps.
  // We get the last stored event to seed prevClientT and prevReceivedAt.
  const lastRows = maxSeq === null
    ? []
    : await db
        .select({ clientT: docEvents.clientT, receivedAt: docEvents.receivedAt })
        .from(docEvents)
        .where(eq(docEvents.documentId, id))
        .orderBy(docEvents.seq)
        .limit(1);

  // We can't ORDER BY desc easily without importing desc, so just re-query the max row.
  // Use a separate query for the last event.
  let prevClientT = 0;
  let prevReceivedAt: Date | null = null;

  if (maxSeq !== null) {
    const lastEventRows = await db
      .select({ clientT: docEvents.clientT, receivedAt: docEvents.receivedAt, seq: docEvents.seq })
      .from(docEvents)
      .where(eq(docEvents.documentId, id));
    // Find the row with seq === maxSeq
    const lastEvent = lastEventRows.find((r) => r.seq === maxSeq);
    if (lastEvent) {
      prevClientT = lastEvent.clientT;
      prevReceivedAt = lastEvent.receivedAt;
    }
  }
  void lastRows; // suppress unused warning

  const now = new Date();

  const clampedEvents = events.map((ev) => {
    let clampedClientT = ev.clientT;
    if (prevReceivedAt !== null) {
      const realElapsed = now.getTime() - prevReceivedAt.getTime();
      const maxClientT = prevClientT + Math.max(0, realElapsed);
      clampedClientT = Math.min(ev.clientT, maxClientT);
    }
    // Update prev for next event in batch (all share "now" as receivedAt)
    prevClientT = clampedClientT;
    prevReceivedAt = now;
    return { ...ev, clientT: clampedClientT };
  });

  await db.insert(docEvents).values(
    clampedEvents.map((ev) => ({
      documentId: id,
      seq: ev.seq,
      userId: user.id,
      kind: ev.kind,
      steps: ev.steps as object[],
      inserted: ev.inserted,
      deleted: ev.deleted,
      checkpoint: ev.checkpoint !== undefined && ev.checkpoint !== null
        ? (ev.checkpoint as object)
        : null,
      clientT: ev.clientT,
      receivedAt: now,
    })),
  );

  const lastSeq = clampedEvents[clampedEvents.length - 1].seq;

  return NextResponse.json({ ok: true, nextSeq: lastSeq + 1 }, { status: 201 });
}
