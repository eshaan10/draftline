/** Counts syllables in a single word using a heuristic. */
function syllableCount(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  // Remove trailing e (silent)
  const stripped = w.replace(/e$/, "");
  const matches = stripped.match(/[aeiouy]+/g);
  return Math.max(1, matches ? matches.length : 1);
}

export interface TextStats {
  wordCount: number;
  charCount: number;
  /** Rounded to one decimal place. -1 if not computable. */
  fleschKincaidGrade: number;
  /** Words per minute at 238 wpm average reading speed. */
  readingTimeSeconds: number;
}

/**
 * Computes word count, character count, Flesch-Kincaid grade level, and
 * estimated reading time from a plain-text string.
 *
 * FK grade = 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
 * Returns grade -1 when there are fewer than 2 words or 0 sentences.
 */
export function computeTextStats(text: string): TextStats {
  const charCount = text.length;
  const words = text.trim() === "" ? [] : text.trim().split(/\s+/);
  const wordCount = words.length;
  const readingTimeSeconds = Math.round((wordCount / 238) * 60);

  if (wordCount < 2) {
    return { wordCount, charCount, fleschKincaidGrade: -1, readingTimeSeconds };
  }

  // Sentence count: split on . ! ? followed by whitespace or end
  const sentenceMatches = text.match(/[.!?]+(\s|$)/g);
  const sentenceCount = sentenceMatches ? sentenceMatches.length : 1;

  const totalSyllables = words.reduce((sum, w) => sum + syllableCount(w), 0);

  const grade =
    0.39 * (wordCount / sentenceCount) +
    11.8 * (totalSyllables / wordCount) -
    15.59;

  return {
    wordCount,
    charCount,
    fleschKincaidGrade: Math.round(grade * 10) / 10,
    readingTimeSeconds,
  };
}
