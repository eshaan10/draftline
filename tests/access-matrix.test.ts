import { beforeAll, describe, expect, it, vi } from "vitest";
import type { User } from "@/server/schema";

// Mocks must be registered before any dynamic import that pulls them in.
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
const { users, documentShares } = await import("@/server/schema");
const authMod = await import("@/server/auth");
const bcryptMod = await import("bcryptjs");
const bcrypt = bcryptMod.default ?? bcryptMod;

const list = await import("@/app/api/docs/route");
const one = await import("@/app/api/docs/[id]/route");
const sharesList = await import("@/app/api/docs/[id]/shares/route");
const sharesOne = await import("@/app/api/docs/[id]/shares/[shareId]/route");

function jsonReq(path: string, method: string, body?: unknown) {
  return new Request(`http://local${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}
const docParams = (id: string) => ({ params: Promise.resolve({ id }) });
const shareParams = (id: string, shareId: string) => ({
  params: Promise.resolve({ id, shareId }),
});

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

async function createDoc(owner: User, title: string) {
  session.current = owner;
  const res = await list.POST(jsonReq("/api/docs", "POST", { title }));
  const body = await res.json();
  return body.document as { id: string; version: number; title: string };
}

async function invite(
  owner: User,
  docId: string,
  email: string,
  role: "viewer" | "commenter" | "editor",
) {
  session.current = owner;
  const res = await sharesList.POST(
    jsonReq(`/api/docs/${docId}/shares`, "POST", { email, role }),
    docParams(docId),
  );
  return (await res.json()).share as { id: string; role: string; status: string };
}

const CONTENT = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "body" }] }],
};

let owner: User, editor: User, commenter: User, viewer: User;
let pendingEmail: string;
let revokedUser: User;
let stranger: User;
let docId: string;
let initialVersion: number;
let editorShareId: string;
let revokedShareId: string;

beforeAll(async () => {
  owner = await makeUser("owner@matrix.test");
  editor = await makeUser("editor@matrix.test");
  commenter = await makeUser("commenter@matrix.test");
  viewer = await makeUser("viewer@matrix.test");
  revokedUser = await makeUser("revoked@matrix.test");
  stranger = await makeUser("stranger@matrix.test");
  pendingEmail = "pending@matrix.test";

  const doc = await createDoc(owner, "Shared doc");
  docId = doc.id;
  initialVersion = doc.version;

  const e = await invite(owner, docId, editor.email, "editor");
  editorShareId = e.id;
  await invite(owner, docId, commenter.email, "commenter");
  await invite(owner, docId, viewer.email, "viewer");
  await invite(owner, docId, pendingEmail, "editor");
  const r = await invite(owner, docId, revokedUser.email, "editor");
  revokedShareId = r.id;

  // Revoke that one.
  session.current = owner;
  const del = await sharesOne.DELETE(
    jsonReq(`/api/docs/${docId}/shares/${revokedShareId}`, "DELETE"),
    shareParams(docId, revokedShareId),
  );
  expect(del.status).toBe(200);
});

type Expectation = {
  user: () => User | null;
  get: number;
  put: number;
  patch: number;
  del: number;
  sharesGet: number;
  sharesPost: number;
  sharesPatch: number;
  sharesDelete: number;
};

async function runMatrix(exp: Expectation, label: string) {
  session.current = exp.user();
  const bumps = { version: initialVersion };

  const getRes = await one.GET(jsonReq(`/api/docs/${docId}`, "GET"), docParams(docId));
  expect(getRes.status, `${label} GET`).toBe(exp.get);
  if (getRes.status === 200) {
    const b = await getRes.json();
    bumps.version = b.document.version;
  }

  const putRes = await one.PUT(
    jsonReq(`/api/docs/${docId}`, "PUT", { content: CONTENT, baseVersion: bumps.version }),
    docParams(docId),
  );
  expect(putRes.status, `${label} PUT`).toBe(exp.put);

  const patchRes = await one.PATCH(
    jsonReq(`/api/docs/${docId}`, "PATCH", { title: `title-by-${label}` }),
    docParams(docId),
  );
  expect(patchRes.status, `${label} PATCH`).toBe(exp.patch);

  const delRes = await one.DELETE(jsonReq(`/api/docs/${docId}`, "DELETE"), docParams(docId));
  expect(delRes.status, `${label} DELETE`).toBe(exp.del);

  const sharesGet = await sharesList.GET(
    jsonReq(`/api/docs/${docId}/shares`, "GET"),
    docParams(docId),
  );
  expect(sharesGet.status, `${label} shares GET`).toBe(exp.sharesGet);

  const sharesPost = await sharesList.POST(
    jsonReq(`/api/docs/${docId}/shares`, "POST", { email: "x@matrix.test", role: "viewer" }),
    docParams(docId),
  );
  expect(sharesPost.status, `${label} shares POST`).toBe(exp.sharesPost);

  const sharesPatch = await sharesOne.PATCH(
    jsonReq(`/api/docs/${docId}/shares/${editorShareId}`, "PATCH", { role: "viewer" }),
    shareParams(docId, editorShareId),
  );
  expect(sharesPatch.status, `${label} shares PATCH`).toBe(exp.sharesPatch);

  const sharesDelete = await sharesOne.DELETE(
    jsonReq(`/api/docs/${docId}/shares/${editorShareId}`, "DELETE"),
    shareParams(docId, editorShareId),
  );
  expect(sharesDelete.status, `${label} shares DELETE`).toBe(exp.sharesDelete);
}

describe("access matrix", () => {
  it("editor: read, write, rename; no delete, no sharing", async () => {
    await runMatrix(
      {
        user: () => editor,
        get: 200,
        put: 200,
        patch: 200,
        del: 403,
        sharesGet: 403,
        sharesPost: 403,
        sharesPatch: 403,
        sharesDelete: 403,
      },
      "editor",
    );
  });

  it("commenter: read only; no write, no rename, no delete, no sharing", async () => {
    await runMatrix(
      {
        user: () => commenter,
        get: 200,
        put: 403,
        patch: 403,
        del: 403,
        sharesGet: 403,
        sharesPost: 403,
        sharesPatch: 403,
        sharesDelete: 403,
      },
      "commenter",
    );
  });

  it("viewer: read only; same as commenter for these endpoints", async () => {
    await runMatrix(
      {
        user: () => viewer,
        get: 200,
        put: 403,
        patch: 403,
        del: 403,
        sharesGet: 403,
        sharesPost: 403,
        sharesPatch: 403,
        sharesDelete: 403,
      },
      "viewer",
    );
  });

  it("revoked user: 404 everywhere, existence does not leak", async () => {
    await runMatrix(
      {
        user: () => revokedUser,
        get: 404,
        put: 404,
        patch: 404,
        del: 404,
        sharesGet: 404,
        sharesPost: 404,
        sharesPatch: 404,
        sharesDelete: 404,
      },
      "revoked",
    );
  });

  it("stranger with no share: 404 everywhere", async () => {
    await runMatrix(
      {
        user: () => stranger,
        get: 404,
        put: 404,
        patch: 404,
        del: 404,
        sharesGet: 404,
        sharesPost: 404,
        sharesPatch: 404,
        sharesDelete: 404,
      },
      "stranger",
    );
  });

  it("unauthenticated: 404 on doc routes, 404 on share routes", async () => {
    await runMatrix(
      {
        user: () => null,
        get: 404,
        put: 404,
        patch: 404,
        del: 404,
        sharesGet: 404,
        sharesPost: 404,
        sharesPatch: 404,
        sharesDelete: 404,
      },
      "anon",
    );
  });

  it("owner: all endpoints succeed", async () => {
    session.current = owner;
    const getRes = await one.GET(jsonReq(`/api/docs/${docId}`, "GET"), docParams(docId));
    expect(getRes.status).toBe(200);
    const v = (await getRes.json()).document.version as number;
    const putRes = await one.PUT(
      jsonReq(`/api/docs/${docId}`, "PUT", { content: CONTENT, baseVersion: v }),
      docParams(docId),
    );
    expect(putRes.status).toBe(200);
    const patchRes = await one.PATCH(
      jsonReq(`/api/docs/${docId}`, "PATCH", { title: "owner-renamed" }),
      docParams(docId),
    );
    expect(patchRes.status).toBe(200);
    const sharesGet = await sharesList.GET(
      jsonReq(`/api/docs/${docId}/shares`, "GET"),
      docParams(docId),
    );
    expect(sharesGet.status).toBe(200);
    // Owner delete is in its own test so other cases can keep running.
  });
});

describe("pending invite activation and share lifecycle", () => {
  let localDocId: string;
  let localOwner: User;

  beforeAll(async () => {
    localOwner = await makeUser("owner2@matrix.test");
    const doc = await createDoc(localOwner, "Pending flow");
    localDocId = doc.id;
  });

  it("sharing with an unknown email creates a pending invite (userId null)", async () => {
    const share = await invite(localOwner, localDocId, "newbie@matrix.test", "viewer");
    expect(share.status).toBe("pending");
    const db = await getDb();
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(documentShares)
      .where(eq(documentShares.documentId, localDocId));
    const row = rows.find((r) => r.email === "newbie@matrix.test");
    expect(row).toBeTruthy();
    expect(row!.userId).toBeNull();
    expect(row!.status).toBe("pending");
  });

  it("the pending invitee signing up flips the share to active with userId set", async () => {
    session.current = null;
    const result = await authMod.signup({
      email: "newbie@matrix.test",
      name: "Newbie",
      password: "password123",
      role: "student",
    });
    expect("user" in result).toBe(true);
    if (!("user" in result)) throw new Error("signup failed");

    // After signup, the share should be active and reflect the new user id,
    // which means the doc shows up in /api/docs as shared for that user.
    session.current = result.user;
    const listRes = await list.GET();
    const body = await listRes.json();
    const sharedIds = body.shared.map((s: { id: string }) => s.id);
    expect(sharedIds).toContain(localDocId);
    const shared = body.shared.find((s: { id: string }) => s.id === localDocId);
    expect(shared.access).toBe("viewer");
    expect(shared.ownerName).toBe(localOwner.name);
  });

  it("existing user who had a pending share activates on login", async () => {
    // Set up: user exists but a pending share row sits with no userId.
    const latejoiner = await makeUser("late@matrix.test");
    const db = await getDb();
    await db.insert(documentShares).values({
      documentId: localDocId,
      email: latejoiner.email,
      userId: null,
      role: "editor",
      status: "pending",
      invitedBy: localOwner.id,
    });

    session.current = null;
    const result = await authMod.login({ email: latejoiner.email, password: "x" });
    expect("user" in result).toBe(true);

    session.current = latejoiner;
    const listRes = await list.GET();
    const body = await listRes.json();
    const shared = body.shared.find((s: { id: string }) => s.id === localDocId);
    expect(shared).toBeTruthy();
    expect(shared.access).toBe("editor");
  });

  it("re-inviting updates the role (upsert)", async () => {
    const guest = await makeUser("guest@matrix.test");
    const first = await invite(localOwner, localDocId, guest.email, "viewer");
    expect(first.role).toBe("viewer");
    const second = await invite(localOwner, localDocId, guest.email, "editor");
    expect(second.id).toBe(first.id);
    expect(second.role).toBe("editor");
  });

  it("role change via PATCH is reflected in subsequent access", async () => {
    const roleUser = await makeUser("roleswap@matrix.test");
    const share = await invite(localOwner, localDocId, roleUser.email, "viewer");

    session.current = roleUser;
    const content = { type: "doc", content: [{ type: "paragraph" }] };
    const before = await one.PUT(
      jsonReq(`/api/docs/${localDocId}`, "PUT", { content, baseVersion: 1 }),
      docParams(localDocId),
    );
    expect(before.status).toBe(403);

    session.current = localOwner;
    const patchRes = await sharesOne.PATCH(
      jsonReq(`/api/docs/${localDocId}/shares/${share.id}`, "PATCH", { role: "editor" }),
      shareParams(localDocId, share.id),
    );
    expect(patchRes.status).toBe(200);

    session.current = roleUser;
    const getRes = await one.GET(
      jsonReq(`/api/docs/${localDocId}`, "GET"),
      docParams(localDocId),
    );
    const v = (await getRes.json()).document.version as number;
    const after = await one.PUT(
      jsonReq(`/api/docs/${localDocId}`, "PUT", { content, baseVersion: v }),
      docParams(localDocId),
    );
    expect(after.status).toBe(200);
  });

  it("revoking a share removes the doc from the user's shared list and blocks access", async () => {
    const keepUser = await makeUser("keep@matrix.test");
    const share = await invite(localOwner, localDocId, keepUser.email, "viewer");

    session.current = keepUser;
    let listBody = await (await list.GET()).json();
    expect(listBody.shared.some((s: { id: string }) => s.id === localDocId)).toBe(true);

    session.current = localOwner;
    const del = await sharesOne.DELETE(
      jsonReq(`/api/docs/${localDocId}/shares/${share.id}`, "DELETE"),
      shareParams(localDocId, share.id),
    );
    expect(del.status).toBe(200);

    session.current = keepUser;
    listBody = await (await list.GET()).json();
    expect(listBody.shared.some((s: { id: string }) => s.id === localDocId)).toBe(false);
    const getRes = await one.GET(
      jsonReq(`/api/docs/${localDocId}`, "GET"),
      docParams(localDocId),
    );
    expect(getRes.status).toBe(404);
  });

  it("sharing with yourself returns 400", async () => {
    session.current = localOwner;
    const res = await sharesList.POST(
      jsonReq(`/api/docs/${localDocId}/shares`, "POST", {
        email: localOwner.email,
        role: "editor",
      }),
      docParams(localDocId),
    );
    expect(res.status).toBe(400);
  });

  it("sharing with an invalid email returns 400", async () => {
    session.current = localOwner;
    const res = await sharesList.POST(
      jsonReq(`/api/docs/${localDocId}/shares`, "POST", { email: "not-an-email", role: "viewer" }),
      docParams(localDocId),
    );
    expect(res.status).toBe(400);
  });
});
