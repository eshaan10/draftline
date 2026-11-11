import { Extension } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blockLineHeight: {
      setLineHeight: (value: string) => ReturnType;
    };
  }
}

const BLOCK_TYPES = ["paragraph", "heading"];

// Pure function: builds a transaction that sets lineHeight on every textblock
// the selection touches (or the containing textblock for a caret selection).
// Testable without a DOM or mounted editor.
export function buildLineHeightTransaction(
  state: EditorState,
  value: string | null,
): Transaction {
  const { from, to } = state.selection;
  const tr = state.tr;
  // AttrStep (via setNodeAttribute) is classified "format" by the recorder;
  // setNodeMarkup produces a ReplaceStep which is classified "type".
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (BLOCK_TYPES.includes(node.type.name)) {
      tr.setNodeAttribute(pos, "lineHeight", value || null);
    }
  });
  return tr;
}

export const BlockLineHeight = Extension.create({
  name: "blockLineHeight",

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.lineHeight || null,
            renderHTML: (attrs: Record<string, unknown>) => {
              if (!attrs.lineHeight) return {};
              return { style: `line-height: ${attrs.lineHeight}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineHeight: (value: string) =>
        ({ state, dispatch }: { state: EditorState; dispatch?: (tr: Transaction) => void }) => {
          const tr = buildLineHeightTransaction(state, value);
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },
});
