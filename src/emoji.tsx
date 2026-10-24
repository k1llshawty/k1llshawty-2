import { useEffect, useReducer, useState, type ReactNode } from "react";
import { Star } from "lucide-react";
import { supabase } from "./supabase";
import { useSignedUrl } from "./media";

export const BUCKET_EMOJI = "emoji-packs";
const TOKEN = () => /:k1e_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):/g;
export const tokenOf = (id: string) => `:k1e_${id}:`;
export const stripTokens = (t: string) => t.replace(TOKEN(), "[эмодзи]");

// ── путь изображения по id (пакетная загрузка) ──
const paths = new Map<string, string>();
let queue = new Map<string, ((v: string | null) => void)[]>(), qt = 0;
function emojiPath(id: string): Promise<string | null> {
  const known = paths.get(id);
  if (known) return Promise.resolve(known);
  return new Promise((res) => { queue.set(id, [...(queue.get(id) ?? []), res]); if (!qt) qt = window.setTimeout(flushPaths, 20); });
}
async function flushPaths() {
  qt = 0; const q = queue; queue = new Map();
  const ids = [...q.keys()];
  const { data } = await supabase.from("emoji_items").select("id,path").in("id", ids);
  const m = new Map((data ?? []).map((r) => [r.id as string, r.path as string]));
  ids.forEach((id) => { const p = m.get(id) ?? null; if (p) paths.set(id, p); q.get(id)!.forEach((f) => f(p)); });
}
export function CustomEmoji({ id, size = 20, className = "cemoji" }: { id: string; size?: number; className?: string }) {
  const [p, setP] = useState<string | null>(paths.get(id) ?? null);
  useEffect(() => {
    const k = paths.get(id); if (k) { setP(k); return; }
    let dead = false; emojiPath(id).then((x) => { if (!dead) setP(x); });
    return () => { dead = true; };
  }, [id]);
  const url = useSignedUrl(p, BUCKET_EMOJI);
  return url ? <img className={className} src={url} width={size} height={size} alt="" /> : <span className={className + " ph"} style={{ width: size, height: size }} />;
}
/** Текст сообщения → безопасные React-узлы; HTML не используется, токены показываются только для разрешённого каталога */
export function renderBody(text: string): ReactNode[] {
  const out: ReactNode[] = []; let last = 0, i = 0;
  for (const m of text.matchAll(TOKEN())) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(<CustomEmoji key={i++} id={m[1]} size={22} />); last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ── Premium и эмодзи-статус (считаются на сервере: RPC user_flair) ──
export type Flair = { premium: boolean; emoji: string | null; custom: string | null };
const NONE: Flair = { premium: false, emoji: null, custom: null };
const fcache = new Map<string, { f: Flair; t: number }>(), fsubs = new Set<() => void>(), inflight = new Set<string>();
let pend = new Set<string>(), ft = 0;
function requestFlair(id: string) { if (inflight.has(id)) return; inflight.add(id); pend.add(id); if (!ft) ft = window.setTimeout(flushFlair, 20); }
async function flushFlair() {
  ft = 0; const ids = [...pend]; pend = new Set();
  const { data, error } = await supabase.rpc("user_flair", { p_ids: ids });
  if (error) console.error("user_flair:", error);
  const m = new Map(((data ?? []) as { user_id: string; emoji: string | null; custom: string | null }[]).map((r) => [r.user_id, r]));
  ids.forEach((id) => { inflight.delete(id); const r = m.get(id); fcache.set(id, { t: Date.now(), f: r ? { premium: true, emoji: r.emoji, custom: r.custom } : NONE }); });
  fsubs.forEach((f) => f());
}
export function invalidateFlair(id: string) { fcache.delete(id); fsubs.forEach((f) => f()); }
export function useFlair(uid?: string): Flair {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => { const f = () => tick(); fsubs.add(f); return () => { fsubs.delete(f); }; }, []);
  const c = uid ? fcache.get(uid) : undefined;
  useEffect(() => { if (uid && (!c || Date.now() - c.t > 60_000)) requestFlair(uid); });
  return c?.f ?? NONE;
}
export function FlairMarks({ uid, size = 16 }: { uid?: string; size?: number }) {
  const f = useFlair(uid);
  if (!f.premium) return null;
  return (
    <span className="flair">
      <span className="pstar" title="k1llshawty Premium" role="img" aria-label="Premium"><Star size={13} strokeWidth={1.75} fill="currentColor" /></span>
      {f.custom ? <CustomEmoji id={f.custom} size={size + 2} /> : f.emoji ? <span className="fe" style={{ fontSize: size }}>{f.emoji}</span> : null}
    </span>);
}

// ── каталог наборов для пикеров ──
export type Pack = { id: string; title: string; kinds: string[]; premium_only: boolean; items: { id: string; path: string; alt: string; position: number }[] };
export type Kind = "status" | "message" | "sticker";
const ccache = new Map<Kind, { t: number; packs: Pack[] }>();
export const invalidateCatalog = () => ccache.clear();
export function useCatalog(kind: Kind) {
  const [state, setState] = useState<{ loading: boolean; error: boolean; packs: Pack[] }>({ loading: true, error: false, packs: [] });
  useEffect(() => {
    const c = ccache.get(kind);
    if (c && Date.now() - c.t < 300_000) { setState({ loading: false, error: false, packs: c.packs }); return; }
    let dead = false;
    supabase.from("emoji_packs").select("id,title,kinds,premium_only,emoji_items(id,path,alt,position)").eq("published", true).contains("kinds", [kind]).order("created_at")
      .then(({ data, error }) => {
        if (dead) return;
        if (error) { console.error(error); return setState({ loading: false, error: true, packs: [] }); }
        const packs = ((data ?? []) as unknown as (Omit<Pack, "items"> & { emoji_items: Pack["items"] })[])
          .map((p) => ({ id: p.id, title: p.title, kinds: p.kinds, premium_only: p.premium_only, items: [...p.emoji_items].sort((a, b) => a.position - b.position) }))
          .filter((p) => p.items.length);
        packs.forEach((pk) => pk.items.forEach((i) => paths.set(i.id, i.path)));
        ccache.set(kind, { t: Date.now(), packs }); setState({ loading: false, error: false, packs });
      });
    return () => { dead = true; };
  }, [kind]);
  return state;
}
