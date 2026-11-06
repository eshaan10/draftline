import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { desc, eq, max } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { getDocAccess } from "@/server/access";
import { getDb } from "@/server/db";
import { docEvents, users } from "@/server/schema";
import { DocumentWorkspace } from "@/features/editor/DocumentWorkspace";

export const dynamic = "force-dynamic";

const UUID = z.string().uuid();

export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ imported?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!UUID.safeParse(id).success) notFound();

  const { level, document } = await getDocAccess(user.id, id);
  if (!level || !document) notFound();

  const db = await getDb();

  const [maxSeqRows, lastEventRows] = await Promise.all([
    db
      .select({ maxSeq: max(docEvents.seq) })
      .from(docEvents)
      .where(eq(docEvents.documentId, id)),
    db
      .select({ userName: users.name, receivedAt: docEvents.receivedAt })
      .from(docEvents)
      .innerJoin(users, eq(users.id, docEvents.userId))
      .where(eq(docEvents.documentId, id))
      .orderBy(desc(docEvents.seq))
      .limit(1),
  ]);

  const replayNextSeq = (maxSeqRows[0]?.maxSeq ?? -1) + 1;
  const lastEditor = lastEventRows[0]
    ? { name: lastEventRows[0].userName, at: lastEventRows[0].receivedAt.toISOString() }
    : null;

  return (
    <DocumentWorkspace
      user={{ id: user.id, name: user.name }}
      document={{
        id: document.id,
        title: document.title,
        version: document.version,
        content: document.content,
        updatedAt: document.updatedAt.toISOString(),
      }}
      access={level}
      replayNextSeq={replayNextSeq}
      showImportNotice={sp.imported === "1"}
      lastEditor={lastEditor}
    />
  );
}
