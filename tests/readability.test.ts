import { describe, it, expect } from "vitest";
import { computeTextStats } from "../src/features/goals/readability";

describe("computeTextStats", () => {
  it("empty string returns zeros and grade -1", () => {
    const s = computeTextStats("");
    expect(s.wordCount).toBe(0);
    expect(s.charCount).toBe(0);
    expect(s.fleschKincaidGrade).toBe(-1);
    expect(s.readingTimeSeconds).toBe(0);
  });

  it("single word returns grade -1 (not enough to compute)", () => {
    const s = computeTextStats("Hello");
    expect(s.wordCount).toBe(1);
    expect(s.fleschKincaidGrade).toBe(-1);
  });

  it("counts words and characters correctly", () => {
    const s = computeTextStats("The cat sat.");
    expect(s.wordCount).toBe(3);
    expect(s.charCount).toBe(12);
  });

  it("computes a grade for a simple sentence", () => {
    // "The cat sat on the mat." -- 6 words, 1 sentence, 6 syllables
    // FK = 0.39*(6/1) + 11.8*(6/6) - 15.59 = 2.34 + 11.8 - 15.59 = -1.45
    const s = computeTextStats("The cat sat on the mat.");
    expect(s.fleschKincaidGrade).toBeLessThan(2);
    expect(s.fleschKincaidGrade).toBeGreaterThan(-5);
  });

  it("gives a higher grade for longer, polysyllabic text", () => {
    const simple = computeTextStats("The cat sat on the mat.");
    const complex = computeTextStats(
      "The proliferation of multisyllabic terminology necessitates careful consideration."
    );
    expect(complex.fleschKincaidGrade).toBeGreaterThan(simple.fleschKincaidGrade);
  });

  it("estimates reading time based on 238 wpm", () => {
    // 238 words should be ~60 seconds
    const words = Array(238).fill("word").join(" ") + ".";
    const s = computeTextStats(words);
    expect(s.readingTimeSeconds).toBe(60);
  });

  it("whitespace-only string returns zero word count", () => {
    const s = computeTextStats("   \n  ");
    expect(s.wordCount).toBe(0);
  });
});
