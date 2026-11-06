import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { documents } from "@/server/schema";
import { DocsDashboard, type DocRow } from "@/features/docs/DocsDashboard";
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

  const owned: DocRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    version: r.version,
    updatedAt: r.updatedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    preview: buildPreview(r.content),
  }));

  return (
    <DocsDashboard
      user={{ id: user.id, name: user.name }}
      owned={owned}
      shared={[]}
    />
  );
}
