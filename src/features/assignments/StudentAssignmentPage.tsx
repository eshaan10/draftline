"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { generateHTML } from "@tiptap/html";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { buildExtensions } from "@/features/editor/editorExtensions";

type Assignment = {
  id: string;
  title: string;
  className: string;
  dueAt: string;
  instructions: unknown;
};

type Submission = {
  id: string;
  documentId: string;
  status: "not_started" | "in_progress" | "submitted";
  isLate: boolean;
  submittedAt: string | null;
  firstSubmittedAt: string | null;
  feedback: string | null;
};

const PANE_KEY_PREFIX = "draftline:assignment-pane:";

export function StudentAssignmentPage({
  user,
  assignment,
  submission: initialSubmission,
}: {
  user: { id: string; name: string };
  assignment: Assignment;
  submission: Submission;
}) {
  const [paneOpen, setPaneOpen] = useState(true);
  const [submission, setSubmission] = useState(initialSubmission);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist pane open/closed state per assignment in localStorage.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PANE_KEY_PREFIX + assignment.id);
      if (saved !== null) setPaneOpen(saved === "1");
    } catch {}
  }, [assignment.id]);
  useEffect(() => {
    try {
      window.localStorage.setItem(PANE_KEY_PREFIX + assignment.id, paneOpen ? "1" : "0");
    } catch {}
  }, [paneOpen, assignment.id]);

  const instructionsHtml = useMemo(() => {
    try {
      const doc =
        assignment.instructions &&
        typeof assignment.instructions === "object" &&
        (assignment.instructions as { type?: string }).type === "doc"
          ? (assignment.instructions as object)
          : { type: "doc", content: [] };
      return generateHTML(doc, buildExtensions());
    } catch {
      return "";
    }
  }, [assignment.instructions]);

  const now = Date.now();
  const dueMs = new Date(assignment.dueAt).getTime();
  const overdue = now > dueMs;
  const locked = submission.status === "submitted" && overdue;

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/assignments/${assignment.id}/submit`, { method: "POST" });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Could not submit.");
      return;
    }
    const body = await res.json();
    setSubmission((prev) => ({
      ...prev,
      status: body.submission.status,
      isLate: body.submission.isLate,
      submittedAt: body.submission.submittedAt,
      firstSubmittedAt: body.submission.firstSubmittedAt,
    }));
  }

  return (
    <main className="min-h-screen">
      <header
        className="sticky top-0 z-20 border-b"
        style={{ background: "var(--bg)", borderColor: "var(--border)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              {assignment.className}
            </p>
            <h1 className="mt-0.5 truncate text-lg font-semibold">{assignment.title}</h1>
          </div>
          <div className="flex items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
            <span>Due {new Date(assignment.dueAt).toLocaleString()}</span>
            <StatusBadge submission={submission} overdue={overdue} />
            <button
              type="button"
              onClick={() => setPaneOpen((v) => !v)}
              className="btn-ghost rounded-md px-3 py-1.5 text-xs"
              aria-label={paneOpen ? "Hide instructions" : "Show instructions"}
            >
              {paneOpen ? "Hide instructions" : "Show instructions"}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || locked}
              className="btn-primary rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60"
              title={locked ? "The deadline has passed and you have submitted." : ""}
            >
              {submitting ? "Submitting..." : submission.status === "submitted" ? "Resubmit" : "Submit"}
            </button>
            <Link href="/assignments" className="btn-ghost rounded-md px-3 py-1.5 text-xs">
              Back
            </Link>
            <ThemeToggle />
          </div>
        </div>
        {error && (
          <div className="mx-auto max-w-6xl px-6 pb-3 text-xs" style={{ color: "#b91c1c" }}>
            {error}
          </div>
        )}
        {locked && (
          <div className="mx-auto max-w-6xl px-6 pb-3 text-xs" style={{ color: "#92400e" }}>
            This submission is closed. The deadline has passed.
          </div>
        )}
      </header>

      <section
        className="mx-auto grid max-w-6xl gap-4 px-4 py-4"
        style={{ gridTemplateColumns: paneOpen ? "320px 1fr" : "1fr" }}
      >
        {paneOpen && (
          <aside
            className="prose-page rounded-md border p-4 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface)", maxHeight: "calc(100vh - 160px)", overflowY: "auto" }}
            aria-label="Instructions"
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              Instructions
            </p>
            <div dangerouslySetInnerHTML={{ __html: instructionsHtml }} />
          </aside>
        )}
        <div
          className="rounded-md border overflow-hidden"
          style={{ borderColor: "var(--border)", height: "calc(100vh - 160px)" }}
        >
          <iframe
            src={`/docs/${submission.documentId}`}
            title="Document editor"
            className="h-full w-full"
            style={{ border: 0, background: "var(--bg)" }}
          />
        </div>
      </section>

      {submission.feedback && (
        <section className="mx-auto max-w-6xl px-4 pb-8">
          <div
            className="rounded-md border p-4"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              Teacher feedback
            </p>
            <p className="text-sm whitespace-pre-wrap">{submission.feedback}</p>
          </div>
        </section>
      )}
    </main>
  );
}

function StatusBadge({
  submission,
  overdue,
}: {
  submission: Submission;
  overdue: boolean;
}) {
  const label =
    submission.status === "submitted"
      ? submission.isLate
        ? "Submitted late"
        : "Submitted"
      : submission.status === "in_progress"
        ? "In progress"
        : overdue
          ? "Overdue"
          : "Not started";
  const style =
    submission.status === "submitted" && !submission.isLate
      ? { background: "var(--brand-soft)", color: "var(--brand)", borderColor: "var(--brand-border)" }
      : submission.isLate || overdue
        ? { background: "#fef3c7", color: "#92400e", borderColor: "#fcd34d" }
        : { background: "transparent", color: "var(--muted)", borderColor: "var(--border)" };
  return (
    <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide" style={style}>
      {label}
    </span>
  );
}
