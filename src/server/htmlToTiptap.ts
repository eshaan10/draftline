import { parseHTML } from "linkedom";
import { getSchema } from "@tiptap/core";
import { DOMParser as PMDOMParser } from "@tiptap/pm/model";
import { buildExtensions } from "@/features/editor/editorExtensions";

// Server-side: use linkedom to provide a DOM environment for ProseMirror.
export function htmlToTiptap(html: string): object {
  const schema = getSchema(buildExtensions());
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
  const pmDoc = PMDOMParser.fromSchema(schema).parse(
    document.body as unknown as globalThis.Node,
  );
  return pmDoc.toJSON();
}
