export type Theme = "default";
export const getTheme = (): Theme => "default";
export function applyTheme(_t: Theme = "default", animate = false) {
  const root = document.documentElement;
  if (animate) { root.classList.add("theme-anim"); window.setTimeout(() => root.classList.remove("theme-anim"), 280); }
  root.dataset.theme = "default";
  try { localStorage.setItem("k1x-theme", "default"); } catch { /* ignore */ }
}
