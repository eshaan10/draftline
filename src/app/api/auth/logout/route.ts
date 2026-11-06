import { NextResponse, type NextRequest } from "next/server";
import { logout } from "@/server/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  await logout();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
