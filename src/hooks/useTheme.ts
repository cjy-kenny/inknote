import { useEffect, useState } from "react";
import type { Settings } from "../types";

function systemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useResolvedTheme(mode: Settings["theme"]): "light" | "dark" {
  const [system, setSystem] = useState(systemTheme);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystem(media.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return mode === "system" ? system : mode;
}

export function useApplyAppearance(settings: Settings, resolved: "light" | "dark") {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.accent = settings.accent;
    root.dataset.editorFont = settings.editorFont;
    root.style.setProperty("--editor-line-height", String(settings.lineHeight));
    root.style.colorScheme = resolved;
    document
      .querySelector('meta[name="color-scheme"]')
      ?.setAttribute("content", resolved === "dark" ? "dark" : "light dark");
  }, [resolved, settings.accent, settings.editorFont, settings.lineHeight]);
}

export const isMac = (): boolean =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export const modLabel = (): string => (isMac() ? "⌘" : "Ctrl");
