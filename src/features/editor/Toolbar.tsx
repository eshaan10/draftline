"use client";

import { type Editor } from "@tiptap/react";
import { type ChangeEvent } from "react";

export function EditorToolbar({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  if (!editor) return null;

  const activeStyle = textStyle(editor);

  function onStyleChange(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    const chain = editor!.chain().focus();
    if (v === "paragraph") chain.setParagraph().run();
    else chain.setHeading({ level: Number(v.replace("h", "")) as 1 | 2 | 3 }).run();
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
      className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b px-3 py-2 backdrop-blur"
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

function isMac() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform);
}
