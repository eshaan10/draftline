import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { documents } from "@/server/schema";
import { canWrite, getDocAccess } from "@/server/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = z.string().uuid();

function notFound() {
  return NextResponse.json(
    { error: { code: "not_found", message: "Document not found." } },
    { status: 404 },
  );
}

function readOnly() {
  return NextResponse.json(
    { error: { code: "forbidden", message: "You have read-only access." } },
    { status: 403 },
  );
}

const putSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.unknown(),
  baseVersion: z.number().int().nonnegative(),
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

async function readParams(params: Promise<{ id: string }>) {
  const { id } = await params;
  return UUID.safeParse(id).success ? id : null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await readParams(ctx.params);
  if (!id) return notFound();
  const user = await getSessionUser();
  const { level, document } = await getDocAccess(user?.id, id);
  if (!level || !document) return notFound();
  return NextResponse.json({ document, access: level });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await readParams(ctx.params);
  if (!id) return notFound();
  const user = await getSessionUser();
  const { level, document } = await getDocAccess(user?.id, id);
  if (!level || !document) return notFound();
  if (!canWrite(level)) return readOnly();
  const parsed = putSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Invalid input." } },
      { status: 400 },
    );
  }
  if (parsed.data.baseVersion !== document.version) {
    return NextResponse.json(
      {
        error: { code: "stale_version", message: "This document changed elsewhere." },
        currentVersion: document.version,
      },
      { status: 409 },
    );
  }
  const db = await getDb();
  const [updated] = await db
    .update(documents)
    .set({
      title: parsed.data.title ?? document.title,
      content: parsed.data.content as object,
      version: document.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, id))
    .returning();
  return NextResponse.json({ document: updated });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await readParams(ctx.params);
  if (!id) return notFound();
  const user = await getSessionUser();
  const { level, document } = await getDocAccess(user?.id, id);
  if (!level || !document) return notFound();
  if (!canWrite(level)) return readOnly();
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Title must be between 1 and 200 characters." } },
      { status: 400 },
    );
  }
  const db = await getDb();
  const [updated] = await db
    .update(documents)
    .set({ title: parsed.data.title, updatedAt: new Date() })
    .where(eq(documents.id, id))
    .returning();
  return NextResponse.json({ document: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await readParams(ctx.params);
  if (!id) return notFound();
  const user = await getSessionUser();
  const { level, document } = await getDocAccess(user?.id, id);
  if (!level || !document) return notFound();
  if (level !== "owner") return readOnly();
  const db = await getDb();
  await db.delete(documents).where(eq(documents.id, id));
  return NextResponse.json({ ok: true });
}
