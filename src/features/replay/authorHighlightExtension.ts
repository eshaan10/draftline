"use client";

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

export const authorHighlightKey = new PluginKey<{
  decorations: DecorationSet;
}>("authorHighlight");

export const AuthorHighlightExtension = Extension.create({
  name: "authorHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: authorHighlightKey,
        state: {
          init: () => ({ decorations: DecorationSet.empty }),
          apply(tr, value) {
            const payload = tr.getMeta(authorHighlightKey) as
              | { from: number; to: number; color: string }
              | null
              | undefined;
            if (payload === undefined) {
              return { decorations: value.decorations.map(tr.mapping, tr.doc) };
            }
            if (payload === null) {
              return { decorations: DecorationSet.empty };
            }
            const dec = Decoration.inline(payload.from, payload.to, {
              style: `background: ${payload.color}; border-radius: 2px;`,
            });
            return { decorations: DecorationSet.create(tr.doc, [dec]) };
          },
        },
        props: {
          decorations(state) {
            return authorHighlightKey.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

export function setAuthorHighlight(
  view: EditorView,
  range: { from: number; to: number; color: string } | null,
): void {
  view.dispatch(view.state.tr.setMeta(authorHighlightKey, range));
}
