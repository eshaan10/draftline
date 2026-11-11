"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { computeTextStats } from "./readability";

const STORAGE_KEY_PREFIX = "draftline-goal-";

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function gradeLabel(grade: number): string {
  if (grade < 0) return "N/A";
  if (grade < 1) return "< 1";
  return `Grade ${Math.round(grade)}`;
}

interface Props {
  editor: Editor | null;
  docId: string;
}

export function WritingGoalsPanel({ editor, docId }: Props) {
  const [open, setOpen] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [goal, setGoal] = useState<number | null>(null);
  const [stats, setStats] = useState(() =>
    computeTextStats(editor?.getText() ?? ""),
  );

  // Load persisted goal
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY_PREFIX + docId);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    if (!isNaN(parsed) && parsed > 0) {
      setGoal(parsed);
      setGoalInput(String(parsed));
    }
  }, [docId]);

  // Update stats whenever the editor content changes
  useEffect(() => {
    if (!editor) return;
    function refresh() {
      setStats(computeTextStats(editor!.getText()));
    }
    editor.on("update", refresh);
    refresh();
    return () => {
      editor.off("update", refresh);
    };
  }, [editor]);

  function applyGoal() {
    const n = parseInt(goalInput, 10);
    if (!isNaN(n) && n > 0) {
      setGoal(n);
      localStorage.setItem(STORAGE_KEY_PREFIX + docId, String(n));
    } else {
      setGoal(null);
      localStorage.removeItem(STORAGE_KEY_PREFIX + docId);
    }
  }

  const pct = goal && goal > 0 ? Math.min(100, Math.round((stats.wordCount / goal) * 100)) : null;

  return (
    <div
      className="border-t"
      style={{ borderColor: "var(--border)", background: "var(--bg)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2 text-xs"
        style={{ color: "var(--muted)" }}
        aria-expanded={open}
      >
        <span className="font-medium uppercase tracking-wide">Writing goals</span>
        <span className="flex items-center gap-3">
          <span>{stats.wordCount.toLocaleString()} words</span>
          <span>{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 text-xs" style={{ color: "var(--fg)" }}>
          {/* Stats row */}
          <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
            <Stat label="Words" value={stats.wordCount.toLocaleString()} />
            <Stat label="Characters" value={stats.charCount.toLocaleString()} />
            <Stat label="Reading time" value={formatTime(stats.readingTimeSeconds)} />
            <Stat label="FK Grade" value={gradeLabel(stats.fleschKincaidGrade)} />
          </div>

          {/* Goal */}
          {pct !== null && (
            <div className="mb-3">
              <div className="mb-1 flex justify-between" style={{ color: "var(--muted)" }}>
                <span>Word goal: {stats.wordCount} / {goal}</span>
                <span>{pct}%</span>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full"
                style={{ background: "var(--border)" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: pct >= 100 ? "var(--brand)" : "#60a5fa" }}
                />
              </div>
            </div>
          )}

          {/* Goal input */}
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onBlur={applyGoal}
              onKeyDown={(e) => { if (e.key === "Enter") applyGoal(); }}
              placeholder="Set word goal (optional)"
              className="input w-40 rounded-md px-2 py-1 text-xs"
            />
            {goal && (
              <button
                type="button"
                onClick={() => { setGoal(null); setGoalInput(""); localStorage.removeItem(STORAGE_KEY_PREFIX + docId); }}
                className="btn-ghost rounded-md px-2 py-1 text-xs"
                style={{ color: "var(--muted)" }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ color: "var(--muted)" }}>{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
