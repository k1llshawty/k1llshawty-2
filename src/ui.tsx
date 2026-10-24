import { createContext, useContext, useEffect, useState } from "react";
import { Heart, Shield, ShieldCheck, Sparkles, Star, Tag } from "lucide-react";
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

export type BadgeKind = "admin" | "moderator" | "favorite" | "early" | "premium" | "custom";
export type BadgeRow = { id: string; kind: BadgeKind; label: string };
export const KINDS: Record<BadgeKind, { text: string; Icon: typeof Star }> = {
  admin: { text: "Администратор", Icon: ShieldCheck }, moderator: { text: "Модератор", Icon: Shield }, favorite: { text: "Любимка", Icon: Heart },
  early: { text: "Ранний пользователь", Icon: Sparkles }, premium: { text: "Premium", Icon: Star }, custom: { text: "", Icon: Tag },
};
const ORDER: BadgeKind[] = ["admin", "moderator", "premium", "favorite", "early", "custom"];
const bcache = new Map<string, BadgeRow[]>();
export const dropBadges = (uid: string) => { bcache.delete(uid); };
export function useBadges(uid?: string) {
  const [b, setB] = useState<BadgeRow[]>((uid && bcache.get(uid)) || []);
  useEffect(() => {
    if (!uid) { setB([]); return; }
    const c = bcache.get(uid);
    if (c) { setB(c); return; }
    let dead = false;
    supabase.from("user_badges").select("id,kind,label").eq("user_id", uid).then(({ data }) => {
      if (dead || !data) return;
      const list = (data as BadgeRow[]).sort((x, y) => ORDER.indexOf(x.kind) - ORDER.indexOf(y.kind));
      bcache.set(uid, list); setB(list);
    });
    return () => { dead = true; };
  }, [uid]);
  return b;
}
/** Текст плашек выводится как обычный текст React: HTML не исполняется */
export function Badges({ list, max, compact }: { list: BadgeRow[]; max?: number; compact?: boolean }) {
  if (!list.length) return null;
  const shown = max ? list.slice(0, max) : list;
  return (
    <span className={"badges" + (compact ? " compact" : "")}>
      {shown.map((b) => { const { Icon, text } = KINDS[b.kind]; return <span key={b.id} className="bdg" data-kind={b.kind}><Icon size={12} strokeWidth={1.75} />{b.kind === "custom" ? b.label : text}</span>; })}
    </span>);
}
