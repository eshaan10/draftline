"use client";

import { type Editor } from "@tiptap/react";
import { type ChangeEvent, useEffect, useState } from "react";

const FONTS = [
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: '"Times New Roman", Times, serif', label: "Times New Roman" },
  { value: '"Courier New", Courier, monospace', label: "Courier New" },
  { value: "Verdana, sans-serif", label: "Verdana" },
];

const LINE_SPACINGS = [
  { value: "1", label: "1.0" },
  { value: "1.15", label: "1.15" },
  { value: "1.5", label: "1.5" },
  { value: "2", label: "2.0" },
];

const TEXT_COLORS = [
  "#111827",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#6b7280",
];
const HIGHLIGHT_COLORS = [
  "#fef08a",
  "#fecaca",
  "#bbf7d0",
  "#bfdbfe",
  "#ddd6fe",
  "#fed7aa",
];

export function EditorToolbar({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  // Re-render on selection/transaction so active states stay fresh.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const handler = () => tick((n) => n + 1);
    editor.on("selectionUpdate", handler);
    editor.on("transaction", handler);
    return () => {
      editor.off("selectionUpdate", handler);
      editor.off("transaction", handler);
    };
  }, [editor]);

  if (!editor) return null;

  const activeStyle = textStyle(editor);
  const activeFont =
    (editor.getAttributes("textStyle").fontFamily as string | undefined) ??
    FONTS[0].value;
  const activeFontSize = parseFontSize(
    editor.getAttributes("textStyle").fontSize as string | undefined,
    defaultSize(activeStyle),
  );
  const activeLineHeight =
    (editor.getAttributes("paragraph").lineHeight as string | undefined) ??
    (editor.getAttributes("heading").lineHeight as string | undefined) ??
    "1.15";

  function onStyleChange(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    const chain = editor!.chain().focus();
    if (v === "paragraph") chain.setParagraph().run();
    else chain.setHeading({ level: Number(v.replace("h", "")) as 1 | 2 | 3 }).run();
  }

  function onFontFamilyChange(e: ChangeEvent<HTMLSelectElement>) {
    editor!.chain().focus().setFontFamily(e.target.value).run();
  }

  function setSize(next: number) {
    const clamped = Math.max(8, Math.min(48, Math.round(next)));
    editor!.chain().focus().setFontSize(`${clamped}pt`).run();
  }

  function onLineHeightChange(e: ChangeEvent<HTMLSelectElement>) {
    editor!.chain().focus().setLineHeight(e.target.value).run();
  }

  function promptLink() {
    const prev = editor!.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL (leave blank to remove)", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor!.chain().focus().unsetLink().run();
      return;
    }
    editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div
      className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b px-3 py-2 backdrop-blur print:hidden"
      style={{ background: "color-mix(in srgb, var(--bg) 85%, transparent)", borderColor: "var(--border)" }}
      role="toolbar"
      aria-label="Formatting"
    >
      <select
        value={activeStyle}
        onChange={onStyleChange}
        disabled={disabled}
        aria-label="Text style"
        className="input rounded-md px-2 py-1 text-sm"
      >
        <option value="paragraph">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>

      <select
        value={activeFont}
        onChange={onFontFamilyChange}
        disabled={disabled}
        aria-label="Font"
        className="input rounded-md px-2 py-1 text-sm"
        style={{ minWidth: "9rem" }}
      >
        {FONTS.map((f) => (
          <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
            {f.label}
          </option>
        ))}
      </select>

      <div role="group" aria-label="Font size" className="flex items-center gap-0.5">
        <Btn onClick={() => setSize(activeFontSize - 1)} label="Decrease font size">
          −
        </Btn>
        <input
          type="number"
          min={8}
          max={48}
          value={activeFontSize}
          disabled={disabled}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) setSize(v);
          }}
          aria-label="Font size"
          className="input w-12 rounded-md px-2 py-1 text-center text-sm"
        />
        <Btn onClick={() => setSize(activeFontSize + 1)} label="Increase font size">
          +
        </Btn>
      </div>

      <Divider />

      <Group label="Inline">
        <Btn
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          label="Bold"
          shortcut="Mod+B"
        >
          <strong>B</strong>
        </Btn>
        <Btn
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          label="Italic"
          shortcut="Mod+I"
        >
          <em>I</em>
        </Btn>
        <Btn
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          label="Underline"
          shortcut="Mod+U"
        >
          <span style={{ textDecoration: "underline" }}>U</span>
        </Btn>
      </Group>

      <Divider />

      <ColorPicker
        label="Text color"
        swatch={(editor.getAttributes("textStyle").color as string | undefined) ?? "#111827"}
        colors={TEXT_COLORS}
        onPick={(c) => editor.chain().focus().setColor(c).run()}
        onClear={() => editor.chain().focus().unsetColor().run()}
      />
      <ColorPicker
        label="Highlight color"
        swatch={(editor.getAttributes("highlight").color as string | undefined) ?? "#fef08a"}
        colors={HIGHLIGHT_COLORS}
        onPick={(c) => editor.chain().focus().toggleHighlight({ color: c }).run()}
        onClear={() => editor.chain().focus().unsetHighlight().run()}
        icon="H"
      />

      <Divider />

      <Group label="Lists">
        <Btn
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          label="Bullet list"
          shortcut="Mod+Shift+8"
        >
          •
        </Btn>
        <Btn
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          label="Ordered list"
          shortcut="Mod+Shift+7"
        >
          1.
        </Btn>
        <Btn
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          label="Blockquote"
          shortcut="Mod+Shift+B"
        >
          “
        </Btn>
      </Group>

      <Divider />

      <Group label="Align">
        <Btn
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          label="Align left"
        >
          ⇤
        </Btn>
        <Btn
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          label="Align center"
        >
          ↔
        </Btn>
        <Btn
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          label="Align right"
        >
          ⇥
        </Btn>
      </Group>

      <select
        value={activeLineHeight}
        onChange={onLineHeightChange}
        disabled={disabled}
        aria-label="Line spacing"
        className="input rounded-md px-2 py-1 text-sm"
        title="Line spacing"
      >
        {LINE_SPACINGS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>

      <Divider />

      <Group label="Insert">
        <Btn
          active={editor.isActive("link")}
          onClick={promptLink}
          label="Link"
          shortcut="Mod+K"
        >
          🔗
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          label="Horizontal rule"
        >
          ―
        </Btn>
        <Btn
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
          label="Insert table"
        >
          ⊞
        </Btn>
      </Group>

      {editor.isActive("table") && (
        <>
          <Divider />
          <Group label="Table">
            <Btn onClick={() => editor.chain().focus().addRowAfter().run()} label="Add row">+Row</Btn>
            <Btn onClick={() => editor.chain().focus().addColumnAfter().run()} label="Add column">+Col</Btn>
            <Btn onClick={() => editor.chain().focus().deleteRow().run()} label="Remove row">-Row</Btn>
            <Btn onClick={() => editor.chain().focus().deleteColumn().run()} label="Remove column">-Col</Btn>
            <Btn onClick={() => editor.chain().focus().deleteTable().run()} label="Remove table">×</Btn>
          </Group>
        </>
      )}

      <Divider />

      <Group label="History">
        <Btn
          onClick={() => editor.chain().focus().undo().run()}
          label="Undo"
          shortcut="Mod+Z"
          disabled={!editor.can().undo()}
        >
          ↶
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().redo().run()}
          label="Redo"
          shortcut="Mod+Shift+Z"
          disabled={!editor.can().redo()}
        >
          ↷
        </Btn>
      </Group>
    </div>
  );
}

