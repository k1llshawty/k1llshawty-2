import { useSignedUrl } from "./media";
import type { Profile } from "./supabase";

export type Tab = "chats" | "feed" | "explore" | "profile";
export type Nav = { goProfile: (p: Profile) => void; startChat: (userId: string) => Promise<boolean>; goTab: (t: Tab) => void };
export const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
export function Avatar({ name, size = 40, path }: { name: string; size?: number; path?: string | null }) {
  const url = useSignedUrl(path);
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>{url ? <img src={url} alt="" /> : initials(name)}</span>;
}
export const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export function fmtChatTime(iso: string) {
  const d = new Date(iso), n = new Date();
  if (d.toDateString() === n.toDateString()) return fmtClock(iso);
  return (n.getTime() - d.getTime()) / 864e5 < 7 ? d.toLocaleDateString("ru-RU", { weekday: "short" }) : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
