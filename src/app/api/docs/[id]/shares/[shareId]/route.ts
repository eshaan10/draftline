import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { canManageSharing, getDocAccess } from "@/server/access";
import { getDb } from "@/server/db";
import { documentShares } from "@/server/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = z.string().uuid();

function notFound() {
  return NextResponse.json(
    { error: { code: "not_found", message: "Not found." } },
    { status: 404 },
  );
}
function forbidden() {
  return NextResponse.json(
    { error: { code: "forbidden", message: "Only the owner can manage sharing." } },
    { status: 403 },
  );
}

async function readParams(params: Promise<{ id: string; shareId: string }>) {
  const { id, shareId } = await params;
  if (!UUID.safeParse(id).success || !UUID.safeParse(shareId).success) return null;
  return { id, shareId };
}

const patchSchema = z.object({ role: z.enum(["viewer", "commenter", "editor"]) });

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; shareId: string }> },
) {
  const p = await readParams(ctx.params);
  if (!p) return notFound();
  const session = await getSessionUser();
  const { level, document } = await getDocAccess(session?.id, p.id);
  if (!level || !document) return notFound();
  if (!canManageSharing(level)) return forbidden();

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Pick a valid role." } },
      { status: 400 },
    );
  }

  const db = await getDb();
  const [updated] = await db
    .update(documentShares)
    .set({ role: parsed.data.role })
    .where(
      and(eq(documentShares.id, p.shareId), eq(documentShares.documentId, p.id)),
    )
    .returning();
  if (!updated) return notFound();
  return NextResponse.json({ share: updated });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; shareId: string }> },
) {
  const p = await readParams(ctx.params);
  if (!p) return notFound();
  const session = await getSessionUser();
  const { level, document } = await getDocAccess(session?.id, p.id);
  if (!level || !document) return notFound();
  if (!canManageSharing(level)) return forbidden();

  const db = await getDb();
  const deleted = await db
    .delete(documentShares)
    .where(
      and(eq(documentShares.id, p.shareId), eq(documentShares.documentId, p.id)),
    )
    .returning();
  if (deleted.length === 0) return notFound();
  return NextResponse.json({ ok: true });
}
