import { useCallback, useEffect, useState, type FormEvent } from "react";
import { MessageSquare, Rss, Search, User, LogOut, Pencil, Snowflake, Moon } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type Profile } from "./supabase";
import Auth, { Wordmark } from "./Auth";
import { applyTheme, getTheme, type Theme } from "./theme";

type Tab = "chats" | "feed" | "explore" | "profile";
const TABS: { id: Tab; label: string; Icon: typeof User; hint: string }[] = [
  { id: "chats", label: "Chats", Icon: MessageSquare, hint: "Личные переписки появятся здесь." },
  { id: "feed", label: "Feed", Icon: Rss, hint: "Лента публикаций появится здесь." },
  { id: "explore", label: "Explore", Icon: Search, hint: "Поиск людей появится здесь." },
  { id: "profile", label: "Profile", Icon: User, hint: "" },
];

export const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
export const Avatar = ({ name, size = 40 }: { name: string; size?: number }) =>
  <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>{initials(name)}</span>;
const fmt = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (!ready) return <div className="boot"><Wordmark big /></div>;
  return session ? <Shell session={session} /> : <Auth />;
}

function ThemeSwitch() {
  const [t, setT] = useState<Theme>(getTheme);
  const pick = (next: Theme) => { if (next !== t) { applyTheme(next, true); setT(next); } };
  return (
    <div className="seg" role="radiogroup" aria-label="Тема оформления">
      <button role="radio" aria-checked={t === "cold"} className={t === "cold" ? "on" : ""} onClick={() => pick("cold")}><Snowflake size={15} strokeWidth={1.75} />Cold</button>
      <button role="radio" aria-checked={t === "halloween"} className={t === "halloween" ? "on" : ""} onClick={() => pick("halloween")}><Moon size={15} strokeWidth={1.75} />Halloween <em>EVENT</em></button>
    </div>
  );
}

function Shell({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>("chats");
  const [me, setMe] = useState<Profile | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", session.user.id).single()
      .then(({ data, error }) => { if (error) setLoadErr(true); else setMe(data as Profile); });
  }, [session.user.id]);

  if (loadErr) return <div className="boot"><p className="err">Не удалось загрузить профиль.</p><button className="btn" onClick={() => supabase.auth.signOut()}>Выйти</button></div>;
  if (!me) return <div className="boot"><Wordmark big /></div>;

  const cur = TABS.find((t) => t.id === tab)!;
  return (
    <div className="shell">
      <nav className="nav" aria-label="Разделы">
        <div className="nav-brand"><Wordmark /></div>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} className={"nav-item" + (tab === id ? " on" : "")} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}>
            <Icon size={19} strokeWidth={1.75} /><span>{label}</span>
          </button>
        ))}
        <div className="nav-foot">
          <div className="only-wide"><ThemeSwitch /></div>
          <button className="nav-me" onClick={() => setTab("profile")}><Avatar name={me.display_name} size={30} /><span>@{me.username}</span></button>
        </div>
      </nav>
      <main className="view">
        {tab === "profile" ? <ProfilePage profile={me} isOwn onSaved={setMe} />
          : <div className="empty"><h2>{cur.label}</h2><p className="muted">{cur.hint}</p></div>}
      </main>
    </div>
  );
}

type Post = { id: string; body: string; created_at: string };
const PAGE = 20;

