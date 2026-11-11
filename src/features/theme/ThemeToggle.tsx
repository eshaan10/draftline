"use client";

import { useEffect, useState } from "react";

type ThemeMode = "system" | "light" | "dark";

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "dark") {
    root.dataset.theme = "dark";
  } else if (mode === "light") {
    delete root.dataset.theme;
  } else {
    // system
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      root.dataset.theme = "dark";
    } else {
      delete root.dataset.theme;
    }
  }
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as ThemeMode | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      setMode(stored);
    }
  }, []);

  useEffect(() => {
    applyTheme(mode);
    localStorage.setItem("theme", mode);
  }, [mode]);

  // Listen for system preference changes when in system mode
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const next: Record<ThemeMode, ThemeMode> = {
    system: "light",
    light: "dark",
    dark: "system",
  };

  const label: Record<ThemeMode, string> = {
    system: "Auto",
    light: "Light",
    dark: "Dark",
  };

  const icon: Record<ThemeMode, string> = {
    system: "◑",
    light: "☀",
    dark: "☾",
  };

  return (
    <button
      type="button"
      onClick={() => setMode((m) => next[m])}
      className="btn-ghost rounded-md px-2 py-1 text-xs"
      title={`Theme: ${label[mode]} (click to cycle)`}
      aria-label={`Theme: ${label[mode]}`}
    >
      <span aria-hidden="true">{icon[mode]}</span>
      <span className="ml-1 hidden sm:inline">{label[mode]}</span>
    </button>
  );
}
