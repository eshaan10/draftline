// Pure computation module -- no server imports, no React.

export interface ReplayEventRow {
  seq: number;
  kind: "type" | "paste" | "delete" | "format" | "undo" | "import" | "other";
  inserted: number;
  deleted: number;
  clientT: number;
  receivedAt: string;
  userId?: string; // server-stamped; undefined only for legacy/test events
}

export interface AuthorFacts {
  inserted: number;
  deleted: number;
  pasteEvents: number;
  activeWritingMs: number;
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
  perAuthor: Record<string, AuthorFacts>;
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
      perAuthor: {},
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

  // Per-author breakdown: group events by userId, then compute stats within each group.
  const perAuthor: Record<string, AuthorFacts> = {};

  for (const e of events) {
    const uid = e.userId ?? "__unknown__";
    if (!perAuthor[uid]) {
      perAuthor[uid] = { inserted: 0, deleted: 0, pasteEvents: 0, activeWritingMs: 0 };
    }
    perAuthor[uid].inserted += e.inserted;
    perAuthor[uid].deleted += e.deleted;
    if (e.kind === "paste") perAuthor[uid].pasteEvents += 1;
  }

  // Per-author active writing time: gaps between consecutive events by the same author.
  const byAuthor: Record<string, ReplayEventRow[]> = {};
  for (const e of events) {
    const uid = e.userId ?? "__unknown__";
    if (!byAuthor[uid]) byAuthor[uid] = [];
    byAuthor[uid].push(e);
  }
  for (const [uid, authorEvents] of Object.entries(byAuthor)) {
    // Events are already in seq order (ascending clientT within author sessions).
    let authorActiveMs = 0;
    for (let i = 1; i < authorEvents.length; i++) {
      const gap = authorEvents[i].clientT - authorEvents[i - 1].clientT;
      if (gap <= IDLE_GAP_MS) authorActiveMs += gap;
    }
    perAuthor[uid].activeWritingMs = authorActiveMs;
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
    perAuthor,
  };
}
