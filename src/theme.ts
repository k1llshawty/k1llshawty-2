export type Theme = "cold" | "halloween";
const KEY = "k1x-theme";
export function getTheme(): Theme {
  try { return localStorage.getItem(KEY) === "halloween" ? "halloween" : "cold"; } catch { return "cold"; }
}
export function applyTheme(t: Theme, animate = false) {
  const root = document.documentElement;
  if (animate) { root.classList.add("theme-anim"); window.setTimeout(() => root.classList.remove("theme-anim"), 280); }
  root.dataset.theme = t;
  try { localStorage.setItem(KEY, t); } catch { /* приватный режим: тема просто не сохранится */ }
}
