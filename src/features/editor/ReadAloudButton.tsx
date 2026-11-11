"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

type State = "idle" | "playing" | "paused";
const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

interface Props {
  editor: Editor | null;
}

export function ReadAloudButton({ editor }: Props) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [speedIndex, setSpeedIndex] = useState(1); // default 1x
  const uttRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  if (!supported || !editor) return null;

  const speed = SPEEDS[speedIndex];

  function getText(): string {
    if (!editor) return "";
    const { from, to, empty } = editor.state.selection;
    if (!empty) {
      return editor.state.doc.textBetween(from, to, " ");
    }
    return editor.getText();
  }

  function play() {
    const text = getText();
    if (!text.trim()) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = speed;
    utt.onend = () => setState("idle");
    utt.onerror = () => setState("idle");
    uttRef.current = utt;
    window.speechSynthesis.speak(utt);
    setState("playing");
  }

  function pause() {
    window.speechSynthesis.pause();
    setState("paused");
  }

  function resume() {
    window.speechSynthesis.resume();
    setState("playing");
  }

  function stop() {
    window.speechSynthesis.cancel();
    uttRef.current = null;
    setState("idle");
  }

  function cycleSpeed() {
    const nextIndex = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(nextIndex);
    if (state === "playing" || state === "paused") {
      // Restart at new speed from scratch (SpeechSynthesis has no setRate mid-utterance)
      stop();
    }
  }

  const btnClass =
    "inline-flex h-8 min-w-[2rem] items-center justify-center rounded-md px-2 text-sm transition disabled:opacity-40";

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Read aloud">
      {state === "idle" && (
        <button
          type="button"
          onClick={play}
          className={btnClass}
          style={{ background: "transparent", color: "var(--fg)" }}
          aria-label="Read aloud"
          title="Read aloud (reads selection or full document)"
        >
          ▶
        </button>
      )}
      {state === "playing" && (
        <button
          type="button"
          onClick={pause}
          className={btnClass}
          style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
          aria-label="Pause"
          title="Pause"
        >
          ⏸
        </button>
      )}
      {state === "paused" && (
        <button
          type="button"
          onClick={resume}
          className={btnClass}
          style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
          aria-label="Resume"
          title="Resume"
        >
          ▶
        </button>
      )}
      {state !== "idle" && (
        <button
          type="button"
          onClick={stop}
          className={btnClass}
          style={{ background: "transparent", color: "var(--fg)" }}
          aria-label="Stop"
          title="Stop"
        >
          ■
        </button>
      )}
      <button
        type="button"
        onClick={cycleSpeed}
        className={btnClass}
        style={{ background: "transparent", color: "var(--muted)", fontSize: "0.65rem" }}
        aria-label={`Playback speed: ${speed}x`}
        title="Cycle playback speed"
      >
        {speed}x
      </button>
    </div>
  );
}
