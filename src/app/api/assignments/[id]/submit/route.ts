import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth";
import { performSubmit } from "@/server/submit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = z.string().uuid();

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.safeParse(id).success) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Assignment not found." } },
      { status: 404 },
    );
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Sign in to continue." } },
      { status: 401 },
    );
  }
  const result = await performSubmit({
    userId: user.id,
    assignmentId: id,
    now: new Date(),
  });
  if ("error" in result) {
    if (result.error === "not_found") {
      return NextResponse.json(
        { error: { code: "not_found", message: "Submission not found." } },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: { code: "locked", message: result.message } },
      { status: 409 },
    );
  }
  return NextResponse.json({ submission: result.submission });
}
