import { NextResponse, type NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { getDocAccess } from "@/server/access";
import { attachments, users } from "@/server/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;

const ALLOWED_MIME_IMAGE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const ALLOWED_EXT_ALL = new Set(["png", "jpg", "jpeg", "gif", "webp", "pdf", "docx", "txt", "md", "csv"]);

function unauthorized() {
  return NextResponse.json(
    { error: { code: "unauthorized", message: "Sign in to continue." } },
    { status: 401 },
  );
}

const UUID = z.string().uuid();

function extOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!UUID.safeParse(id).success) {
    return NextResponse.json({ error: { code: "not_found", message: "Not found." } }, { status: 404 });
  }
  const { level } = await getDocAccess(user.id, id);
  if (!level) {
    return NextResponse.json({ error: { code: "not_found", message: "Not found." } }, { status: 404 });
  }
  const db = await getDb();
  const rows = await db
    .select({
      id: attachments.id,
      filename: attachments.filename,
      mime: attachments.mime,
      size: attachments.size,
      kind: attachments.kind,
      createdAt: attachments.createdAt,
      uploaderId: attachments.uploaderId,
      uploaderName: users.name,
    })
    .from(attachments)
    .innerJoin(users, eq(attachments.uploaderId, users.id))
    .where(eq(attachments.documentId, id))
    .orderBy(desc(attachments.createdAt));
  return NextResponse.json({ attachments: rows });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!UUID.safeParse(id).success) {
    return NextResponse.json({ error: { code: "not_found", message: "Not found." } }, { status: 404 });
  }
  const { level } = await getDocAccess(user.id, id);
  if (!level || level === "viewer" || level === "commenter") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Editor access required." } },
      { status: 403 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Expected multipart form data." } },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "No file provided." } },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "The file is empty." } },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: { code: "too_large", message: "File exceeds the 4 MB limit." } },
      { status: 413 },
    );
  }

  const extension = extOf(file.name);
  const isImageReq = formData.get("kind") === "image";

  if (isImageReq && !ALLOWED_MIME_IMAGE.has(file.type)) {
    return NextResponse.json(
      { error: { code: "unsupported_type", message: "Only PNG, JPEG, GIF, and WebP images are supported." } },
      { status: 415 },
    );
  }

  if (!isImageReq && !ALLOWED_EXT_ALL.has(extension)) {
    return NextResponse.json(
      {
        error: {
          code: "unsupported_type",
          message: "Allowed types: png, jpg, gif, webp, pdf, docx, txt, md, csv.",
        },
      },
      { status: 415 },
    );
  }

  const kind = ALLOWED_MIME_IMAGE.has(file.type) ? "image" : "file";
  const data = Buffer.from(await file.arrayBuffer());

  const db = await getDb();
  const rows = await db
    .insert(attachments)
    .values({
      documentId: id,
      uploaderId: user.id,
      kind,
      filename: file.name,
      mime: file.type || "application/octet-stream",
      size: data.length,
      data,
    })
    .returning();
  const att = rows[0];

  return NextResponse.json(
    { attachment: { ...att, url: `/api/files/${att.id}` } },
    { status: 201 },
  );
}
