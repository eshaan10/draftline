import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/server/auth";
import { getDocAccess } from "@/server/access";
import { DocumentWorkspace } from "@/features/editor/DocumentWorkspace";

export const dynamic = "force-dynamic";

const UUID = z.string().uuid();

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!UUID.safeParse(id).success) notFound();

  const { level, document } = await getDocAccess(user.id, id);
  if (!level || !document) notFound();

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
    />
  );
}
