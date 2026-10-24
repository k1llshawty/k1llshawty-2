import { useCallback, useContext, useEffect, useMemo, useState, type FormEvent } from "react";
import { MessageSquare, Rss, Search, User, LogOut, Pencil, Camera, Circle, Snowflake, Ghost, Info, Calendar, Palette, Lock, ArrowLeft, MessageCircle, ShieldCheck } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type Profile } from "./supabase";
import Auth, { Wordmark } from "./Auth";
import { applyTheme } from "./theme";
import { useSignedUrl } from "./media";
import ImageEditor from "./ImageEditor";
import Chats from "./Chats";
import Explore from "./Explore";
import Feed from "./Feed";
import Admin from "./Admin";
import { Avatar, Badges, OnlineContext, fmtDateTime, lastSeenText, signOutClean, useBadges, type Nav, type Tab } from "./ui";

const TABS: { id: Tab; label: string; Icon: typeof User }[] = [
  { id: "chats", label: "Чаты", Icon: MessageSquare }, { id: "feed", label: "Лента", Icon: Rss },
  { id: "explore", label: "Поиск", Icon: Search }, { id: "profile", label: "Профиль", Icon: User },
];

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

const ADMIN_TAB = { id: "admin" as Tab, label: "Админ", Icon: ShieldCheck };
const THEMES = [
  { id: "default", label: "По умолчанию", Icon: Circle, locked: false },
  { id: "winter", label: "Зима", Icon: Snowflake, locked: true },
  { id: "halloween", label: "Хэллоуин", Icon: Ghost, locked: true },
];
function ThemeSwitch({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(false);
  const soon = () => { setToast(true); window.setTimeout(() => setToast(false), 2200); };
  return (
    <div className="menu-wrap" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      {compact
        ? <button className="icon-btn" title="Оформление" aria-label="Оформление" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}><Palette size={20} strokeWidth={1.75} /></button>
        : <button className="btn menu-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}><Circle size={15} strokeWidth={1.75} />По умолчанию</button>}
      {open && <ul className={"menu" + (compact ? " side" : "")} role="listbox" aria-label="Оформление">
        {THEMES.map(({ id, label, Icon, locked }) => (
          <li key={id}><button role="option" aria-selected={!locked} aria-disabled={locked} className={locked ? "locked" : "on"} onClick={() => (locked ? soon() : (applyTheme("default", true), setOpen(false)))}>
            <Icon size={15} strokeWidth={1.75} /><span>{label}</span>{locked && <><Lock size={13} strokeWidth={1.75} /><small>В разработке</small></>}
          </button></li>))}
      </ul>}
      {toast && <div className="toast" role="status">Тема пока в разработке</div>}
    </div>);
}

function Shell({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>("chats");
  const [me, setMe] = useState<Profile | null>(null);
  const [viewing, setViewing] = useState<Profile | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [longBio, setLongBio] = useState(false);
  useEffect(() => {
    // Роль берётся из базы (RLS отдаёт строку только самому администратору); интерфейс лишь отражает её
    supabase.from("admins").select("user_id").eq("user_id", session.user.id).maybeSingle().then(({ data }) => setIsAdmin(!!data));
    supabase.from("user_perks").select("long_bio").eq("user_id", session.user.id).maybeSingle().then(({ data }) => setLongBio(!!data?.long_bio));
  }, [session.user.id]);
  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", session.user.id).single()
      .then(({ data, error }) => { if (error) setLoadErr(true); else setMe(data as Profile); });
  }, [session.user.id]);

  const [online, setOnline] = useState<Set<string>>(new Set());
  // Один общий приватный канал присутствия на всё приложение; ключ — id пользователя
  useEffect(() => {
    const ch = supabase.channel("presence:app", { config: { private: true, presence: { key: session.user.id } } });
    let last = 0;
    const touch = (force = false) => {
      if (!force && Date.now() - last < 120_000) return;
      last = Date.now();
      supabase.rpc("touch_last_seen").then(({ error }) => { if (error) console.error("touch_last_seen:", error); });
    };
    const sync = () => setOnline(new Set(Object.keys(ch.presenceState())));
    ch.on("presence", { event: "sync" }, sync).on("presence", { event: "join" }, sync).on("presence", { event: "leave" }, sync)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") { await ch.track({ at: Date.now() }); touch(true); }
        else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") setOnline(new Set());
      });
    // Время визита пишем не чаще раза в 2 минуты, а также при скрытии страницы
    const iv = window.setInterval(() => { if (!document.hidden) touch(); }, 120_000);
    const vis = () => touch(document.hidden);
    const hide = () => touch(true);
    document.addEventListener("visibilitychange", vis); window.addEventListener("pagehide", hide);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", vis); window.removeEventListener("pagehide", hide); setOnline(new Set()); supabase.removeChannel(ch); };
  }, [session.user.id]);

  const startChat = useCallback(async (userId: string) => {
    const { data, error } = await supabase.rpc("start_direct_chat", { other: userId });
    if (error || !data) return false;
    setChatId(data as string); setViewing(null); setTab("chats");
    return true;
  }, []);
  const nav: Nav = useMemo(() => ({
    goProfile: (p) => setViewing(p), startChat, goTab: (t) => { setViewing(null); setTab(t); },
  }), [startChat]);

  if (loadErr) return <div className="boot"><p className="err">Не удалось загрузить профиль.</p><button className="btn" onClick={() => supabase.auth.signOut()}>Выйти</button></div>;
  if (!me) return <div className="boot"><Wordmark big /></div>;

  const tabs = isAdmin ? [...TABS, ADMIN_TAB] : TABS;
  const chatOpen = tab === "chats" && !!chatId && !viewing;
  let main;
  if (viewing && viewing.id !== me.id) main = <ProfilePage key={viewing.id} profile={viewing} isOwn={false} nav={nav} onBack={() => setViewing(null)} />;
  else if (viewing || tab === "profile") main = <ProfilePage profile={me} isOwn nav={nav} onSaved={setMe} bioMax={longBio ? 1000 : 200} onBack={viewing ? () => setViewing(null) : undefined} />;
  else if (tab === "chats") main = <Chats me={me} chatId={chatId} setChatId={setChatId} nav={nav} />;
  else if (tab === "admin" && isAdmin) main = <Admin />;
  else if (tab === "feed") main = <Feed me={me} nav={nav} />;
  else main = <Explore me={me} nav={nav} />;

  return (
    <OnlineContext.Provider value={online}>
    <div className={"shell" + (chatOpen ? " chat-open" : "")}>
      <nav className="rail" aria-label="Разделы">
        <div className="rail-brand" title="k1llshawty.exe">k1</div>
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} title={id === "admin" ? "Администрирование" : undefined} aria-label={id === "admin" ? "Администрирование" : undefined} className={"rail-item" + (tab === id && !viewing ? " on" : "")} onClick={() => nav.goTab(id)} aria-current={tab === id && !viewing ? "page" : undefined}>
            {id === "profile" ? <Avatar name={me.display_name} size={26} path={me.avatar_path} /> : <Icon size={22} strokeWidth={1.75} />}<span>{label}</span>
          </button>))}
        <div className="rail-foot only-wide"><ThemeSwitch compact /></div>
      </nav>
      <main className={"view" + (tab === "chats" && !viewing ? " flush" : "")}>{main}</main>
    </div>
    </OnlineContext.Provider>
  );
}

