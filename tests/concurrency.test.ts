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

let alice: User;

beforeAll(async () => {
  alice = await makeUser("conc@demo.test");
});

describe("single-user autosave contract", () => {
  it("rapid edits plus a rename never 409 when the client uses the version returned by each response", async () => {
    session.current = alice;

    const createRes = await list.POST(jsonReq("/api/docs", "POST", { title: "Rapid" }));
    const { document: created } = await createRes.json();
    let version: number = created.version;
    const startVersion = version;

    // Simulate what the fixed client does: await each PUT before sending the next,
    // and read the new version from each response. A PATCH lands in the middle.
    for (let i = 0; i < 5; i++) {
      if (i === 2) {
        const r = await one.PATCH(
          jsonReq(`/api/docs/${created.id}`, "PATCH", { title: `Renamed ${i}` }),
          params(created.id),
        );
        expect(r.status).toBe(200);
        const body = await r.json();
        // PATCH must not bump the content version.
        expect(body.document.version).toBe(version);
        version = body.document.version;
      }
      const content = {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: `edit ${i}` }] }],
      };
      const r = await one.PUT(
        jsonReq(`/api/docs/${created.id}`, "PUT", { content, baseVersion: version }),
        params(created.id),
      );
      expect(r.status).toBe(200);
      const body = await r.json();
      version = body.document.version;
    }

    // One bump per PUT; rename did not bump.
    expect(version).toBe(startVersion + 5);
  });

  it("genuinely stale baseVersion still returns 409", async () => {
    session.current = alice;
    const createRes = await list.POST(jsonReq("/api/docs", "POST", { title: "Stale" }));
    const { document: created } = await createRes.json();

    const content = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "v2" }] }],
    };
    const ok = await one.PUT(
      jsonReq(`/api/docs/${created.id}`, "PUT", { content, baseVersion: created.version }),
      params(created.id),
    );
    expect(ok.status).toBe(200);

    const stale = await one.PUT(
      jsonReq(`/api/docs/${created.id}`, "PUT", { content, baseVersion: created.version }),
      params(created.id),
    );
    expect(stale.status).toBe(409);
    const staleBody = await stale.json();
    expect(staleBody.error.code).toBe("stale_version");
  });

  it("PATCH response carries the current (unchanged) version so the client stays in sync", async () => {
    session.current = alice;
    const createRes = await list.POST(jsonReq("/api/docs", "POST", { title: "Patch sync" }));
    const { document: created } = await createRes.json();

    // First PUT bumps to v2.
    const putRes = await one.PUT(
      jsonReq(`/api/docs/${created.id}`, "PUT", {
        content: { type: "doc", content: [{ type: "paragraph" }] },
        baseVersion: created.version,
      }),
      params(created.id),
    );
    const v2 = (await putRes.json()).document.version as number;
    expect(v2).toBe(created.version + 1);

    // PATCH returns a document; its version must still be v2 (rename does not bump).
    const patchRes = await one.PATCH(
      jsonReq(`/api/docs/${created.id}`, "PATCH", { title: "Renamed again" }),
      params(created.id),
    );
    const patchBody = await patchRes.json();
    expect(patchBody.document.version).toBe(v2);

    // Using the version from PATCH response for the next PUT must succeed.
    const nextPut = await one.PUT(
      jsonReq(`/api/docs/${created.id}`, "PUT", {
        content: { type: "doc", content: [{ type: "paragraph" }] },
        baseVersion: patchBody.document.version,
      }),
      params(created.id),
    );
    expect(nextPut.status).toBe(200);
  });
});
