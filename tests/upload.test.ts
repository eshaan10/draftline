import { beforeAll, describe, expect, it, vi } from "vitest";
import type { User } from "@/server/schema";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  AlignmentType,
  UnderlineType,
} from "docx";

// 1x1 transparent PNG
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const session = { current: null as User | null };

vi.mock("next/headers", () => ({
  cookies: async () => ({ set() {}, get() { return undefined; }, delete() {} }),
}));

vi.mock("@/server/auth", async () => {
  const actual = await vi.importActual<typeof import("@/server/auth")>("@/server/auth");
  return { ...actual, getSessionUser: async () => session.current };
});

const { getDb } = await import("@/server/db");
const { users } = await import("@/server/schema");
const bcryptMod = await import("bcryptjs");
const bcrypt = bcryptMod.default ?? bcryptMod;

const importRoute = await import("@/app/api/import/route");
const filesRoute = await import("@/app/api/files/[id]/route");

async function makeUser(email: string): Promise<User> {
  const db = await getDb();
  const [u] = await db
    .insert(users)
    .values({
      email,
      name: email.split("@")[0],
      role: "student",
      passwordHash: await bcrypt.hash("x", 4),
    })
    .returning();
  return u;
}

function formReq(path: string, formData: FormData) {
  return new Request(`http://local${path}`, {
    method: "POST",
    body: formData,
  }) as unknown as import("next/server").NextRequest;
}

function getReq(path: string) {
  return new Request(`http://local${path}`, { method: "GET" }) as unknown as import("next/server").NextRequest;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function buildDocxFixture(): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: "Test Heading", bold: true })],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Bold text", bold: true }),
              new TextRun(" and "),
              new TextRun({ text: "underlined text", underline: { type: UnderlineType.SINGLE } }),
            ],
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun("List item 1")],
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun("List item 2")],
          }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Header")] }),
                  new TableCell({ children: [new Paragraph("Cell")] }),
                ],
              }),
            ],
          }),
          new Paragraph({
            children: [
              new ImageRun({
                data: TINY_PNG,
                transformation: { width: 1, height: 1 },
                type: "png",
              }),
            ],
          }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

let alice: User;
let stranger: User;

beforeAll(async () => {
  alice = await makeUser("alice-upload@demo.test");
  stranger = await makeUser("stranger-upload@demo.test");
});

describe("import API", () => {
  it("imports a .txt file with paragraph and line-break structure", async () => {
    session.current = alice;
    const fd = new FormData();
    fd.append("file", new File(["Hello world\n\nSecond paragraph"], "note.txt", { type: "text/plain" }));
    const res = await importRoute.POST(formReq("/api/import", fd));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.document.title).toBe("note");
    // Content should be a valid Tiptap doc with paragraphs
    const content = body.document.content as { type: string; content?: { type: string }[] };
    expect(content.type).toBe("doc");
    expect(Array.isArray(content.content)).toBe(true);
    expect(content.content!.length).toBeGreaterThanOrEqual(2);
  });

  it("imports a .md file and converts headings", async () => {
    session.current = alice;
    const md = "# My Heading\n\nSome **bold** text and a list:\n\n- item one\n- item two\n";
    const fd = new FormData();
    fd.append("file", new File([md], "readme.md", { type: "text/markdown" }));
    const res = await importRoute.POST(formReq("/api/import", fd));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.document.title).toBe("readme");
    const content = body.document.content as { type: string; content?: unknown[] };
    expect(content.type).toBe("doc");
    expect(content.content!.length).toBeGreaterThanOrEqual(1);
  });

  it("imports a .docx file and stores embedded images as attachments", async () => {
    session.current = alice;
    const buffer = await buildDocxFixture();
    const fd = new FormData();
    fd.append(
      "file",
      new File([new Uint8Array(buffer)], "report.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    const res = await importRoute.POST(formReq("/api/import", fd));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.document.title).toBe("report");
    // The content should contain the heading
    const rawContent = JSON.stringify(body.document.content);
    expect(rawContent).toContain("Test Heading");
    // Image should be an attachment URL, not base64
    expect(rawContent).not.toMatch(/data:image/);
  });

  it("returns 400 for an empty file", async () => {
    session.current = alice;
    const fd = new FormData();
    fd.append("file", new File([], "empty.txt", { type: "text/plain" }));
    const res = await importRoute.POST(formReq("/api/import", fd));
    expect(res.status).toBe(400);
  });

  it("returns 413 for a file over 4 MB", async () => {
    session.current = alice;
    const big = new Uint8Array(4 * 1024 * 1024 + 1).fill(120); // 'x'
    const fd = new FormData();
    fd.append("file", new File([big], "big.txt", { type: "text/plain" }));
    const res = await importRoute.POST(formReq("/api/import", fd));
    expect(res.status).toBe(413);
  });

  it("returns 415 for an unsupported file type", async () => {
    session.current = alice;
    const fd = new FormData();
    fd.append("file", new File(["<html></html>"], "page.html", { type: "text/html" }));
    const res = await importRoute.POST(formReq("/api/import", fd));
    expect(res.status).toBe(415);
  });

  it("returns 401 when unauthenticated", async () => {
    session.current = null;
    const fd = new FormData();
    fd.append("file", new File(["hi"], "note.txt", { type: "text/plain" }));
    const res = await importRoute.POST(formReq("/api/import", fd));
    expect(res.status).toBe(401);
  });
});

describe("file download", () => {
  it("viewer can download their document's attachment", async () => {
    // Alice imports a doc which creates a document she owns.
    session.current = alice;
    const fd = new FormData();
    fd.append("file", new File(["content"], "dl-test.txt", { type: "text/plain" }));
    const importRes = await importRoute.POST(formReq("/api/import", fd));
    expect(importRes.status).toBe(201);
    const { document: doc } = await importRes.json() as { document: { id: string } };

    // Upload an attachment manually so we have a known file id.
    const attRoute = await import("@/app/api/docs/[id]/attachments/route");
    const aFd = new FormData();
    aFd.append("file", new File(["hello bytes"], "hello.txt", { type: "text/plain" }));
    const attRes = await attRoute.POST(
      formReq(`/api/docs/${doc.id}/attachments`, aFd),
      params(doc.id),
    );
    expect(attRes.status).toBe(201);
    const { attachment } = await attRes.json() as { attachment: { id: string } };

    // Alice (owner) can download.
    const dlRes = await filesRoute.GET(getReq(`/api/files/${attachment.id}`), params(attachment.id));
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers.get("x-content-type-options")).toBe("nosniff");

    // Stranger cannot download (gets 404 since no access).
    session.current = stranger;
    const denyRes = await filesRoute.GET(getReq(`/api/files/${attachment.id}`), params(attachment.id));
    expect(denyRes.status).toBe(404);
  });
});