type Post = { id: string; body: string; created_at: string };
const PAGE = 20;
function ProfilePosts({ profile }: { profile: Profile }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [more, setMore] = useState(false);
  const load = useCallback(async (from: number) => {
    const { data, error } = await supabase.from("posts").select("id, body, created_at").eq("author_id", profile.id).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
    if (error) return setState("error");
    setPosts((p) => (from === 0 ? data : [...p, ...data]) as Post[]); setMore(data.length === PAGE); setState("ready");
  }, [profile.id]);
  useEffect(() => { setState("loading"); setPosts([]); load(0); }, [load]);
  if (state === "loading") return <div className="skel" aria-label="Загрузка" />;
  if (state === "error") return <div className="empty-in"><p className="err">Не удалось загрузить публикации.</p><button className="btn" onClick={() => { setState("loading"); load(0); }}>Повторить</button></div>;
  if (!posts.length) return <div className="empty-in"><h2>Здесь пока тихо</h2><p className="muted">Публикации появятся здесь.</p></div>;
  return (<>
    <ul className="posts">{posts.map((p) => (
      <li key={p.id} className="pcard"><Avatar name={profile.display_name} size={42} path={profile.avatar_path} />
        <div className="pc-main"><p className="post-meta"><strong>{profile.display_name}</strong><span className="muted">@{profile.username}</span><time className="dim">{fmtDateTime(p.created_at)}</time></p><p className="post-body">{p.body}</p></div></li>))}</ul>
    {more && <button className="btn center" onClick={() => load(posts.length)}>Показать ещё</button>}
  </>);
}

function Cover({ profile, isOwn, onEdit, onBack }: { profile: Profile; isOwn: boolean; onEdit: () => void; onBack?: () => void }) {
  const url = useSignedUrl(profile.cover_path);
  const l = profile.cover_path ? "Изменить обложку" : "Добавить обложку";
  return (
    <div className="cover">
      {url && <img className="cover-img" src={url} alt="" />}
      {onBack && <button className="icon-btn cover-btn left" onClick={onBack} aria-label="Назад"><ArrowLeft size={18} strokeWidth={1.75} /></button>}
      {isOwn && <button className="icon-btn cover-btn" onClick={onEdit} title={l} aria-label={l}><Camera size={18} strokeWidth={1.75} /></button>}
    </div>);
}

