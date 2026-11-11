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

const { getDb, resetTestDb } = await import("@/server/db");
const { users, documents } = await import("@/server/schema");
const bcryptMod = await import("bcryptjs");
const bcrypt = bcryptMod.default ?? bcryptMod;

const eventsRoute = await import("@/app/api/docs/[id]/events/route");
const replayRoute = await import("@/app/api/docs/[id]/replay/route");
const docListRoute = await import("@/app/api/docs/route");
const docRoute = await import("@/app/api/docs/[id]/route");

// computeFacts and buildAuthorColors are pure; import directly.
const { computeFacts } = await import("@/features/replay/facts");
const { buildAuthorColors } = await import("@/features/replay/authorColors");

// buildDocAtIndex is used by the player; it imports from @tiptap/pm and @tiptap/core.
// Those work in Node.js (no DOM needed), so we can import and test them here.
const { buildDocAtIndex } = await import("@/features/replay/ReplayPlayer");

// Tiptap/PM imports for constructing test steps.
const { getSchema } = await import("@tiptap/core");
const StarterKitMod = await import("@tiptap/starter-kit");
const StarterKit = StarterKitMod.default ?? StarterKitMod;
const { Node, Slice, Fragment } = await import("@tiptap/pm/model");
const { ReplaceStep } = await import("@tiptap/pm/transform");

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
  await resetTestDb();
  alice = await makeUser("alice-replay@demo.test");
  bob = await makeUser("bob-replay@demo.test");
});

// -------------------------------------------------------------------------
// helpers
// -------------------------------------------------------------------------

async function createDoc(user: User, title = "Replay doc"): Promise<{ id: string; version: number }> {
  session.current = user;
  const res = await docListRoute.POST(jsonReq("/api/docs", "POST", { title }));
  const { document } = await res.json();
  return document as { id: string; version: number };
}

// -------------------------------------------------------------------------
// Test a: Fidelity -- build steps, store them, replay them, check final doc.
// -------------------------------------------------------------------------
describe("Test a: fidelity", () => {
  it("replays ProseMirror steps to produce the correct final document", async () => {
    const doc = await createDoc(alice, "Fidelity doc");
    session.current = alice;

    // Build a schema with StarterKit so we can create steps.
    const schema = getSchema([StarterKit]);

    // Initial doc: { type: 'doc', content: [{ type: 'paragraph' }] }
    const initialContent = { type: "doc", content: [{ type: "paragraph" }] };
    let pmDoc = Node.fromJSON(schema, initialContent);

    // Step 1: insert "hello" at position 1
    const helloText = schema.text("hello");
    const helloSlice = new Slice(Fragment.from(helloText), 0, 0);
    const step1 = new ReplaceStep(1, 1, helloSlice);
    const result1 = step1.apply(pmDoc);
    expect(result1.failed).toBeNull();
    pmDoc = result1.doc!;

    // Step 2: insert " world" at position 6 (after "hello")
    const worldText = schema.text(" world");
    const worldSlice = new Slice(Fragment.from(worldText), 0, 0);
    const step2 = new ReplaceStep(6, 6, worldSlice);
    const result2 = step2.apply(pmDoc);
    expect(result2.failed).toBeNull();
    pmDoc = result2.doc!;

    const finalDocJson = pmDoc.toJSON();

    // POST events: seq 0 (initial checkpoint), seq 1 (step1), seq 2 (step2)
    const post0 = await eventsRoute.POST(
      jsonReq(`/api/docs/${doc.id}/events`, "POST", {
        events: [
          {
            seq: 0,
            kind: "type",
            steps: [],
            inserted: 0,
            deleted: 0,
            clientT: 0,
            checkpoint: initialContent,
          },
        ],
      }),
      params(doc.id),
    );
    expect(post0.status).toBe(201);

    const post1 = await eventsRoute.POST(
      jsonReq(`/api/docs/${doc.id}/events`, "POST", {
        events: [
          {
            seq: 1,
            kind: "type",
            steps: [step1.toJSON()],
            inserted: 5,
            deleted: 0,
            clientT: 100,
          },
          {
            seq: 2,
            kind: "type",
            steps: [step2.toJSON()],
            inserted: 6,
            deleted: 0,
            clientT: 200,
          },
        ],
      }),
      params(doc.id),
    );
    expect(post1.status).toBe(201);
    const post1Body = await post1.json();
    expect(post1Body.nextSeq).toBe(3);

    // GET replay and verify final doc
    const replayRes = await replayRoute.GET(
      jsonReq(`/api/docs/${doc.id}/replay`, "GET"),
      params(doc.id),
    );
    expect(replayRes.status).toBe(200);
    const { events, nextSeq } = await replayRes.json() as {
      events: Array<{ seq: number; kind: string; steps: unknown[]; checkpoint: unknown | null; inserted: number; deleted: number; clientT: number; receivedAt: string }>;
      nextSeq: number;
    };
    expect(events.length).toBe(3);
    expect(nextSeq).toBe(3);

    // Use buildDocAtIndex to replay all 3 events (index 2 = last event)
    const replayed = buildDocAtIndex(events as Parameters<typeof buildDocAtIndex>[0], 2);
    expect(replayed).not.toBeNull();

    // The final doc should have text "hello world"
    const replayedNode = Node.fromJSON(schema, replayed as object);
    const text = replayedNode.textContent;
    expect(text).toBe("hello world");

    // The final doc should have text "hello world" regardless of which schema was
    // used to construct the initial steps. The attrs (textAlign, lineHeight) differ
    // between StarterKit-only and buildExtensions() schemas; we only assert text content.
    // (We already asserted text above.)
    void finalDocJson; // used only to verify step application succeeded
  });
});

