import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { signup } from "@/server/auth";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
  role: z.enum(["teacher", "student"]),
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
      { error: { code: "bad_request", message: "Check your details and try again." } },
      { status: 400 },
    );
  }
  const result = await signup(parsed.data);
  if ("error" in result) {
    const status = result.error === "email_taken" ? 409 : 400;
    const message =
      result.error === "email_taken"
        ? "An account with that email already exists."
        : "Could not create account.";
    return NextResponse.json({ error: { code: result.error, message } }, { status });
  }
  return NextResponse.redirect(new URL("/docs", req.url), 303);
}
