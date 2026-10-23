import { useSyncExternalStore } from "react";
export type Theme = "default" | "winter" | "halloween";
const KEY = "k1x-theme";
const subs = new Set<() => void>();
export function getTheme(): Theme {
  try { const v = localStorage.getItem(KEY); return v === "winter" || v === "halloween" ? v : "default"; } catch { return "default"; }
}
export function applyTheme(t: Theme, animate = false) {
  const root = document.documentElement;
  if (animate) { root.classList.add("theme-anim"); window.setTimeout(() => root.classList.remove("theme-anim"), 280); }
  root.dataset.theme = t;
  try { localStorage.setItem(KEY, t); } catch { /* тема не сохранится в приватном режиме */ }
  subs.forEach((f) => f());
}
export const useTheme = (): Theme =>
  useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => (document.documentElement.dataset.theme as Theme) || "default");
