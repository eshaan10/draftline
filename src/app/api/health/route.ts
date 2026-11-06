import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