// -------------------------------------------------------------------------
// Test a2: Line spacing fidelity with the real buildExtensions() schema.
// Uses the same schema as the editor and the replay player so that full
// JSON equality (including lineHeight attrs) can be asserted.
// -------------------------------------------------------------------------
describe("Test a2: line spacing fidelity with buildExtensions() schema", () => {
  it("replays lineHeight changes on paragraph and heading and matches full doc JSON", async () => {
    const { buildExtensions } = await import("@/features/editor/editorExtensions");
    const { buildLineHeightTransaction } = await import("@/features/editor/extensions");
    const { EditorState, TextSelection } = await import("@tiptap/pm/state");

    const doc = await createDoc(alice, "Line spacing fidelity");
    session.current = alice;

    // The replay player uses getSchema(buildExtensions()) -- use the same schema here.
    const fullSchema = getSchema(buildExtensions());

    // Initial doc: heading "Title" + paragraph "Body text".
    // No lineHeight attrs in the seed JSON; they will default to null when
    // the schema fills in defaults via Node.fromJSON.
    const initialContent = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
        { type: "paragraph", content: [{ type: "text", text: "Body text" }] },
      ],
    };

    // POST seq 0 (checkpoint).
    const post0 = await eventsRoute.POST(
      jsonReq(`/api/docs/${doc.id}/events`, "POST", {
        events: [{ seq: 0, kind: "type", steps: [], inserted: 0, deleted: 0, clientT: 0, checkpoint: initialContent }],
      }),
      params(doc.id),
    );
    expect(post0.status).toBe(201);

    // Build step1: set heading lineHeight to "1.5" via a caret at pos 1 (inside heading).
    let pmDoc = Node.fromJSON(fullSchema, initialContent);
    const headingState = EditorState.create({
      schema: fullSchema,
      doc: pmDoc,
      selection: TextSelection.create(pmDoc, 1),
    });
    const tr1 = buildLineHeightTransaction(headingState, "1.5");
    expect(tr1.steps.length).toBe(1);
    pmDoc = tr1.doc;
    // Confirm heading got the attr.
    expect(pmDoc.firstChild?.attrs.lineHeight).toBe("1.5");

    // Build step2: set paragraph lineHeight to "2" via a caret at pos 8 (inside para).
    // Heading "Title" has nodeSize 7 (open + 5 chars + close); para opens at pos 7,
    // content starts at pos 8.
    const paraInternalPos = pmDoc.firstChild!.nodeSize + 1;
    const paraState = EditorState.create({
      schema: fullSchema,
      doc: pmDoc,
      selection: TextSelection.create(pmDoc, paraInternalPos),
    });
    const tr2 = buildLineHeightTransaction(paraState, "2");
    expect(tr2.steps.length).toBe(1);
    pmDoc = tr2.doc;
    expect(pmDoc.lastChild?.attrs.lineHeight).toBe("2");

    const finalDocJson = pmDoc.toJSON();

    // POST seq 1 (heading change) and seq 2 (paragraph change).
    const post1 = await eventsRoute.POST(
      jsonReq(`/api/docs/${doc.id}/events`, "POST", {
        events: [
          { seq: 1, kind: "format", steps: [tr1.steps[0].toJSON()], inserted: 0, deleted: 0, clientT: 100 },
          { seq: 2, kind: "format", steps: [tr2.steps[0].toJSON()], inserted: 0, deleted: 0, clientT: 200 },
        ],
      }),
      params(doc.id),
    );
    expect(post1.status).toBe(201);

    // GET replay events and use buildDocAtIndex to replay from checkpoint.
    const replayRes = await replayRoute.GET(
      jsonReq(`/api/docs/${doc.id}/replay`, "GET"),
      params(doc.id),
    );
    expect(replayRes.status).toBe(200);
    const { events } = await replayRes.json() as { events: Parameters<typeof buildDocAtIndex>[0]; nextSeq: number };
    expect(events.length).toBe(3);

    const replayed = buildDocAtIndex(events, 2);
    expect(replayed).not.toBeNull();

    // Full JSON equality: both doc and replay use buildExtensions() schema,
    // so lineHeight attrs round-trip correctly through setNodeMarkup steps.
    const replayedNode = Node.fromJSON(fullSchema, replayed as object);
    expect(replayedNode.toJSON()).toEqual(finalDocJson);

    // Confirm the specific attrs are present in the replayed result.
    expect(replayedNode.firstChild?.attrs.lineHeight).toBe("1.5");
    expect(replayedNode.lastChild?.attrs.lineHeight).toBe("2");
  });
});

