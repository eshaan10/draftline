"use client";

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

export const pasteHighlightKey = new PluginKey<{
  decorations: DecorationSet;
}>("pasteHighlight");

export const PasteHighlightExtension = Extension.create({
  name: "pasteHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pasteHighlightKey,
        state: {
          init: () => ({ decorations: DecorationSet.empty }),
          apply(tr, value) {
            const range = tr.getMeta(pasteHighlightKey) as
              | { from: number; to: number }
              | null
              | undefined;
            if (range === undefined) {
              return { decorations: value.decorations.map(tr.mapping, tr.doc) };
            }
            if (range === null) {
              return { decorations: DecorationSet.empty };
            }
            const dec = Decoration.inline(range.from, range.to, {
              class: "paste-highlight",
            });
            return { decorations: DecorationSet.create(tr.doc, [dec]) };
          },
        },
        props: {
          decorations(state) {
            return pasteHighlightKey.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

export function setPasteHighlight(
  view: EditorView,
  range: { from: number; to: number } | null,
): void {
  view.dispatch(view.state.tr.setMeta(pasteHighlightKey, range));
}
