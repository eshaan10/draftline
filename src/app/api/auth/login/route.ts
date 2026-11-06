import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { login } from "@/server/auth";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function readBody(req: NextRequest): Promise<unknown> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return req.json();
  const form = await req.formData();
  return Object.fromEntries(form.entries());
}

export async function POST(req: NextRequest) {
  const body = await readBody(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Enter a valid email and password." } },
      { status: 400 },
    );
  }
  const result = await login(parsed.data);
  if ("error" in result) {
    return NextResponse.json(
      { error: { code: result.error, message: "Email or password is incorrect." } },
      { status: 401 },
    );
  }
  return NextResponse.redirect(new URL("/docs", req.url), 303);
}
