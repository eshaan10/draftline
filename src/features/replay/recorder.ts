// Pure TypeScript recorder -- no React, no "use client".
// Captures Tiptap transactions and flushes them to the events API.

export interface RecordedEvent {
  seq: number;
  kind: "type" | "paste" | "delete" | "format" | "undo" | "import" | "other";
  steps: unknown[];
  inserted: number;
  deleted: number;
  clientT: number;
  checkpoint?: unknown;
}

export interface RecorderOptions {
  docId: string;
  initialContent: unknown;
  nextSeq: number;
}

// We only import types from @tiptap/pm so no server-side DOM requirement.
type ProseMirrorTransaction = {
  getMeta(key: string): unknown;
  steps: Array<{
    toJSON(): unknown;
    constructor: { name: string };
    from?: number;
    to?: number;
    slice?: {
      content: {
        size: number;
        textBetween(from: number, to: number): string;
      };
    };
  }>;
  before: {
    textBetween(from: number, to: number): string;
  };
};

function classifyTransaction(tr: ProseMirrorTransaction): RecordedEvent["kind"] {
  if (tr.getMeta("uiEvent") === "paste") return "paste";
  if (tr.getMeta("uiEvent") === "drop") return "other";
  if (tr.getMeta("history$")) return "undo";
  if (tr.steps.length === 0) return "type";

  const allDelete = tr.steps.every((s) => {
    const slice = s.slice;
    return slice !== undefined && slice.content.size === 0;
  });
  if (allDelete) return "delete";

  const hasMarkOrAttr = tr.steps.some(
    (s) => s.constructor.name.includes("Mark") || s.constructor.name.includes("Attr"),
  );
  if (hasMarkOrAttr) return "format";

  return "type";
}

function countChars(
  tr: ProseMirrorTransaction,
): { inserted: number; deleted: number } {
  let inserted = 0;
  let deleted = 0;
  for (const step of tr.steps) {
    // Only ReplaceStep-like steps have from/to/slice
    if (step.from !== undefined && step.to !== undefined && step.slice !== undefined) {
      try {
        inserted += step.slice.content.textBetween(0, step.slice.content.size).length;
        deleted += tr.before.textBetween(step.from, step.to).length;
      } catch {
        // ignore individual step errors
      }
    }
  }
  return { inserted, deleted };
}

export interface Recorder {
  record(tr: ProseMirrorTransaction, getCheckpoint: () => unknown): void;
  onBlur(): void;
  destroy(): void;
}

export function createRecorder(opts: RecorderOptions): Recorder {
  const { docId, initialContent, nextSeq } = opts;
  const startTime = Date.now();
  let seq = nextSeq;
  let buffer: RecordedEvent[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  let eventCount = 0; // counts since recorder was created (for checkpoint every 100)

  // If this is a fresh document (seq === 0), emit an immediate checkpoint event
  // before recording any transactions.
  if (nextSeq === 0) {
    buffer.push({
      seq: 0,
      kind: "type",
      steps: [],
      inserted: 0,
      deleted: 0,
      clientT: 0,
      checkpoint: initialContent,
    });
    seq = 1;
    // Flush immediately (async, don't await)
    void flush();
  }

  async function flush(): Promise<void> {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];

    try {
      await fetch(`/api/docs/${docId}/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: batch }),
      });
    } catch {
      // Network failures are silently dropped; recorder is best-effort.
    }
  }

  function scheduleFlush(): void {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      void flush();
    }, 2000);
  }

  function beaconFlush(): void {
    if (buffer.length === 0) return;
    const body = JSON.stringify({ events: buffer });
    buffer = [];
    try {
      navigator.sendBeacon(`/api/docs/${docId}/events`, body);
    } catch {
      // sendBeacon not available (SSR guard) -- ignore
    }
  }

  function onPageHide(): void {
    beaconFlush();
  }

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", onPageHide);
  }

  function record(tr: ProseMirrorTransaction, getCheckpoint: () => unknown): void {
    if (destroyed) return;
    // Skip no-op transactions (no steps, no doc change)
    if (tr.steps.length === 0) return;

    const kind = classifyTransaction(tr);
    const { inserted, deleted } = countChars(tr);
    const clientT = Date.now() - startTime;

    let steps: unknown[] = [];
    try {
      steps = tr.steps.map((s) => s.toJSON());
    } catch {
      // If serialization fails, store empty steps and always checkpoint
    }
    const serializationFailed = steps.length === 0 && tr.steps.length > 0;

    const isFirstEvent = eventCount === 0 && nextSeq !== 0;
    const isHundredthEvent = seq % 100 === 0;
    const needsCheckpoint = isFirstEvent || isHundredthEvent || serializationFailed;

    const event: RecordedEvent = {
      seq,
      kind,
      steps,
      inserted,
      deleted,
      clientT,
    };

    if (needsCheckpoint) {
      event.checkpoint = getCheckpoint();
    }

    buffer.push(event);
    seq++;
    eventCount++;
    scheduleFlush();
  }

  function onBlur(): void {
    if (destroyed) return;
    void flush();
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", onPageHide);
    }
    beaconFlush();
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  }

  return { record, onBlur, destroy };
}
