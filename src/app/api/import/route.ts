import { NextResponse, type NextRequest } from "next/server";
import mammoth from "mammoth";
import { marked } from "marked";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { attachments, documents, docEvents } from "@/server/schema";
import { htmlToTiptap } from "@/server/htmlToTiptap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

const ALLOWED_EXT = new Set(["docx", "md", "txt"]);
const ALLOWED_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/markdown",
  "text/plain",
  // browsers sometimes send these for .md
  "text/x-markdown",
  "application/octet-stream", // fallback; we rely on extension too
]);

function unauthorized() {
  return NextResponse.json(
    { error: { code: "unauthorized", message: "Sign in to continue." } },
    { status: 401 },
  );
}

function ext(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function titleFromFilename(filename: string) {
  return filename.replace(/\.[^.]+$/, "").trim() || "Imported document";
}

function txtToTiptap(text: string): object {
  const paragraphs = text.split(/\n{2,}/);
  return {
    type: "doc",
    content: paragraphs
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const lines = p.split(/\n/);
        const content: object[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (lines[i]) content.push({ type: "text", text: lines[i] });
          if (i < lines.length - 1) content.push({ type: "hardBreak" });
        }
        return { type: "paragraph", content };
      }),
  };
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

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

  const extension = ext(file.name);
  if (!ALLOWED_EXT.has(extension)) {
    return NextResponse.json(
      {
        error: {
          code: "unsupported_type",
          message: "Only .docx, .md, and .txt files are supported.",
        },
      },
      { status: 415 },
    );
  }

  // Some browsers send application/octet-stream for .docx if unrecognised.
  // We allow that, trusting the extension. Reject clearly wrong MIME/ext combos.
  if (
    file.type &&
    !ALLOWED_MIME.has(file.type) &&
    file.type !== "application/octet-stream"
  ) {
    return NextResponse.json(
      {
        error: {
          code: "unsupported_type",
          message: "Only .docx, .md, and .txt files are supported.",
        },
      },
      { status: 415 },
    );
  }

  const db = await getDb();
  const title = titleFromFilename(file.name);

  // Create the document shell first so images can reference its id.
  const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };
  const [doc] = await db
    .insert(documents)
    .values({ ownerId: user.id, title, content: EMPTY_DOC })
    .returning();

  let content: object = EMPTY_DOC;
  const warnings: string[] = [];

  if (extension === "docx") {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        styleMap: ["u => u"],
        convertImage: mammoth.images.imgElement(async (element) => {
          try {
            const buf = await element.readAsBuffer();
            const imgExt = element.contentType?.split("/")[1] ?? "png";
            const [att] = await db
              .insert(attachments)
              .values({
                documentId: doc.id,
                uploaderId: user.id,
                kind: "image",
                filename: `image.${imgExt}`,
                mime: element.contentType || "image/png",
                size: buf.length,
                data: buf,
              })
              .returning();
            return { src: `/api/files/${att.id}` };
          } catch {
            return { src: "" };
          }
        }),
      },
    );

    if (result.messages.length > 0) {
      warnings.push("Some formatting may differ from the original.");
    }

    try {
      content = htmlToTiptap(result.value);
    } catch {
      // Fall back to plain text paragraphs if conversion fails.
      content = EMPTY_DOC;
      warnings.push("Could not parse document structure; content may be incomplete.");
    }
  } else if (extension === "md") {
    const text = await file.text();
    const html = await marked(text, { async: false });
    try {
      content = htmlToTiptap(html as string);
    } catch {
      content = EMPTY_DOC;
    }
  } else {
    // .txt
    const text = await file.text();
    content = txtToTiptap(text);
  }

  // Update document with real content.
  const [updated] = await db
    .update(documents)
    .set({ content, updatedAt: new Date() })
    .where(eq(documents.id, doc.id))
    .returning();

  // Record a seq-0 import event (checkpoint so B4 replay can start here).
  await db.insert(docEvents).values({
    documentId: doc.id,
    seq: 0,
    userId: user.id,
    kind: "import",
    steps: [],
    inserted: 0,
    deleted: 0,
    checkpoint: content,
    clientT: 0,
  });

  if (!updated) {
    return NextResponse.json(
      { error: { code: "internal", message: "Import failed." } },
      { status: 500 },
    );
  }
  return NextResponse.json({ document: updated, warnings }, { status: 201 });
}
