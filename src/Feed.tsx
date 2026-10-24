import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, MessageCircle, Trash2 } from "lucide-react";
import { supabase, type Profile } from "./supabase";
import { Avatar, fmtDateTime, type Nav } from "./ui";

type PostRow = { id: string; body: string; created_at: string; author_id: string; author: Profile; post_likes: { count: number }[]; comments: { count: number }[] };
type Cm = { id: string; body: string; created_at: string; author_id: string; author: Profile };
const PAGE = 20;

function PostCard({ post, liked0, me, nav, onDelete }: { post: PostRow; liked0: boolean; me: Profile; nav: Nav; onDelete: (id: string) => void }) {
  const [liked, setLiked] = useState(liked0), [likes, setLikes] = useState(post.post_likes[0]?.count ?? 0);
  const [cc, setCc] = useState(post.comments[0]?.count ?? 0), [open, setOpen] = useState(false);
  const [cms, setCms] = useState<Cm[]>([]), [cState, setCState] = useState<"idle" | "loading" | "error">("idle");
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const lock = useRef(false);

  async function toggle() {
    if (lock.current) return; lock.current = true;
    const next = !liked; setLiked(next); setLikes((n) => n + (next ? 1 : -1));
    const { error } = next ? await supabase.from("post_likes").insert({ post_id: post.id }) : await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", me.id);
    if (error) { setLiked(!next); setLikes((n) => n + (next ? -1 : 1)); }
    lock.current = false;
  }
  async function loadCms() {
    setCState("loading");
    const { data, error } = await supabase.from("comments").select("id,body,created_at,author_id,author:profiles(*)").eq("post_id", post.id).order("created_at").limit(100);
    if (error) return setCState("error");
    setCms((data ?? []) as unknown as Cm[]); setCState("idle");
  }
  const toggleCms = () => { if (!open) loadCms(); setOpen(!open); };
  async function addCm() {
    const body = text.trim(); if (!body || busy) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabase.from("comments").insert({ post_id: post.id, body }).select("id,body,created_at,author_id,author:profiles(*)").single();
    setBusy(false);
    if (error || !data) return setErr("Не удалось отправить комментарий.");
    setCms((p) => [...p, data as unknown as Cm]); setCc((n) => n + 1); setText("");
  }
  async function delCm(id: string) {
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (!error) { setCms((p) => p.filter((c) => c.id !== id)); setCc((n) => Math.max(0, n - 1)); }
  }
  async function delPost() {
    if (!window.confirm("Удалить публикацию?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (error) setErr("Не удалось удалить."); else onDelete(post.id);
  }
  const a = post.author;
  return (
    <li className="pcard">
      <button className="pc-av" onClick={() => nav.goProfile(a)} aria-label={a.display_name}><Avatar name={a.display_name} size={42} path={a.avatar_path} /></button>
      <div className="pc-main">
        <p className="post-meta"><button className="pc-name" onClick={() => nav.goProfile(a)}>{a.display_name}</button><span className="muted">@{a.username}</span><time className="dim">{fmtDateTime(post.created_at)}</time></p>
        <p className="post-body">{post.body}</p>
        <div className="pc-actions">
          <button className={"act" + (liked ? " on" : "")} onClick={toggle} aria-pressed={liked} aria-label="Лайк"><Heart size={17} strokeWidth={1.75} fill={liked ? "currentColor" : "none"} />{likes}</button>
          <button className="act" onClick={toggleCms} aria-expanded={open}><MessageCircle size={17} strokeWidth={1.75} />{cc}</button>
          {post.author_id === me.id && <button className="act end" onClick={delPost} aria-label="Удалить публикацию"><Trash2 size={16} strokeWidth={1.75} /></button>}
        </div>
        {err && <p className="err small">{err}</p>}
        {open && (
          <div className="cms">
            {cState === "loading" && <p className="dim small">Загрузка…</p>}
            {cState === "error" && <p className="err small">Не удалось загрузить комментарии.</p>}
            {cms.map((c) => (
              <div key={c.id} className="cm">
                <Avatar name={c.author.display_name} size={28} path={c.author.avatar_path} />
                <div><p className="small"><button className="pc-name" onClick={() => nav.goProfile(c.author)}>{c.author.display_name}</button> <time className="dim">{fmtDateTime(c.created_at)}</time></p><p className="cm-body">{c.body}</p></div>
                {c.author_id === me.id && <button className="act end" onClick={() => delCm(c.id)} aria-label="Удалить комментарий"><Trash2 size={14} strokeWidth={1.75} /></button>}
              </div>))}
            <div className="cm-new"><input value={text} maxLength={300} placeholder="Комментарий" aria-label="Комментарий" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) addCm(); }} /><button className="btn primary" onClick={addCm} disabled={!text.trim() || busy}>Отправить</button></div>
          </div>)}
      </div>
    </li>
  );
}

