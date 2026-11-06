import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { getDocAccess } from "@/server/access";
import { attachments } from "@/server/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = z.string().uuid();

function notFound() {
  return NextResponse.json(
    { error: { code: "not_found", message: "Not found." } },
    { status: 404 },
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Sign in to continue." } },
      { status: 401 },
    );
  }

  const { id } = await params;
  if (!UUID.safeParse(id).success) return notFound();

  const db = await getDb();
  const rows = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, id))
    .limit(1);
  const att = rows[0];
  if (!att) return notFound();

  const { level } = await getDocAccess(user.id, att.documentId);
  if (!level) return notFound();

  const isImage = att.kind === "image" || att.mime.startsWith("image/");
  const disposition = isImage
    ? `inline; filename="${att.filename}"`
    : `attachment; filename="${att.filename}"`;

  return new NextResponse(new Uint8Array(att.data as Buffer), {
    status: 200,
    headers: {
      "Content-Type": att.mime,
      "Content-Disposition": disposition,
      "X-Content-Type-Options": "nosniff",
      "Content-Length": String(att.size),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Sign in to continue." } },
      { status: 401 },
    );
  }

  const { id } = await params;
  if (!UUID.safeParse(id).success) return notFound();

  const db = await getDb();
  const rows = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, id))
    .limit(1);
  const att = rows[0];
  if (!att) return notFound();

  const { level, document: doc } = await getDocAccess(user.id, att.documentId);
  if (!level) return notFound();

  // Only the uploader or the document owner can delete.
  const isOwner = doc?.ownerId === user.id;
  const isUploader = att.uploaderId === user.id;
  if (!isOwner && !isUploader) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Only the uploader or document owner can delete this file." } },
      { status: 403 },
    );
  }

  await db.delete(attachments).where(eq(attachments.id, id));
  return NextResponse.json({ ok: true });
}