function ProfilePosts({ profile }: { profile: Profile }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [more, setMore] = useState(false);
  const load = useCallback(async (from: number) => {
    const { data, error } = await supabase.from("posts").select("id, body, created_at")
      .eq("author_id", profile.id).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
    if (error) return setState("error");
    setPosts((p) => (from === 0 ? data : [...p, ...data]) as Post[]);
    setMore(data.length === PAGE); setState("ready");
  }, [profile.id]);
  useEffect(() => { setState("loading"); setPosts([]); load(0); }, [load]);

  if (state === "loading") return <div className="skel" aria-label="Загрузка" />;
  if (state === "error") return <div className="empty-in"><p className="err">Не удалось загрузить публикации.</p><button className="btn" onClick={() => { setState("loading"); load(0); }}>Повторить</button></div>;
  if (!posts.length) return <div className="empty-in"><h2>Здесь пока тихо</h2><p className="muted">Публикации появятся здесь.</p></div>;
  return (
    <>
      <ul className="posts">
        {posts.map((p) => (
          <li key={p.id} className="post">
            <Avatar name={profile.display_name} size={40} />
            <div className="post-main">
              <p className="post-meta"><strong>{profile.display_name}</strong><span className="muted">@{profile.username}</span><time className="dim" dateTime={p.created_at}>{fmt(p.created_at)}</time></p>
              <p className="post-body">{p.body}</p>
            </div>
          </li>
        ))}
      </ul>
      {more && <button className="btn center" onClick={() => load(posts.length)}>Показать ещё</button>}
    </>
  );
}

function ProfilePage({ profile, isOwn, onSaved }: { profile: Profile; isOwn: boolean; onSaved?: (p: Profile) => void }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ display_name: profile.display_name, username: profile.username, bio: profile.bio });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = () => { setF({ display_name: profile.display_name, username: profile.username, bio: profile.bio }); setErr(null); setEditing(true); };
  async function save(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const username = f.username.trim().toLowerCase(), display_name = f.display_name.trim();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return setErr("Username: 3–20 символов, a–z, 0–9 и _.");
    if (!display_name) return setErr("Введите отображаемое имя.");
    setBusy(true);
    const { data, error } = await supabase.from("profiles").update({ username, display_name, bio: f.bio.trim() }).eq("id", profile.id).select().single();
    setBusy(false);
    if (error) return setErr(error.code === "23505" ? "Этот username уже занят." : "Не удалось сохранить. Попробуйте ещё раз.");
    onSaved?.(data as Profile); setEditing(false);
  }

  return (
    <article className="profile">
      <div className="cover" aria-hidden />
      <header className="p-head">
        <div className="p-avatar"><Avatar name={profile.display_name} size={112} /></div>
        {isOwn && !editing && <button className="btn p-edit" onClick={start}><Pencil size={15} strokeWidth={1.75} />Редактировать профиль</button>}
        {editing ? (
          <form onSubmit={save} className="stack p-form">
            <label>Отображаемое имя<input value={f.display_name} maxLength={40} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></label>
            <label>Username<input value={f.username} maxLength={20} autoCapitalize="none" spellCheck={false} onChange={(e) => setF({ ...f, username: e.target.value })} /></label>
            <label>О себе<textarea value={f.bio} maxLength={200} rows={3} onChange={(e) => setF({ ...f, bio: e.target.value })} /></label>
            {err && <p className="err" role="alert">{err}</p>}
            <div className="row">
              <button className="btn primary" disabled={busy}>{busy ? "Сохраняю…" : "Сохранить"}</button>
              <button type="button" className="btn ghost" onClick={() => setEditing(false)} disabled={busy}>Отмена</button>
            </div>
          </form>
        ) : (
          <div className="p-info">
            <h1>{profile.display_name}</h1>
            <p className="p-user">@{profile.username}</p>
            {profile.bio && <p className="p-bio">{profile.bio}</p>}
            <p className="dim small">В сети с {new Date(profile.created_at).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}</p>
          </div>
        )}
      </header>
      <div className="tabs" role="tablist"><button role="tab" aria-selected className="tab on">Публикации</button></div>
      <section className="p-body"><ProfilePosts profile={profile} /></section>
      {isOwn && (
        <footer className="p-foot">
          <div className="not-wide"><p className="dim small">Оформление</p><ThemeSwitch /></div>
          <button className="btn ghost" onClick={() => supabase.auth.signOut()}><LogOut size={15} strokeWidth={1.75} />Выйти</button>
        </footer>
      )}
    </article>
  );
}
