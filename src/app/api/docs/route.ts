import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { documents } from "@/server/schema";
import { buildPreview } from "@/server/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] } as const;

const createSchema = z.object({
  title: z.string().trim().max(200).optional(),
  content: z.unknown().optional(),
});

function unauthorized() {
  return NextResponse.json(
    { error: { code: "unauthorized", message: "Sign in to continue." } },
    { status: 401 },
  );
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
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
  const owned = rows.map(({ content, ...rest }) => ({
    ...rest,
    preview: buildPreview(content),
  }));
  return NextResponse.json({ owned, shared: [] });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Invalid input." } },
      { status: 400 },
    );
  }
  const db = await getDb();
  const [doc] = await db
    .insert(documents)
    .values({
      ownerId: user.id,
      title: parsed.data.title?.trim() || "Untitled document",
      content: parsed.data.content ?? EMPTY_DOC,
    })
    .returning();
  return NextResponse.json({ document: doc }, { status: 201 });
}
