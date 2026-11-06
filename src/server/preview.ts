// Builds a safe, bounded preview of a Tiptap doc for use in dashboard
// thumbnails. Keeps the first 20 top-level nodes, strips image data so
// base64 attachments do not bloat the payload, and caps total size.

export const PREVIEW_MAX_TOP_NODES = 20;
export const PREVIEW_MAX_BYTES = 8_000;

type AnyNode = { type?: unknown; attrs?: unknown; content?: unknown; marks?: unknown; text?: unknown };

export function buildPreview(content: unknown): { type: "doc"; content: unknown[] } {
  const empty = { type: "doc" as const, content: [] as unknown[] };
  if (!content || typeof content !== "object") return empty;
  const doc = content as AnyNode;
  if (doc.type !== "doc" || !Array.isArray(doc.content)) return empty;

  const trimmed = doc.content
    .slice(0, PREVIEW_MAX_TOP_NODES)
    .map((n) => stripNode(n));

  let out: unknown[] = trimmed;
  while (out.length > 0 && JSON.stringify({ type: "doc", content: out }).length > PREVIEW_MAX_BYTES) {
    out = out.slice(0, out.length - 1);
  }

  return { type: "doc", content: out };
}

function stripNode(node: unknown): unknown {
  if (!node || typeof node !== "object") return node;
  const n = node as AnyNode;
  if (n.type === "image") {
    const attrs = (n.attrs ?? {}) as Record<string, unknown>;
    return { type: "image", attrs: { src: "", alt: attrs.alt ?? "" } };
  }
  const next: Record<string, unknown> = { type: n.type };
  if (n.attrs && typeof n.attrs === "object") next.attrs = n.attrs;
  if (n.marks) next.marks = n.marks;
  if (typeof n.text === "string") next.text = n.text;
  if (Array.isArray(n.content)) next.content = n.content.map(stripNode);
  return next;
}
