// Pure computation module -- no server imports, no React.

export interface ReplayEventRow {
  seq: number;
  kind: "type" | "paste" | "delete" | "format" | "undo" | "import" | "other";
  inserted: number;
  deleted: number;
  clientT: number;
  receivedAt: string;
}

export interface ReplayFacts {
  activeWritingMs: number;
  sessionCount: number;
  revisionCount: number;
  pasteEvents: Array<{ seq: number; clientT: number; insertedChars: number }>;
  charsBySource: {
    typed: number;
    pasted: number;
    imported: number;
    total: number;
  };
}

const IDLE_GAP_MS = 120_000; // 2 minutes
const SESSION_GAP_MS = 1_800_000; // 30 minutes

export function computeFacts(events: ReplayEventRow[]): ReplayFacts {
  if (events.length === 0) {
    return {
      activeWritingMs: 0,
      sessionCount: 0,
      revisionCount: 0,
      pasteEvents: [],
      charsBySource: { typed: 0, pasted: 0, imported: 0, total: 0 },
    };
  }

  // Assumes events are sorted by seq (ascending).
  let activeWritingMs = 0;
  let sessionCount = 1;

  for (let i = 1; i < events.length; i++) {
    const gap = events[i].clientT - events[i - 1].clientT;
    if (gap <= IDLE_GAP_MS) {
      activeWritingMs += gap;
    }
    if (gap > SESSION_GAP_MS) {
      sessionCount++;
    }
  }

  const revisionCount = events.length;

  const pasteEvents = events
    .filter((e) => e.kind === "paste")
    .map((e) => ({ seq: e.seq, clientT: e.clientT, insertedChars: e.inserted }));

  let typed = 0;
  let pasted = 0;
  let imported = 0;

  for (const e of events) {
    if (e.kind === "paste") {
      pasted += e.inserted;
    } else if (e.kind === "import") {
      imported += e.inserted;
    } else {
      typed += e.inserted;
    }
  }

  return {
    activeWritingMs,
    sessionCount,
    revisionCount,
    pasteEvents,
    charsBySource: {
      typed,
      pasted,
      imported,
      total: typed + pasted + imported,
    },
  };
}
