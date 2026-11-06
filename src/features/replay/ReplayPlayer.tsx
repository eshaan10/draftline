"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { getSchema } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { Step } from "@tiptap/pm/transform";
import { buildExtensions } from "@/features/editor/editorExtensions";
import { computeFacts, type ReplayEventRow } from "./facts";
import { PasteHighlightExtension, setPasteHighlight } from "./pasteHighlightExtension";
import { AuthorHighlightExtension, setAuthorHighlight } from "./authorHighlightExtension";
import { buildAuthorColors } from "./authorColors";

interface ReplayPlayerProps {
  docId: string;
  initialEvents: Array<
    ReplayEventRow & { steps: unknown[]; checkpoint: unknown | null }
  >;
  /** userId -> display name */
  authors?: Record<string, string>;
  canAccess: boolean;
}

type Speed = 1 | 4 | 16;

function formatMs(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
}

// Build the ProseMirror schema once at module load -- safe because
// buildExtensions() is deterministic and pure.
let cachedSchema: ReturnType<typeof getSchema> | null = null;
function getReplaySchema() {
  if (!cachedSchema) {
    cachedSchema = getSchema(buildExtensions());
  }
  return cachedSchema;
}

export function buildDocAtIndex(
  events: Array<ReplayEventRow & { steps: unknown[]; checkpoint: unknown | null }>,
  index: number,
): unknown {
  if (events.length === 0 || index < 0) return null;

  const schema = getReplaySchema();

  // Find the latest checkpoint at or before `index`.
  let checkpointIndex = -1;
  for (let i = Math.min(index, events.length - 1); i >= 0; i--) {
    if (events[i].checkpoint) {
      checkpointIndex = i;
      break;
    }
  }

  if (checkpointIndex === -1) return null;

  let doc: InstanceType<typeof Node>;
  try {
    doc = Node.fromJSON(schema, events[checkpointIndex].checkpoint as object);
  } catch {
    return null;
  }

  // Apply steps from after the checkpoint up to and including `index`.
  for (let i = checkpointIndex + 1; i <= Math.min(index, events.length - 1); i++) {
    const ev = events[i];
    for (const stepJson of ev.steps) {
      try {
        const step = Step.fromJSON(schema, stepJson as object);
        const result = step.apply(doc);
        if (result.doc) {
          doc = result.doc;
        }
      } catch {
        // Skip steps that fail to apply; best-effort replay.
      }
    }
  }

  return doc.toJSON();
}

function computeInsertRange(
  event: ReplayEventRow & { steps: unknown[]; checkpoint: unknown | null },
): { from: number; to: number } | null {
  if (event.steps.length === 0) return null;
  const schema = getReplaySchema();
  let minFrom = Infinity;
  let maxTo = -Infinity;
  for (const stepJson of event.steps) {
    try {
      const step = Step.fromJSON(schema, stepJson as object) as unknown as {
        from?: number;
        to?: number;
        slice?: { content: { size: number } };
      };
      if (step.from !== undefined && step.slice !== undefined) {
        const insertEnd = step.from + step.slice.content.size;
        if (step.from < minFrom) minFrom = step.from;
        if (insertEnd > maxTo) maxTo = insertEnd;
      }
    } catch {
      // skip
    }
  }
  if (minFrom === Infinity || maxTo === -Infinity) return null;
  return { from: minFrom, to: maxTo };
}

