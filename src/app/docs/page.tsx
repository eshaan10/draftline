import { redirect } from "next/navigation";
import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { docEvents, documents, documentShares, users } from "@/server/schema";
import { DocsDashboard, type DocRow, type SharedRow } from "@/features/docs/DocsDashboard";
import { buildPreview } from "@/server/preview";

export const dynamic = "force-dynamic";

export default async function DocsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      version: documents.version,
      updatedAt: documents.updatedAt,
      createdAt: documents.createdAt,
      content: documents.content,
    })
    .from(documents)
    .where(eq(documents.ownerId, user.id))
    .orderBy(desc(documents.updatedAt));

  const sharedRows = await db
    .select({
      id: documents.id,
      title: documents.title,
      version: documents.version,
      updatedAt: documents.updatedAt,
      createdAt: documents.createdAt,
      content: documents.content,
      role: documentShares.role,
      ownerName: users.name,
    })
    .from(documentShares)
    .innerJoin(documents, eq(documents.id, documentShares.documentId))
    .innerJoin(users, eq(users.id, documents.ownerId))
    .where(
      and(eq(documentShares.userId, user.id), eq(documentShares.status, "active")),
    )
    .orderBy(desc(documents.updatedAt));

  // Fetch last-editor info for all documents in one query.
  const allDocIds = [
    ...rows.map((r) => r.id),
    ...sharedRows.map((r) => r.id),
  ];

  const lastEditorMap: Record<string, { name: string; at: string }> = {};
  if (allDocIds.length > 0) {
    // Subquery: max seq per document
    const latestSeq = db
      .select({
        documentId: docEvents.documentId,
        maxSeq: max(docEvents.seq).as("max_seq"),
      })
      .from(docEvents)
      .where(inArray(docEvents.documentId, allDocIds))
      .groupBy(docEvents.documentId)
      .as("latest_seq");

    const editorRows = await db
      .select({
        documentId: docEvents.documentId,
        userName: users.name,
        receivedAt: docEvents.receivedAt,
      })
      .from(docEvents)
      .innerJoin(
        latestSeq,
        and(
          eq(docEvents.documentId, latestSeq.documentId),
          eq(docEvents.seq, sql`${latestSeq.maxSeq}`),
        ),
      )
      .innerJoin(users, eq(users.id, docEvents.userId));

    for (const r of editorRows) {
      lastEditorMap[r.documentId] = {
        name: r.userName,
        at: r.receivedAt.toISOString(),
      };
    }
  }

  const owned: DocRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    version: r.version,
    updatedAt: r.updatedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    preview: buildPreview(r.content),
    lastEditor: lastEditorMap[r.id] ?? null,
  }));

  const shared: SharedRow[] = sharedRows.map((r) => ({
    id: r.id,
    title: r.title,
    version: r.version,
    updatedAt: r.updatedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    preview: buildPreview(r.content),
    role: r.role,
    ownerName: r.ownerName,
    lastEditor: lastEditorMap[r.id] ?? null,
  }));

  return (
    <DocsDashboard
      user={{ id: user.id, name: user.name, role: user.role }}
      owned={owned}
      shared={shared}
    />
  );
}
