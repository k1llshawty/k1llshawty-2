import { createContext, useContext } from "react";
import { useSignedUrl } from "./media";
import { supabase, type Profile } from "./supabase";

export type Tab = "chats" | "feed" | "explore" | "profile";
export type Nav = { goProfile: (p: Profile) => void; startChat: (userId: string) => Promise<boolean>; goTab: (t: Tab) => void };
export const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
export const OnlineContext = createContext<Set<string>>(new Set());
export function Avatar({ name, size = 40, path, uid }: { name: string; size?: number; path?: string | null; uid?: string }) {
  const url = useSignedUrl(path);
  const on = !!uid && useContext(OnlineContext).has(uid);
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
  const { data } = await supabase.from("profiles").select("*").in("id", ids);
  const m = new Map(((data ?? []) as Profile[]).map((p) => [p.id, p]));
  return rows.filter((r) => m.has(r.author_id)).map((r) => ({ ...r, author: m.get(r.author_id)! }));
}
export const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export function fmtChatTime(iso: string) {
  const d = new Date(iso), n = new Date();
  if (d.toDateString() === n.toDateString()) return fmtClock(iso);
  return (n.getTime() - d.getTime()) / 864e5 < 7 ? d.toLocaleDateString("ru-RU", { weekday: "short" }) : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