export default function Feed({ me, nav }: { me: Profile; nav: Nav }) {
  const [posts, setPosts] = useState<PostRow[]>([]), [liked, setLiked] = useState<Set<string>>(new Set());
  const [state, setState] = useState<"loading" | "ready" | "error">("loading"), [more, setMore] = useState(false);
  const [draft, setDraft] = useState(""), [posting, setPosting] = useState(false), [err, setErr] = useState<string | null>(null);
  const load = useCallback(async (from: number) => {
    const { data, error } = await supabase.from("posts").select("id,body,created_at,author_id,author:profiles(*),post_likes(count),comments(count)").order("created_at", { ascending: false }).range(from, from + PAGE - 1);
    if (error) return setState("error");
    const list = (data ?? []) as unknown as PostRow[];
    if (list.length) {
      const { data: l } = await supabase.from("post_likes").select("post_id").eq("user_id", me.id).in("post_id", list.map((p) => p.id));
      setLiked((s) => new Set([...s, ...(l ?? []).map((x) => x.post_id as string)]));
    }
    setPosts((p) => (from === 0 ? list : [...p, ...list])); setMore(list.length === PAGE); setState("ready");
  }, [me.id]);
  useEffect(() => { load(0); }, [load]);

  async function publish() {
    const body = draft.trim(); if (!body || posting) return;
    setPosting(true); setErr(null);
    const { data, error } = await supabase.from("posts").insert({ body }).select("id,body,created_at,author_id,author:profiles(*),post_likes(count),comments(count)").single();
    setPosting(false);
    if (error || !data) return setErr("Не удалось опубликовать. Попробуйте ещё раз.");
    setPosts((p) => [data as unknown as PostRow, ...p]); setDraft("");
  }
  return (
    <div className="col">
      <header className="topbar"><h2>Feed</h2></header>
      <div className="compose">
        <Avatar name={me.display_name} size={42} path={me.avatar_path} />
        <div className="stack">
          <textarea value={draft} maxLength={500} rows={2} placeholder="Что нового?" aria-label="Новая публикация" onChange={(e) => setDraft(e.target.value)} />
          {err && <p className="err small" role="alert">{err}</p>}
          <div className="row end"><span className="dim small cnt">{draft.length}/500</span><button className="btn primary" onClick={publish} disabled={!draft.trim() || posting}>{posting ? "Публикую…" : "Опубликовать"}</button></div>
        </div>
      </div>
      {state === "loading" && <div className="skel" />}
      {state === "error" && <div className="empty-in"><p className="err">Не удалось загрузить ленту.</p><button className="btn" onClick={() => { setState("loading"); load(0); }}>Повторить</button></div>}
      {state === "ready" && !posts.length && <div className="empty-in"><h2>Здесь пока тихо</h2><p className="muted">Опубликуйте первую запись.</p></div>}
      <ul className="posts">{posts.map((p) => <PostCard key={p.id} post={p} liked0={liked.has(p.id)} me={me} nav={nav} onDelete={(id) => setPosts((l) => l.filter((x) => x.id !== id))} />)}</ul>
      {more && <button className="btn center" onClick={() => load(posts.length)}>Показать ещё</button>}
    </div>
  );
}