export function ReplayPlayer({ initialEvents, authors = {}, canAccess }: ReplayPlayerProps) {
  const events = initialEvents;
  const facts = computeFacts(events);

  // Build stable author colors based on order of first appearance.
  const authorColors = useMemo(() => {
    const ids = events.map((e) => e.userId ?? "__unknown__");
    return buildAuthorColors(ids);
  }, [events]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [skipIdle, setSkipIdle] = useState(true);

  const isPlayingRef = useRef(isPlaying);
  const currentIndexRef = useRef(currentIndex);
  const speedRef = useRef(speed);
  const skipIdleRef = useRef(skipIdle);
  const pasteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { skipIdleRef.current = skipIdle; }, [skipIdle]);

  const extensions = [...buildExtensions(), PasteHighlightExtension, AuthorHighlightExtension];

  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions,
    content: events.length > 0 && events[0].checkpoint
      ? (events[0].checkpoint as object)
      : { type: "doc", content: [{ type: "paragraph" }] },
  });

  // Apply document state whenever currentIndex changes.
  useEffect(() => {
    if (!editor) return;
    const docJson = buildDocAtIndex(events, currentIndex);
    if (docJson) {
      editor.commands.setContent(docJson as object, { emitUpdate: false });
    }

    // Clear existing highlights
    if (pasteTimerRef.current) { clearTimeout(pasteTimerRef.current); pasteTimerRef.current = null; }
    if (authorTimerRef.current) { clearTimeout(authorTimerRef.current); authorTimerRef.current = null; }
    if (editor.view) {
      setPasteHighlight(editor.view, null);
      setAuthorHighlight(editor.view, null);
    }

    const event = events[currentIndex];
    if (!event || !editor.view) return;

    const range = computeInsertRange(event);

    // Paste highlight (orange/brand tint)
    if (event.kind === "paste" && range) {
      setPasteHighlight(editor.view, range);
      pasteTimerRef.current = setTimeout(() => {
        if (editor.view) setPasteHighlight(editor.view, null);
      }, 1000);
    }

    // Author highlight (author's color tint)
    if (range && event.userId) {
      const color = authorColors[event.userId]?.bg;
      if (color) {
        setAuthorHighlight(editor.view, { ...range, color });
        authorTimerRef.current = setTimeout(() => {
          if (editor.view) setAuthorHighlight(editor.view, null);
        }, 1200);
      }
    }
  }, [currentIndex, editor, events, authorColors]);

  // Play loop
  const advance = useCallback(() => {
    if (!isPlayingRef.current) return;
    const idx = currentIndexRef.current;
    if (idx >= events.length - 1) {
      setIsPlaying(false);
      return;
    }

    const current = events[idx];
    const next = events[idx + 1];
    if (!next) {
      setIsPlaying(false);
      return;
    }

    const gap = next.clientT - current.clientT;

    if (skipIdleRef.current && gap > 120_000) {
      // Skip idle: advance immediately after a brief visual pause
      setCurrentIndex(idx + 1);
      return;
    }

    const delay = Math.min(2000, Math.max(50, gap / speedRef.current));
    setTimeout(() => {
      if (!isPlayingRef.current) return;
      setCurrentIndex((prev) => {
        if (prev >= events.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, delay);
  }, [events]);

  useEffect(() => {
    if (!isPlaying) return;
    if (currentIndex >= events.length - 1) {
      setIsPlaying(false);
      return;
    }
    advance();
  }, [isPlaying, currentIndex, advance, events.length]);

  if (!canAccess) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Access denied.</p>;
  }

  if (events.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center" style={{ borderColor: "var(--border)" }}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No events recorded yet. Start editing the document to record activity.
        </p>
      </div>
    );
  }

  const maxClientT = events[events.length - 1].clientT || 1;
  const currentEvent = events[currentIndex];
  const currentClientT = currentEvent?.clientT ?? 0;
  const currentAuthorId = currentEvent?.userId;
  const currentAuthorName = currentAuthorId ? (authors[currentAuthorId] ?? "Unknown") : null;
  const currentAuthorColor = currentAuthorId ? authorColors[currentAuthorId] : undefined;

  const pasteMarkers = facts.pasteEvents.map((pe) => ({
    seq: pe.seq,
    pct: maxClientT > 0 ? (pe.clientT / maxClientT) * 100 : 0,
  }));

  // Authors with known names for legend
  const legendEntries = Object.entries(authorColors)
    .filter(([uid]) => uid !== "__unknown__")
    .map(([uid, color]) => ({ uid, name: authors[uid] ?? "Unknown", color }));

  return (
    <div className="flex flex-col gap-6">
      {/* Editor canvas */}
      <div
        className="rounded-md border overflow-hidden"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div
          className="px-4 py-2 text-xs border-b flex items-center gap-3 flex-wrap"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          <span>Event {currentIndex} of {events.length - 1}</span>
          <span>Time {formatMs(currentClientT)} into session</span>
          {currentEvent && (
            <span
              className="rounded px-1.5 py-0.5"
              style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
            >
              {currentEvent.kind}
            </span>
          )}
          {currentAuthorName && currentAuthorColor && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: currentAuthorColor.bg, color: currentAuthorColor.text, border: `1px solid ${currentAuthorColor.border}` }}
            >
              {currentAuthorName}
            </span>
          )}
        </div>
        <div className="p-6 max-h-[500px] overflow-y-auto prose-page">
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Scrub bar */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <input
            type="range"
            min={0}
            max={events.length - 1}
            value={currentIndex}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentIndex(Number(e.target.value));
            }}
            className="w-full"
            aria-label="Replay position"
          />
          {/* Paste markers */}
          {pasteMarkers.map((m) => (
            <span
              key={m.seq}
              title={`Paste event (seq ${m.seq})`}
              className="absolute top-0 w-1 h-4 rounded-full pointer-events-none"
              style={{
                left: `${m.pct}%`,
                background: "var(--brand)",
                transform: "translateX(-50%)",
              }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
          <span>0s</span>
          <span>{formatMs(maxClientT)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => {
            if (currentIndex >= events.length - 1) {
              setCurrentIndex(0);
              setIsPlaying(true);
            } else {
              setIsPlaying((p) => !p);
            }
          }}
          className="btn-primary rounded-md px-4 py-1.5 text-sm font-medium"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>

        <button
          type="button"
          onClick={() => { setIsPlaying(false); setCurrentIndex(0); }}
          className="btn-ghost rounded-md px-3 py-1.5 text-sm"
        >
          Reset
        </button>

        <div className="flex items-center gap-1 text-sm">
          <span style={{ color: "var(--muted)" }}>Speed:</span>
          {([1, 4, 16] as Speed[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className="rounded px-2 py-0.5 text-xs"
              style={{
                background: speed === s ? "var(--brand)" : "var(--surface)",
                color: speed === s ? "var(--brand-fg)" : "var(--fg)",
                border: `1px solid ${speed === s ? "var(--brand)" : "var(--border)"}`,
              }}
            >
              {s}x
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={skipIdle}
            onChange={(e) => setSkipIdle(e.target.checked)}
          />
          <span style={{ color: "var(--muted)" }}>Skip idle</span>
        </label>
      </div>

      {/* Facts panel */}
      <div
        className="rounded-lg border p-5 grid grid-cols-2 gap-4 md:grid-cols-4"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <FactCard label="Active writing" value={formatMs(facts.activeWritingMs)} />
        <FactCard label="Sessions" value={String(facts.sessionCount)} />
        <FactCard label="Revisions" value={String(facts.revisionCount)} />
        <FactCard label="Paste events" value={String(facts.pasteEvents.length)} />
      </div>

      {/* Chars by source */}
      <div
        className="rounded-lg border p-5"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <h3 className="text-sm font-semibold mb-3">Characters by source</h3>
        <div className="flex flex-col gap-2 text-sm">
          <SourceBar label="Typed" count={facts.charsBySource.typed} total={facts.charsBySource.total} />
          <SourceBar label="Pasted" count={facts.charsBySource.pasted} total={facts.charsBySource.total} />
          <SourceBar label="Imported" count={facts.charsBySource.imported} total={facts.charsBySource.total} />
        </div>
      </div>

      {/* Per-author breakdown */}
      {legendEntries.length > 1 && (
        <div
          className="rounded-lg border p-5"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <h3 className="text-sm font-semibold mb-4">Per-author breakdown</h3>
          <div className="flex flex-col gap-3">
            {legendEntries.map(({ uid, name, color }) => {
              const af = facts.perAuthor[uid];
              if (!af) return null;
              return (
                <div key={uid} className="flex items-start gap-3">
                  <span
                    className="mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-medium"
                    style={{ background: color.bg, color: color.text, border: `1px solid ${color.border}` }}
                  >
                    {name}
                  </span>
                  <div className="flex flex-wrap gap-4 text-xs" style={{ color: "var(--muted)" }}>
                    <span><strong className="text-[color:var(--fg)]">{af.inserted}</strong> inserted</span>
                    <span><strong className="text-[color:var(--fg)]">{af.deleted}</strong> deleted</span>
                    <span><strong className="text-[color:var(--fg)]">{af.pasteEvents}</strong> pastes</span>
                    <span><strong className="text-[color:var(--fg)]">{formatMs(af.activeWritingMs)}</strong> active</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Author legend (single-author docs: show condensed) */}
      {legendEntries.length === 1 && (
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
          <span
            className="rounded px-2 py-0.5 font-medium"
            style={{ background: legendEntries[0].color.bg, color: legendEntries[0].color.text, border: `1px solid ${legendEntries[0].color.border}` }}
          >
            {legendEntries[0].name}
          </span>
          <span>sole author</span>
        </div>
      )}

      {/* Paste events list */}
      {facts.pasteEvents.length > 0 && (
        <div
          className="rounded-lg border p-5"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <h3 className="text-sm font-semibold mb-3">Paste events</h3>
          <div className="flex flex-col gap-1">
            {facts.pasteEvents.map((pe) => (
              <div
                key={pe.seq}
                className="flex items-center justify-between text-xs py-1 border-b last:border-0"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                <span>seq {pe.seq} at {formatMs(pe.clientT)}</span>
                <span>{pe.insertedChars} chars</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FactCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function SourceBar({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-xs" style={{ color: "var(--muted)" }}>{label}</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: "var(--brand)" }}
        />
      </div>
      <span className="w-20 text-right text-xs" style={{ color: "var(--muted)" }}>
        {count} ({pct}%)
      </span>
    </div>
  );
}