function defaultSize(style: "paragraph" | "h1" | "h2" | "h3") {
  if (style === "h1") return 20;
  if (style === "h2") return 16;
  if (style === "h3") return 14;
  return 11;
}

function parseFontSize(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const num = Number.parseFloat(raw);
  return Number.isFinite(num) ? num : fallback;
}

function textStyle(editor: Editor): "paragraph" | "h1" | "h2" | "h3" {
  if (editor.isActive("heading", { level: 1 })) return "h1";
  if (editor.isActive("heading", { level: 2 })) return "h2";
  if (editor.isActive("heading", { level: 3 })) return "h3";
  return "paragraph";
}

function Divider() {
  return (
    <span
      aria-hidden
      className="mx-1 h-6 w-px"
      style={{ background: "var(--border)" }}
    />
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {children}
    </div>
  );
}

function Btn({
  children,
  onClick,
  active,
  disabled,
  label,
  shortcut,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut.replace("Mod", isMac() ? "⌘" : "Ctrl")})` : label}
      aria-pressed={active ? true : undefined}
      className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-md px-2 text-sm transition disabled:opacity-40"
      style={{
        background: active ? "var(--brand-soft)" : "transparent",
        color: active ? "var(--brand)" : "var(--fg)",
        border: `1px solid ${active ? "var(--brand-border)" : "transparent"}`,
      }}
    >
      {children}
    </button>
  );
}

function ColorPicker({
  label,
  swatch,
  colors,
  onPick,
  onClear,
  icon,
}: {
  label: string;
  swatch: string;
  colors: string[];
  onPick: (color: string) => void;
  onClear: () => void;
  icon?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        title={label}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm"
        style={{ border: "1px solid transparent" }}
      >
        <span className="text-xs" aria-hidden>
          {icon ?? "A"}
        </span>
        <span
          aria-hidden
          className="inline-block h-1.5 w-5 rounded"
          style={{ background: swatch }}
        />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className="absolute z-20 mt-1 w-40 rounded-md border p-2 shadow"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          onMouseLeave={() => setOpen(false)}
        >
          <div className="grid grid-cols-6 gap-1">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onPick(c);
                  setOpen(false);
                }}
                className="h-5 w-5 rounded-sm border"
                style={{ background: c, borderColor: "var(--border)" }}
                aria-label={c}
                title={c}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              onClear();
              setOpen(false);
            }}
            className="btn-ghost mt-2 w-full rounded-md px-2 py-1 text-xs"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

function isMac() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform);
}