// -------------------------------------------------------------------------
// Test b: Facts correctness
// -------------------------------------------------------------------------
describe("Test b: facts correctness", () => {
  it("computes active writing time, sessions, paste events, and char sources correctly", () => {
    // 2 sessions: gap between event 2 and 3 is > 30 minutes.
    const events = [
      { seq: 0, kind: "type" as const, inserted: 5, deleted: 0, clientT: 0, receivedAt: "2024-01-01T00:00:00.000Z" },
      { seq: 1, kind: "type" as const, inserted: 3, deleted: 1, clientT: 1000, receivedAt: "2024-01-01T00:00:01.000Z" },
      { seq: 2, kind: "paste" as const, inserted: 50, deleted: 0, clientT: 5000, receivedAt: "2024-01-01T00:00:05.000Z" },
      // gap > 30 minutes (1_800_000 ms) -> new session
      { seq: 3, kind: "type" as const, inserted: 2, deleted: 0, clientT: 5000 + 2_000_000, receivedAt: "2024-01-01T00:33:00.000Z" },
      { seq: 4, kind: "import" as const, inserted: 100, deleted: 0, clientT: 5000 + 2_000_000 + 500, receivedAt: "2024-01-01T00:33:00.500Z" },
    ];

    const facts = computeFacts(events);

    // Active writing: gaps that are <= 120000ms
    // gap 0->1: 1000ms (counted)
    // gap 1->2: 4000ms (counted)
    // gap 2->3: 2_000_000ms (idle, NOT counted)
    // gap 3->4: 500ms (counted)
    expect(facts.activeWritingMs).toBe(1000 + 4000 + 500);

    // Sessions: 1 initial + 1 gap > 30min = 2
    expect(facts.sessionCount).toBe(2);

    // Revisions: all 5 events
    expect(facts.revisionCount).toBe(5);

    // Paste events: only seq 2
    expect(facts.pasteEvents.length).toBe(1);
    expect(facts.pasteEvents[0].seq).toBe(2);
    expect(facts.pasteEvents[0].insertedChars).toBe(50);

    // Chars by source:
    // typed (kind=type,delete,format,undo,other): 5+3+2 = 10
    // pasted (kind=paste): 50
    // imported (kind=import): 100
    expect(facts.charsBySource.typed).toBe(10);
    expect(facts.charsBySource.pasted).toBe(50);
    expect(facts.charsBySource.imported).toBe(100);
    expect(facts.charsBySource.total).toBe(160);
  });

  it("returns zeroed facts for empty events array", () => {
    const facts = computeFacts([]);
    expect(facts.activeWritingMs).toBe(0);
    expect(facts.sessionCount).toBe(0);
    expect(facts.revisionCount).toBe(0);
    expect(facts.pasteEvents).toEqual([]);
    expect(facts.charsBySource.total).toBe(0);
  });
});

