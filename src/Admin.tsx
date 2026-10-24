import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Search, ShieldCheck } from "lucide-react";
import { supabase, type Profile } from "./supabase";
import { Avatar, Badges, KINDS, dropBadges, type BadgeKind, type BadgeRow } from "./ui";

const PRESETS: BadgeKind[] = ["admin", "moderator", "favorite", "early", "premium"];

function AdminUser({ user, onBack }: { user: Profile; onBack: () => void }) {
  const [badges, setBadges] = useState<BadgeRow[]>([]);
  const [longBio, setLongBio] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [b, p] = await Promise.all([
      supabase.from("user_badges").select("id,kind,label").eq("user_id", user.id).order("created_at"),
      supabase.from("user_perks").select("long_bio").eq("user_id", user.id).maybeSingle(),
    ]);
    if (b.error || p.error) { console.error(b.error ?? p.error); return setState("error"); }
    setBadges((b.data ?? []) as BadgeRow[]); setLongBio(!!p.data?.long_bio); setState("ready");
  }, [user.id]);
  useEffect(() => { load(); }, [load]);

  async function run(job: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true); setErr(null);
    const { error } = await job();
    if (error) { console.error(error); setErr("Не удалось выполнить действие. Проверьте права и повторите."); }
    dropBadges(user.id); await load(); setBusy(false);
  }
  const add = (kind: BadgeKind, label = "") => run(() => supabase.from("user_badges").insert({ user_id: user.id, kind, label }));
  const addCustom = async () => { const l = custom.trim(); if (!l || l.length > 20) return; await add("custom", l); setCustom(""); };
  const remove = (id: string) => run(() => supabase.from("user_badges").delete().eq("id", id));
  const togglePerk = () => run(() => supabase.from("user_perks").upsert({ user_id: user.id, long_bio: !longBio }, { onConflict: "user_id" }));

  return (
    <>
      <header className="chat-head">
        <button className="icon-btn" onClick={onBack} aria-label="Назад"><ArrowLeft size={20} strokeWidth={1.75} /></button>
        <div className="ch-who static"><Avatar name={user.display_name} size={40} path={user.avatar_path} />
          <span className="cr-main"><strong>{user.display_name}</strong><span className="dim small">@{user.username}</span></span></div>
      </header>
      <div className="adm-body">
        {state === "loading" && <div className="skel" />}
        {state === "error" && <p className="err">Не удалось загрузить данные пользователя. Проверьте, что выполнена миграция 0006.</p>}
        {state === "ready" && (<>
          <section><h2>Плашки</h2>
            <p className="dim small">Плашки только украшение: они не дают никаких прав. Так они выглядят в профиле:</p>
            <div className="adm-prev"><strong>{user.display_name}</strong><Badges list={badges} />{!badges.length && <span className="dim small">плашек нет</span>}</div>
            <ul className="adm-list">{badges.map((b) => (
              <li key={b.id}><Badges list={[b]} /><button className="btn ghost" onClick={() => remove(b.id)} disabled={busy}>Снять</button></li>))}</ul>
            <div className="row">{PRESETS.map((k) => (
              <button key={k} className="btn" disabled={busy || badges.some((b) => b.kind === k)} onClick={() => add(k)}>+ {KINDS[k].text}</button>))}</div>
            <div className="cm-new"><input value={custom} maxLength={20} placeholder="Своя подпись (до 20 символов)" aria-label="Своя подпись" onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) addCustom(); }} />
              <button className="btn primary" onClick={addCustom} disabled={busy || !custom.trim()}>Добавить</button></div>
          </section>
          <section><h2>Привилегии</h2>
            <label className="check"><input type="checkbox" checked={longBio} onChange={togglePerk} disabled={busy} />
              <span>Расширенное описание профиля — до 1000 символов вместо 200</span></label>
          </section>
          {err && <p className="err" role="alert">{err}</p>}
        </>)}
      </div>
    </>
  );
}

export default function Admin() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Profile[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [sel, setSel] = useState<Profile | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const id = ++seq.current; setState("loading");
    const t = window.setTimeout(async () => {
      const clean = q.replace(/[%,()*\\]/g, " ").trim();
      let req = supabase.from("profiles").select("*").limit(40);
      req = clean ? req.or(`username.ilike.%${clean}%,display_name.ilike.%${clean}%`).order("username") : req.order("created_at", { ascending: false });
      const { data, error } = await req;
      if (id !== seq.current) return;
      if (error) return setState("error");
      setRes((data ?? []) as Profile[]); setState("ready");
    }, 280);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className={"split" + (sel ? " open" : "")}>
      <aside className="list-pane">
        <header className="topbar"><h2>Администрирование</h2></header>
        <div className="search"><Search size={16} strokeWidth={1.75} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по username" aria-label="Поиск пользователей" autoCapitalize="none" /></div>
        {state === "loading" && <div className="skel" />}
        {state === "error" && <div className="empty-in"><p className="err">Не удалось загрузить пользователей.</p></div>}
        {state === "ready" && !res.length && <div className="empty-in"><p className="muted">Никого не найдено.</p></div>}
        <ul className="chat-list">{res.map((p) => (
          <li key={p.id}><button className={"chat-row" + (sel?.id === p.id ? " on" : "")} onClick={() => setSel(p)}>
            <Avatar name={p.display_name} size={44} path={p.avatar_path} />
            <span className="cr-main"><strong>{p.display_name}</strong><span className="muted small">@{p.username}</span></span>
          </button></li>))}</ul>
      </aside>
      <section className="chat-pane">
        {sel ? <AdminUser key={sel.id} user={sel} onBack={() => setSel(null)} />
          : <div className="empty-in"><ShieldCheck size={34} strokeWidth={1.4} className="dim" /><p className="dim">Выберите пользователя, чтобы управлять плашками.</p></div>}
      </section>
    </div>
  );
}
