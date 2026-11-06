import { describe, expect, it } from "vitest";
import { buildPreview, PREVIEW_MAX_BYTES, PREVIEW_MAX_TOP_NODES } from "@/server/preview";

describe("buildPreview", () => {
  it("returns an empty doc for null, non-object, or non-doc input", () => {
    expect(buildPreview(null)).toEqual({ type: "doc", content: [] });
    expect(buildPreview("string")).toEqual({ type: "doc", content: [] });
    expect(buildPreview({ type: "paragraph" })).toEqual({ type: "doc", content: [] });
    expect(buildPreview({ type: "doc" })).toEqual({ type: "doc", content: [] });
  });

  it("keeps the first PREVIEW_MAX_TOP_NODES top-level nodes", () => {
    const nodes = Array.from({ length: 50 }, (_, i) => ({
      type: "paragraph",
      content: [{ type: "text", text: `line ${i}` }],
    }));
    const preview = buildPreview({ type: "doc", content: nodes });
    expect(preview.type).toBe("doc");
    expect(preview.content.length).toBeLessThanOrEqual(PREVIEW_MAX_TOP_NODES);
    // Preserves order from the start.
    const first = preview.content[0] as { content: Array<{ text: string }> };
    expect(first.content[0].text).toBe("line 0");
  });

  it("strips image src so base64 attachments do not bloat the payload", () => {
    const bigBase64 = "data:image/png;base64," + "A".repeat(2000);
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "before" },
            { type: "image", attrs: { src: bigBase64, alt: "x" } },
            { type: "text", text: "after" },
          ],
        },
      ],
    };
    const preview = buildPreview(doc);
    const firstPara = preview.content[0] as { content: Array<{ type: string; attrs?: { src?: string; alt?: string } }> };
    const image = firstPara.content.find((n) => n.type === "image")!;
    expect(image.attrs?.src).toBe("");
    expect(image.attrs?.alt).toBe("x");
    expect(JSON.stringify(preview).includes(bigBase64)).toBe(false);
  });

  it("caps total serialized size", () => {
    const big = Array.from({ length: PREVIEW_MAX_TOP_NODES }, () => ({
      type: "paragraph",
      content: [{ type: "text", text: "x".repeat(2000) }],
    }));
    const preview = buildPreview({ type: "doc", content: big });
    expect(JSON.stringify(preview).length).toBeLessThanOrEqual(PREVIEW_MAX_BYTES);
    expect(preview.content.length).toBeGreaterThan(0);
  });
});