// -------------------------------------------------------------------------
// Test c: Server rejects seq gaps and duplicates
// -------------------------------------------------------------------------
describe("Test c: seq gap and duplicate rejection", () => {
  it("accepts seq 0 as the first event and rejects gaps and duplicates", async () => {
    const doc = await createDoc(alice, "Seq gap doc");
    session.current = alice;

    // POST seq 0 -> 201
    const r0 = await eventsRoute.POST(
      jsonReq(`/api/docs/${doc.id}/events`, "POST", {
        events: [{ seq: 0, kind: "type", steps: [], inserted: 0, deleted: 0, clientT: 0, checkpoint: { type: "doc", content: [{ type: "paragraph" }] } }],
      }),
      params(doc.id),
    );
    expect(r0.status).toBe(201);

    // POST seq 2 (skipping 1) -> 409
    const r2skip = await eventsRoute.POST(
      jsonReq(`/api/docs/${doc.id}/events`, "POST", {
        events: [{ seq: 2, kind: "type", steps: [], inserted: 0, deleted: 0, clientT: 100 }],
      }),
      params(doc.id),
    );
    expect(r2skip.status).toBe(409);
    const body2skip = await r2skip.json() as { error: { code: string } };
    expect(body2skip.error.code).toBe("seq_gap");

    // POST seq 1 -> 201
    const r1 = await eventsRoute.POST(
      jsonReq(`/api/docs/${doc.id}/events`, "POST", {
        events: [{ seq: 1, kind: "type", steps: [], inserted: 1, deleted: 0, clientT: 50 }],
      }),
      params(doc.id),
    );
    expect(r1.status).toBe(201);

    // POST seq 1 again (duplicate) -> 409
    const r1dup = await eventsRoute.POST(
      jsonReq(`/api/docs/${doc.id}/events`, "POST", {
        events: [{ seq: 1, kind: "type", steps: [], inserted: 1, deleted: 0, clientT: 50 }],
      }),
      params(doc.id),
    );
    expect(r1dup.status).toBe(409);
    const body1dup = await r1dup.json() as { error: { code: string } };
    expect(body1dup.error.code).toBe("seq_gap");
  });
});

