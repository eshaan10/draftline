import { beforeAll, describe, expect, it, vi } from "vitest";
import type { User } from "@/server/schema";

const session = { current: null as User | null };

vi.mock("next/headers", () => ({
  cookies: async () => ({ set() {}, get() { return undefined; }, delete() {} }),
}));

vi.mock("@/server/auth", async () => {
  const actual = await vi.importActual<typeof import("@/server/auth")>("@/server/auth");
  return {
    ...actual,
    getSessionUser: async () => session.current,
  };
});

const { getDb } = await import("@/server/db");
const { users } = await import("@/server/schema");
const bcryptMod = await import("bcryptjs");
const bcrypt = bcryptMod.default ?? bcryptMod;

const list = await import("@/app/api/docs/route");
const one = await import("@/app/api/docs/[id]/route");

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

function jsonReq(path: string, method: string, body?: unknown) {
  return new Request(`http://local${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

let alice: User;
let bob: User;

beforeAll(async () => {
  alice = await makeUser("alice-docs@demo.test");
  bob = await makeUser("bob-docs@demo.test");
});

describe("docs API", () => {
  it("creates, lists, reads, renames", async () => {
    session.current = alice;

    const createRes = await list.POST(jsonReq("/api/docs", "POST", { title: "First" }));
    expect(createRes.status).toBe(201);
    const { document } = await createRes.json();
    expect(document.title).toBe("First");
    expect(document.version).toBe(1);

    const listRes = await list.GET();
    const listed = await listRes.json();
    expect(listed.owned.length).toBeGreaterThanOrEqual(1);
    expect(listed.shared).toEqual([]);

    const getRes = await one.GET(jsonReq(`/api/docs/${document.id}`, "GET"), params(document.id));
    expect(getRes.status).toBe(200);
    const got = await getRes.json();
    expect(got.access).toBe("owner");

    const renameRes = await one.PATCH(
      jsonReq(`/api/docs/${document.id}`, "PATCH", { title: "Renamed" }),
      params(document.id),
    );
    expect(renameRes.status).toBe(200);
    const renamed = await renameRes.json();
    expect(renamed.document.title).toBe("Renamed");
  });

  it("optimistic concurrency: stale baseVersion returns 409", async () => {
    session.current = alice;
    const created = await list.POST(jsonReq("/api/docs", "POST", { title: "Concurrency" }));
    const { document } = await created.json();

    const content = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "v2" }] }],
    };
    const first = await one.PUT(
      jsonReq(`/api/docs/${document.id}`, "PUT", { content, baseVersion: 1 }),
      params(document.id),
    );
    expect(first.status).toBe(200);
    expect((await first.json()).document.version).toBe(2);

    const stale = await one.PUT(
      jsonReq(`/api/docs/${document.id}`, "PUT", { content, baseVersion: 1 }),
      params(document.id),
    );
    expect(stale.status).toBe(409);
    const staleBody = await stale.json();
    expect(staleBody.error.code).toBe("stale_version");
    expect(staleBody.currentVersion).toBe(2);
  });

  it("non-owner gets 404, delete only by owner", async () => {
    session.current = alice;
    const created = await list.POST(jsonReq("/api/docs", "POST", { title: "Alice only" }));
    const { document } = await created.json();

    session.current = bob;
    const getAsBob = await one.GET(jsonReq(`/api/docs/${document.id}`, "GET"), params(document.id));
    expect(getAsBob.status).toBe(404);

    const delAsBob = await one.DELETE(
      jsonReq(`/api/docs/${document.id}`, "DELETE"),
      params(document.id),
    );
    expect(delAsBob.status).toBe(404);

    session.current = alice;
    const delAsAlice = await one.DELETE(
      jsonReq(`/api/docs/${document.id}`, "DELETE"),
      params(document.id),
    );
    expect(delAsAlice.status).toBe(200);

    const afterDelete = await one.GET(
      jsonReq(`/api/docs/${document.id}`, "GET"),
      params(document.id),
    );
    expect(afterDelete.status).toBe(404);
  });

  it("round-trips bold, heading, list, and table content", async () => {
    session.current = alice;
    const created = await list.POST(jsonReq("/api/docs", "POST", { title: "Round trip" }));
    const { document } = await created.json();

    const rich = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Title" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", marks: [{ type: "bold" }], text: "bold" },
            { type: "text", text: " then plain" },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "one" }] },
              ],
            },
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "two" }] },
              ],
            },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  attrs: { colspan: 1, rowspan: 1 },
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "H" }] },
                  ],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { colspan: 1, rowspan: 1 },
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "C" }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const putRes = await one.PUT(
      jsonReq(`/api/docs/${document.id}`, "PUT", { content: rich, baseVersion: 1 }),
      params(document.id),
    );
    expect(putRes.status).toBe(200);

    const getRes = await one.GET(jsonReq(`/api/docs/${document.id}`, "GET"), params(document.id));
    const { document: back } = await getRes.json();
    expect(back.content).toEqual(rich);
  });

  it("round-trips color, highlight, font-family, font-size, and line-height attrs", async () => {
    session.current = alice;
    const created = await list.POST(jsonReq("/api/docs", "POST", { title: "Marks" }));
    const { document } = await created.json();

    const rich = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, lineHeight: "1.5", textAlign: null },
          content: [
            {
              type: "text",
              marks: [
                {
                  type: "textStyle",
                  attrs: { color: "#ef4444", fontFamily: "Georgia, serif", fontSize: "20pt" },
                },
              ],
              text: "Styled heading",
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { lineHeight: "2", textAlign: null },
          content: [
            {
              type: "text",
              marks: [{ type: "highlight", attrs: { color: "#fef08a" } }],
              text: "highlighted",
            },
          ],
        },
      ],
    };

    const putRes = await one.PUT(
      jsonReq(`/api/docs/${document.id}`, "PUT", { content: rich, baseVersion: 1 }),
      params(document.id),
    );
    expect(putRes.status).toBe(200);

    const getRes = await one.GET(jsonReq(`/api/docs/${document.id}`, "GET"), params(document.id));
    const { document: back } = await getRes.json();
    expect(back.content).toEqual(rich);
  });

  it("rejects invalid UUID with 404 (does not leak existence)", async () => {
    session.current = alice;
    const res = await one.GET(jsonReq(`/api/docs/not-a-uuid`, "GET"), params("not-a-uuid"));
    expect(res.status).toBe(404);
  });

  it("unauthorized list returns 401", async () => {
    session.current = null;
    const res = await list.GET();
    expect(res.status).toBe(401);
  });
});