function ProfilePage({ profile, isOwn, nav, onSaved, onBack, bioMax = 200 }: { profile: Profile; isOwn: boolean; nav: Nav; onSaved?: (p: Profile) => void; onBack?: () => void; bioMax?: number }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ display_name: profile.display_name, username: profile.username, bio: profile.bio });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editor, setEditor] = useState<"avatar" | "cover" | null>(null);
  const [opening, setOpening] = useState(false);
  const isOnline = useContext(OnlineContext).has(profile.id);
  const [seen, setSeen] = useState(profile.last_seen_at);
  const badges = useBadges(profile.id);
  useEffect(() => {
    setSeen(profile.last_seen_at);
    if (isOwn || isOnline) return;
    supabase.from("profiles").select("last_seen_at").eq("id", profile.id).single().then(({ data }) => { if (data) setSeen(data.last_seen_at as string | null); });
  }, [profile.id, profile.last_seen_at, isOwn, isOnline]);

  const start = () => { setF({ display_name: profile.display_name, username: profile.username, bio: profile.bio }); setErr(null); setEditing(true); };
  async function write() {
    setOpening(true); setErr(null);
    const ok = await nav.startChat(profile.id);
    if (!ok) { setOpening(false); setErr("Не удалось открыть переписку. Попробуйте ещё раз."); }
  }
  async function save(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const username = f.username.trim().toLowerCase(), display_name = f.display_name.trim();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return setErr("Имя пользователя: 3–20 символов, a–z, 0–9 и _.");
    if (!display_name) return setErr("Введите отображаемое имя.");
    setBusy(true);
    const { data, error } = await supabase.from("profiles").update({ username, display_name, bio: f.bio.trim() }).eq("id", profile.id).select().single();
    setBusy(false);
    if (error) return setErr(error.code === "23505" ? "Это имя пользователя уже занято." : error.message?.includes("bio_too_long") ? "Описание слишком длинное: для вашего аккаунта лимит — 200 символов." : "Не удалось сохранить. Попробуйте ещё раз.");
    onSaved?.(data as Profile); setEditing(false);
  }
  const status = isOnline ? "В сети" : seen ? lastSeenText(seen) : "Не в сети";

  return (
    <article className="profile">
      <Cover profile={profile} isOwn={isOwn} onEdit={() => setEditor("cover")} onBack={onBack} />
      <header className="p-head">
        <div className="p-avatar">
          {isOwn ? <button className="av-btn" onClick={() => setEditor("avatar")} aria-label="Изменить аватар"><Avatar name={profile.display_name} size={96} path={profile.avatar_path} /><span className="av-cam"><Camera size={20} strokeWidth={1.75} /></span></button>
            : <Avatar name={profile.display_name} size={96} path={profile.avatar_path} uid={profile.id} />}
        </div>
        {editing ? (
          <form onSubmit={save} className="stack p-form">
            <label>Отображаемое имя<input value={f.display_name} maxLength={40} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></label>
            <label>Имя пользователя<input value={f.username} maxLength={20} autoCapitalize="none" spellCheck={false} onChange={(e) => setF({ ...f, username: e.target.value })} /></label>
            <label>О себе <span className="dim">{f.bio.length}/{bioMax}</span><textarea value={f.bio} maxLength={bioMax} rows={bioMax > 200 ? 6 : 3} onChange={(e) => setF({ ...f, bio: e.target.value })} /></label>
            {err && <p className="err" role="alert">{err}</p>}
            <div className="row">
              <button className="btn primary" disabled={busy}>{busy ? "Сохраняю…" : "Сохранить"}</button>
              <button type="button" className="btn ghost" onClick={() => setEditing(false)} disabled={busy}>Отмена</button>
            </div>
          </form>
        ) : (<>
          <div className="p-info">
            <h1>{profile.display_name}</h1>
            <p className="p-user">@{profile.username}</p>
            {!isOwn && <p className={"small " + (isOnline ? "on-txt" : "dim")}>{status}</p>}
            <Badges list={badges} />
          </div>
          {err && <p className="err center-t" role="alert">{err}</p>}
          <div className="p-actions">
            {isOwn ? <button className="btn" onClick={start}><Pencil size={15} strokeWidth={1.75} />Редактировать профиль</button>
              : <button className="btn primary" onClick={write} disabled={opening}><MessageCircle size={15} strokeWidth={1.75} />{opening ? "Открываю…" : "Написать"}</button>}
          </div>
          <ul className="info">
            {profile.bio && <li><Info size={20} strokeWidth={1.5} /><div><p className="p-bio">{profile.bio}</p><span>О себе</span></div></li>}
            <li><Calendar size={20} strokeWidth={1.5} /><div><p>{new Date(profile.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</p><span>Аккаунт создан</span></div></li>
          </ul>
        </>)}
      </header>
      <div className="tabs" role="tablist"><button role="tab" aria-selected className="tab on">Публикации</button></div>
      <section className="p-body"><ProfilePosts profile={profile} /></section>
      {isOwn && (
        <footer className="p-foot">
          <div className="not-wide"><ThemeSwitch /></div>
          <button className="btn" onClick={() => signOutClean()}><LogOut size={15} strokeWidth={1.75} />Выйти</button>
        </footer>)}
      {editor && <ImageEditor kind={editor} profile={profile} onClose={() => setEditor(null)} onSaved={(p) => onSaved?.(p)} />}
    </article>
  );
}
