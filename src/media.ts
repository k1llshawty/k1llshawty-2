import { useEffect, useState } from "react";
import { supabase, type Profile } from "./supabase";

const BUCKET = "profile-media", TTL = 3600;
export const SIZES = { avatar: { w: 512, h: 512, maxMb: 5 }, cover: { w: 1600, h: 600, maxMb: 10 } } as const;
export type Kind = keyof typeof SIZES;
const cache = new Map<string, { url: string; exp: number }>();

export async function signedUrl(path: string) {
  const c = cache.get(path);
  if (c && c.exp > Date.now() + 400_000) return c.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL);
  if (error || !data) return c?.url ?? null;
  cache.set(path, { url: data.signedUrl, exp: Date.now() + TTL * 1000 });
  return data.signedUrl;
}

// Подписанная ссылка обновляется заранее, пока открыта страница
export function useSignedUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    let dead = false, t = 0;
    const run = async () => {
      const u = await signedUrl(path);
      if (dead) return;
      if (u) setUrl(u);
      t = window.setTimeout(run, (TTL - 300) * 1000);
    };
    run();
    return () => { dead = true; clearTimeout(t); };
  }, [path]);
  return path ? url : null;
}

// Кадрирование по центру и сжатие в браузере (WebP, при необходимости JPEG)
export async function compress(file: File, kind: Kind): Promise<Blob> {
  const { w, h } = SIZES[kind];
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const s = Math.max(w / bmp.width, h / bmp.height);
  c.getContext("2d")!.drawImage(bmp, (w - bmp.width * s) / 2, (h - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
  bmp.close();
  const to = (type: string) => new Promise<Blob | null>((r) => c.toBlob(r, type, 0.85));
  let b = await to("image/webp");
  if (!b || b.type !== "image/webp") b = await to("image/jpeg");
  if (!b) throw new Error("compress");
  return b;
}

// Старый файл удаляется только после того, как новый загружен и путь сохранён в профиле
export async function saveMedia(uid: string, kind: Kind, blob: Blob | null, oldPath: string | null): Promise<Profile> {
  const col = kind === "avatar" ? "avatar_path" : "cover_path";
  let path: string | null = null;
  if (blob) {
    path = `${uid}/${kind}-${Date.now()}.${blob.type === "image/webp" ? "webp" : "jpg"}`;
    const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
    if (up.error) throw up.error;
  }
  const { data, error } = await supabase.from("profiles").update({ [col]: path }).eq("id", uid).select().single();
  if (error) { if (path) await supabase.storage.from(BUCKET).remove([path]); throw error; }
  if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
  return data as Profile;
}
