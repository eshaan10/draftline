"use client";

import { type Editor } from "@tiptap/react";
import { useEffect, useState } from "react";

type OutlineItem = { id: string; text: string; level: 1 | 2 | 3 };

export function OutlineSidebar({ editor }: { editor: Editor | null }) {
  const [collapsed, setCollapsed] = useState(false);
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!editor) return;
    const refresh = () => setItems(collect(editor));
    refresh();
    editor.on("update", refresh);
    editor.on("create", refresh);
    return () => {
      editor.off("update", refresh);
      editor.off("create", refresh);
    };
  }, [editor]);

  useEffect(() => {
    if (items.length === 0) return;
    const headings = items
      .map((i) => document.getElementById(i.id))
      .filter(Boolean) as HTMLElement[];
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [items]);

  if (collapsed) {
    return (
      <aside className="print:hidden">
        <button
          onClick={() => setCollapsed(false)}
          className="btn-ghost sticky top-28 rounded-md px-2 py-1 text-xs"
          aria-label="Show outline"
          title="Show outline"
        >
          ☰
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="print:hidden hidden w-56 shrink-0 md:block"
      aria-label="Document outline"
    >
      <div className="sticky top-28">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Outline
          </p>
          <button
            onClick={() => setCollapsed(true)}
            className="btn-ghost rounded-md px-1.5 py-0.5 text-[10px]"
            aria-label="Hide outline"
            title="Hide outline"
          >
            ×
          </button>
        </div>
        {items.length === 0 ? (
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            Add headings (H1 to H3) to build the outline.
          </p>
        ) : (
          <ul className="mt-2 space-y-0.5 text-sm">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => {
                    const el = document.getElementById(item.id);
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="block w-full truncate rounded px-2 py-1 text-left transition"
                  style={{
                    paddingLeft: `${(item.level - 1) * 12 + 8}px`,
                    background: activeId === item.id ? "var(--brand-soft)" : "transparent",
                    color: activeId === item.id ? "var(--brand)" : "var(--fg)",
                  }}
                  title={item.text}
                >
                  {item.text || "Untitled heading"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function collect(editor: Editor): OutlineItem[] {
  const list: OutlineItem[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      const level = (node.attrs.level ?? 1) as 1 | 2 | 3;
      if (level >= 1 && level <= 3) {
        list.push({
          id: `heading-${pos}`,
          text: node.textContent,
          level,
        });
      }
    }
  });
  // Ensure heading ids exist in the DOM so the outline can scroll to them.
  const dom = editor.view.dom as HTMLElement;
  const headings = dom.querySelectorAll("h1, h2, h3");
  headings.forEach((el, i) => {
    if (list[i] && !el.id) el.id = list[i].id;
  });
  return list;
}
