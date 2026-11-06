import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { getDocAccess } from "@/server/access";
import { getDb } from "@/server/db";
import { docEvents } from "@/server/schema";
import { ReplayPlayer } from "@/features/replay/ReplayPlayer";

export const dynamic = "force-dynamic";

const UUID = z.string().uuid();

export default async function ReplayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.safeParse(id).success) notFound();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { level, document } = await getDocAccess(user.id, id);
  if (!document) notFound();
  if (!level || level === "viewer" || level === "commenter") notFound();

  const db = await getDb();
  const events = await db
    .select()
    .from(docEvents)
    .where(eq(docEvents.documentId, id))
    .orderBy(asc(docEvents.seq));

  const serializedEvents = events.map((e) => ({
    seq: e.seq,
    kind: e.kind as
      | "type"
      | "paste"
      | "delete"
      | "format"
      | "undo"
      | "import"
      | "other",
    steps: e.steps as unknown[],
    inserted: e.inserted,
    deleted: e.deleted,
    clientT: e.clientT,
    receivedAt: e.receivedAt.toISOString(),
    checkpoint: e.checkpoint ?? null,
  }));

  return (
    <main className="min-h-screen pb-24" style={{ background: "var(--bg)" }}>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex items-center gap-3">
          <a
            href={`/docs/${id}`}
            className="btn-ghost rounded-md px-2 py-1 text-sm"
          >
            Back to document
          </a>
          <h1 className="text-lg font-semibold">{document.title} - Replay</h1>
        </div>
        <ReplayPlayer
          docId={id}
          initialEvents={serializedEvents}
          canAccess={true}
        />
      </div>
    </main>
  );
}
