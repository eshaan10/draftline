"use client";

import { type Editor } from "@tiptap/react";
import { useEffect, useState } from "react";

export function LinkPopover({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [href, setHref] = useState("");

  useEffect(() => {
    function update() {
      if (!editor.isActive("link")) {
        setOpen(false);
        return;
      }
      const { view, state } = editor;
      const { from } = state.selection;
      const start = view.coordsAtPos(from);
      const dom = view.dom.getBoundingClientRect();
      setCoords({ top: start.bottom - dom.top + 6, left: start.left - dom.left });
      setHref((editor.getAttributes("link").href as string) ?? "");
      setOpen(true);
    }
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  if (!open || !coords) return null;

  return (
    <div
      role="dialog"
      aria-label="Link"
      className="absolute z-30 flex items-center gap-1 rounded-md border px-2 py-1 text-xs shadow"
      style={{
        top: coords.top,
        left: coords.left,
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="max-w-[16rem] truncate underline"
        style={{ color: "var(--brand)" }}
        title={href}
      >
        {href || "no url"}
      </a>
      <button
        type="button"
        className="btn-ghost rounded px-1.5 py-0.5"
        onClick={() => {
          const next = window.prompt("Update URL", href);
          if (next === null) return;
          if (next === "") editor.chain().focus().unsetLink().run();
          else editor.chain().focus().extendMarkRange("link").setLink({ href: next }).run();
        }}
      >
        Edit
      </button>
      <button
        type="button"
        className="btn-ghost rounded px-1.5 py-0.5"
        onClick={() => editor.chain().focus().unsetLink().run()}
      >
        Remove
      </button>
    </div>
  );
}
