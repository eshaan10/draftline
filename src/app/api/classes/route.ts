import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { classes } from "@/server/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json(
    { error: { code: "unauthorized", message: "Sign in to continue." } },
    { status: 401 },
  );
}

function forbidden() {
  return NextResponse.json(
    { error: { code: "forbidden", message: "Only teachers can manage classes." } },
    { status: 403 },
  );
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== "teacher") return forbidden();
  const db = await getDb();
  const rows = await db
    .select()
    .from(classes)
    .where(eq(classes.teacherId, user.id))
    .orderBy(desc(classes.createdAt));
  return NextResponse.json({ classes: rows });
}

const createSchema = z.object({ name: z.string().trim().min(1).max(200) });

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== "teacher") return forbidden();
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Class name is required." } },
      { status: 400 },
    );
  }
  const db = await getDb();
  const [cls] = await db
    .insert(classes)
    .values({ teacherId: user.id, name: parsed.data.name })
    .returning();
  return NextResponse.json({ class: cls }, { status: 201 });
}