// -------------------------------------------------------------------------
// Test d: Access control on replay route
// -------------------------------------------------------------------------
describe("Test d: replay access control", () => {
  it("returns 401 for unauthenticated requests", async () => {
    const doc = await createDoc(alice, "Access doc");
    session.current = null;

    const res = await replayRoute.GET(
      jsonReq(`/api/docs/${doc.id}/replay`, "GET"),
      params(doc.id),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for a user with no access to the document", async () => {
    const doc = await createDoc(alice, "Access doc 2");
    session.current = bob;

    const res = await replayRoute.GET(
      jsonReq(`/api/docs/${doc.id}/replay`, "GET"),
      params(doc.id),
    );
    // bob has no access -> getDocAccess returns level=null, document exists -> 403
    expect(res.status).toBe(403);
  });

  it("returns 200 for the owner", async () => {
    const doc = await createDoc(alice, "Owner replay doc");
    session.current = alice;

    // Add at least one event so there's data
    await eventsRoute.POST(
      jsonReq(`/api/docs/${doc.id}/events`, "POST", {
        events: [{ seq: 0, kind: "type", steps: [], inserted: 0, deleted: 0, clientT: 0, checkpoint: { type: "doc", content: [] } }],
      }),
      params(doc.id),
    );

    const res = await replayRoute.GET(
      jsonReq(`/api/docs/${doc.id}/replay`, "GET"),
      params(doc.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { events: unknown[]; nextSeq: number };
    expect(body.events.length).toBeGreaterThanOrEqual(1);
  });
});

// -------------------------------------------------------------------------
// Test e: Immutability -- past events cannot be overwritten
// -------------------------------------------------------------------------
describe("Test e: immutability of past events", () => {
  it("rejects attempts to overwrite or skip past events", async () => {
    const doc = await createDoc(alice, "Immutable doc");
    session.current = alice;

    // Post events 0, 1, 2 successfully
    const r012 = await eventsRoute.POST(
      jsonReq(`/api/docs/${doc.id}/events`, "POST", {
        events: [
          { seq: 0, kind: "type", steps: [], inserted: 0, deleted: 0, clientT: 0, checkpoint: { type: "doc", content: [] } },
          { seq: 1, kind: "type", steps: [], inserted: 1, deleted: 0, clientT: 100 },
          { seq: 2, kind: "type", steps: [], inserted: 2, deleted: 0, clientT: 200 },
        ],
      }),
      params(doc.id),
    );
    expect(r012.status).toBe(201);

    // Try to post seq 1 again -> 409
    const rOverwrite = await eventsRoute.POST(
      jsonReq(`/api/docs/${doc.id}/events`, "POST", {
        events: [{ seq: 1, kind: "type", steps: [], inserted: 1, deleted: 0, clientT: 100 }],
      }),
      params(doc.id),
    );
    expect(rOverwrite.status).toBe(409);
    const bodyOverwrite = await rOverwrite.json() as { error: { code: string } };
    expect(bodyOverwrite.error.code).toBe("seq_gap");

    // Try to post seq 4 (skipping 3) -> 409
    const rSkip = await eventsRoute.POST(
      jsonReq(`/api/docs/${doc.id}/events`, "POST", {
        events: [{ seq: 4, kind: "type", steps: [], inserted: 1, deleted: 0, clientT: 300 }],
      }),
      params(doc.id),
    );
    expect(rSkip.status).toBe(409);
    const bodySkip = await rSkip.json() as { error: { code: string } };
    expect(bodySkip.error.code).toBe("seq_gap");

    // Post seq 3 correctly -> 201 (verify the stream is still intact)
    const r3 = await eventsRoute.POST(
      jsonReq(`/api/docs/${doc.id}/events`, "POST", {
        events: [{ seq: 3, kind: "type", steps: [], inserted: 1, deleted: 0, clientT: 300 }],
      }),
      params(doc.id),
    );
    expect(r3.status).toBe(201);
  });
});

// -------------------------------------------------------------------------
// Supplemental: events route auth checks
// -------------------------------------------------------------------------
describe("events route auth checks", () => {
  it("returns 401 when not authenticated", async () => {
    const doc = await createDoc(alice, "Auth events doc");
    session.current = null;

    const res = await eventsRoute.POST(
      jsonReq(`/api/docs/${doc.id}/events`, "POST", {
        events: [{ seq: 0, kind: "type", steps: [], inserted: 0, deleted: 0, clientT: 0, checkpoint: null }],
      }),
      params(doc.id),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when user has no access (existence not revealed)", async () => {
    const doc = await createDoc(alice, "Forbidden events doc");
    session.current = bob;

    const res = await eventsRoute.POST(
      jsonReq(`/api/docs/${doc.id}/events`, "POST", {
        events: [{ seq: 0, kind: "type", steps: [], inserted: 0, deleted: 0, clientT: 0, checkpoint: null }],
      }),
      params(doc.id),
    );
    // 404 is correct here: a non-member should not learn the document exists.
    expect(res.status).toBe(404);
  });
});

// -------------------------------------------------------------------------
// Test f: Per-author attribution
// -------------------------------------------------------------------------
describe("Test f: per-author attribution", () => {
  it("two users editing same doc produce correct per-author numbers", () => {
    const aliceId = "aaaaaaaa-0000-0000-0000-000000000001";
    const bobId   = "bbbbbbbb-0000-0000-0000-000000000002";

    const events = [
      { seq: 0, kind: "import" as const, inserted: 0, deleted: 0, clientT: 0, receivedAt: "2024-01-01T00:00:00Z", userId: aliceId },
      { seq: 1, kind: "type"   as const, inserted: 10, deleted: 0, clientT: 1000, receivedAt: "2024-01-01T00:00:01Z", userId: aliceId },
      { seq: 2, kind: "paste"  as const, inserted: 20, deleted: 0, clientT: 2000, receivedAt: "2024-01-01T00:00:02Z", userId: aliceId },
      { seq: 3, kind: "type"   as const, inserted: 5,  deleted: 2, clientT: 3000, receivedAt: "2024-01-01T00:00:03Z", userId: bobId },
      { seq: 4, kind: "delete" as const, inserted: 0,  deleted: 3, clientT: 4000, receivedAt: "2024-01-01T00:00:04Z", userId: bobId },
    ];

    const facts = computeFacts(events);

    // Alice: type(10) + paste(20) = 30 inserted, 0 deleted, 1 paste event
    expect(facts.perAuthor[aliceId]).toBeDefined();
    expect(facts.perAuthor[aliceId].inserted).toBe(30);
    expect(facts.perAuthor[aliceId].deleted).toBe(0);
    expect(facts.perAuthor[aliceId].pasteEvents).toBe(1);

    // Bob: type(5) + delete(0) = 5 inserted, 2+3=5 deleted, 0 paste events
    expect(facts.perAuthor[bobId]).toBeDefined();
    expect(facts.perAuthor[bobId].inserted).toBe(5);
    expect(facts.perAuthor[bobId].deleted).toBe(5);
    expect(facts.perAuthor[bobId].pasteEvents).toBe(0);

    // Active writing time per author (gaps <= 120s)
    // Alice: gap 0->1 = 1000ms, gap 1->2 = 1000ms => 2000ms
    expect(facts.perAuthor[aliceId].activeWritingMs).toBe(2000);
    // Bob: gap 3->4 = 1000ms => 1000ms
    expect(facts.perAuthor[bobId].activeWritingMs).toBe(1000);
  });

  it("import events are attributed to the event userId (document owner)", () => {
    const ownerId = "cccccccc-0000-0000-0000-000000000003";

    const events = [
      { seq: 0, kind: "import" as const, inserted: 500, deleted: 0, clientT: 0, receivedAt: "2024-01-01T00:00:00Z", userId: ownerId },
      { seq: 1, kind: "type"   as const, inserted: 10,  deleted: 0, clientT: 1000, receivedAt: "2024-01-01T00:00:01Z", userId: ownerId },
    ];

    const facts = computeFacts(events);
    // All content attributed to owner
    expect(Object.keys(facts.perAuthor)).toEqual([ownerId]);
    expect(facts.perAuthor[ownerId].inserted).toBe(510);
    // Imported chars count as "imported" in charsBySource
    expect(facts.charsBySource.imported).toBe(500);
    expect(facts.charsBySource.typed).toBe(10);
  });

  it("replay API returns userId and authors map", async () => {
    const doc = await createDoc(alice, "Attribution replay doc");
    session.current = alice;

    // Post a couple of events as alice
    await eventsRoute.POST(
      jsonReq(`/api/docs/${doc.id}/events`, "POST", {
        events: [
          { seq: 0, kind: "import", steps: [], inserted: 0, deleted: 0, clientT: 0, checkpoint: { type: "doc", content: [] } },
          { seq: 1, kind: "type",   steps: [], inserted: 5, deleted: 0, clientT: 1000 },
        ],
      }),
      params(doc.id),
    );

    const res = await replayRoute.GET(
      jsonReq(`/api/docs/${doc.id}/replay`, "GET"),
      params(doc.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as {
      events: Array<{ userId: string }>;
      authors: Record<string, string>;
      nextSeq: number;
    };

    // Every event has a userId
    expect(body.events.every((e) => typeof e.userId === "string")).toBe(true);
    // alice's userId maps to her name
    expect(body.authors[alice.id]).toBe(alice.name);
  });

  it("buildAuthorColors assigns stable distinct colors", () => {
    const id1 = "aaaaaaaa-0000-0000-0000-000000000001";
    const id2 = "bbbbbbbb-0000-0000-0000-000000000002";
    const id3 = "cccccccc-0000-0000-0000-000000000003";

    const colors = buildAuthorColors([id1, id2, id1, id3, id2]);
    // 3 distinct authors
    expect(Object.keys(colors)).toHaveLength(3);
    // Colors are stable (same input always same output)
    expect(colors[id1]).toEqual(buildAuthorColors([id1, id2, id3])[id1]);
    // id1 and id2 get different colors
    expect(colors[id1].bg).not.toBe(colors[id2].bg);
  });
});
