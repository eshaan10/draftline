import { describe, expect, it } from "vitest";

const { getSchema } = await import("@tiptap/core");
const StarterKitMod = await import("@tiptap/starter-kit");
const StarterKit = StarterKitMod.default ?? StarterKitMod;
const { Node } = await import("@tiptap/pm/model");
const { EditorState, TextSelection } = await import("@tiptap/pm/state");
const { buildLineHeightTransaction, BlockLineHeight } = await import(
  "@/features/editor/extensions"
);

const schema = getSchema([StarterKit, BlockLineHeight]);

function makeState(docJson: object, from: number, to?: number): InstanceType<typeof EditorState> {
  const doc = Node.fromJSON(schema, docJson);
  const sel = TextSelection.create(doc, from, to ?? from);
  return EditorState.create({ schema, doc, selection: sel });
}

const singlePara = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Hello world" }] },
  ],
};

const twoPara = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "First" }] },
    { type: "paragraph", content: [{ type: "text", text: "Second" }] },
  ],
};

const withHeading = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Title" }],
    },
  ],
};

const withList = {
  type: "doc",
  content: [
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Item" }],
            },
          ],
        },
      ],
    },
  ],
};

const emptyPara = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

describe("buildLineHeightTransaction", () => {
  it("caret in paragraph sets lineHeight on that paragraph", () => {
    const state = makeState(singlePara, 1);
    const tr = buildLineHeightTransaction(state, "1.5");
    expect(tr.doc.firstChild?.attrs.lineHeight).toBe("1.5");
  });

  it("selection across two paragraphs sets lineHeight on both", () => {
    // para 1 spans positions 0-7 (5 chars + open/close), para 2 starts at 8
    const doc = Node.fromJSON(schema, twoPara);
    // from = 1 (inside para 1), to = inside para 2
    const from = 1;
    const to = doc.content.firstChild!.nodeSize + 2;
    const state = makeState(twoPara, from, to);
    const tr = buildLineHeightTransaction(state, "2");
    const children = tr.doc.content.content;
    expect(children[0].attrs.lineHeight).toBe("2");
    expect(children[1].attrs.lineHeight).toBe("2");
  });

  it("caret in heading sets lineHeight on the heading", () => {
    const state = makeState(withHeading, 1);
    const tr = buildLineHeightTransaction(state, "1.5");
    expect(tr.doc.firstChild?.attrs.lineHeight).toBe("1.5");
  });

  it("caret in list item sets lineHeight on the paragraph inside the list item", () => {
    // positions: bulletList(0) > listItem(1) > paragraph(2) > text(3)
    const state = makeState(withList, 3);
    const tr = buildLineHeightTransaction(state, "1.5");
    const para = tr.doc.firstChild?.firstChild?.firstChild;
    expect(para?.type.name).toBe("paragraph");
    expect(para?.attrs.lineHeight).toBe("1.5");
  });

  it("setting back to null clears lineHeight", () => {
    const state = makeState(singlePara, 1);
    // first set it
    const tr1 = buildLineHeightTransaction(state, "2");
    const state2 = state.apply(tr1);
    // then clear it
    const tr2 = buildLineHeightTransaction(state2, null);
    expect(tr2.doc.firstChild?.attrs.lineHeight).toBeNull();
  });

  it("empty paragraph does not crash and sets lineHeight", () => {
    // cursor at position 1 inside the empty paragraph
    const state = makeState(emptyPara, 1);
    const tr = buildLineHeightTransaction(state, "1.5");
    expect(tr.doc.firstChild?.attrs.lineHeight).toBe("1.5");
  });

  it("produces AttrStep steps so the recorder classifies the event as format", async () => {
    // The recorder checks s.constructor.name.includes("Attr") to return "format".
    // setNodeAttribute creates AttrStep whose constructor.name is "AttrStep".
    const state = makeState(singlePara, 1);
    const tr = buildLineHeightTransaction(state, "1.5");
    expect(tr.steps.length).toBeGreaterThan(0);
    for (const step of tr.steps) {
      expect((step as { constructor: { name: string } }).constructor.name).toContain("Attr");
    }
  });
});
