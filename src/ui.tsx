import { createContext, useContext } from "react";
import { useSignedUrl } from "./media";
import { supabase, type Profile } from "./supabase";

export type Tab = "chats" | "feed" | "explore" | "profile" | "admin";
export type Nav = { goProfile: (p: Profile) => void; startChat: (userId: string) => Promise<boolean>; goTab: (t: Tab) => void };
export const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
export const OnlineContext = createContext<Set<string>>(new Set());
export function Avatar({ name, size = 40, path, uid }: { name: string; size?: number; path?: string | null; uid?: string }) {
  const url = useSignedUrl(path);
  const online = useContext(OnlineContext);
  const on = !!uid && online.has(uid);
  return (
    <span className="av-wrap" style={{ width: size, height: size }}>
      <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>{url ? <img src={url} alt="" /> : initials(name)}</span>
      {on && <i className="dot" style={{ width: Math.max(10, size * 0.25), height: Math.max(10, size * 0.25) }} role="img" aria-label="В сети" />}
    </span>);
}
/** Авторы подгружаются отдельным запросом: так нет неоднозначных связей posts↔profiles в PostgREST */
export async function attachAuthors<T extends { author_id: string }>(rows: T[]): Promise<(T & { author: Profile })[]> {
  const ids = [...new Set(rows.map((r) => r.author_id))];
  if (!ids.length) return [];
  const { data, error } = await supabase.from("profiles").select("*").in("id", ids);
  if (error) throw error; // ошибку показывает вызывающий компонент, посты молча не пропадают
  const m = new Map(((data ?? []) as Profile[]).map((x) => [x.id, x]));
  if (rows.some((r) => !m.has(r.author_id))) throw new Error("author_missing");
  return rows.map((r) => ({ ...r, author: m.get(r.author_id)! }));
}
export const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export function fmtChatTime(iso: string) {
  const d = new Date(iso), n = new Date();
  if (d.toDateString() === n.toDateString()) return fmtClock(iso);
  return (n.getTime() - d.getTime()) / 864e5 < 7 ? d.toLocaleDateString("ru-RU", { weekday: "short" }) : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function lastSeenText(iso: string) {
  const d = new Date(iso), n = new Date(), t = fmtClock(iso);
  if (d.toDateString() === n.toDateString()) return `Был(а) сегодня в ${t}`;
  const y = new Date(n); y.setDate(n.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Был(а) вчера в ${t}`;
  const day = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", ...(d.getFullYear() !== n.getFullYear() ? { year: "numeric" as const } : {}) });
  return `Был(а) ${day} в ${t}`;
}
// Перед выходом сохраняем время последнего визита (пока сессия ещё действует)
export async function signOutClean() { try { await supabase.rpc("touch_last_seen"); } catch { /* не мешаем выходу */ } await supabase.auth.signOut(); }
