import { useEffect, useState, type FormEvent } from "react";
import { MessageSquare, Rss, Search, User, LogOut, Check } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type Profile } from "./supabase";
import Auth, { Wordmark } from "./Auth";

type Tab = "chats" | "feed" | "explore" | "profile";
const TABS: { id: Tab; label: string; Icon: typeof User }[] = [
  { id: "chats", label: "Chats", Icon: MessageSquare }, { id: "feed", label: "Feed", Icon: Rss },
  { id: "explore", label: "Explore", Icon: Search }, { id: "profile", label: "Profile", Icon: User },
];

export const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
export const Avatar = ({ name, size = 40 }: { name: string; size?: number }) =>
  <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>{initials(name)}</span>;

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

  return (
    <div className="shell">
      <nav className="nav" aria-label="Разделы">
        <div className="nav-brand"><Wordmark /></div>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} className={"nav-item" + (tab === id ? " on" : "")} onClick={() => setTab(id)} aria-current={tab === id}>
            <Icon size={20} strokeWidth={1.75} /><span>{label}</span>
          </button>
        ))}
        <div className="nav-me"><Avatar name={me.display_name} size={32} /><span>@{me.username}</span></div>
      </nav>
      <main className="view">
        {tab === "profile" ? <ProfileView me={me} onSaved={setMe} />
          : <div className="empty"><h2>{TABS.find((t) => t.id === tab)!.label}</h2><p className="muted">Этот раздел будет собран на следующем этапе.</p></div>}
      </main>
    </div>
  );
}

function ProfileView({ me, onSaved }: { me: Profile; onSaved: (p: Profile) => void }) {
  const [f, setF] = useState({ display_name: me.display_name, username: me.username, bio: me.bio });
  const [state, setState] = useState<"idle" | "busy" | "saved">("idle");
  const [err, setErr] = useState<string | null>(null);
  const dirty = f.display_name !== me.display_name || f.username !== me.username || f.bio !== me.bio;

  async function save(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const username = f.username.trim().toLowerCase(), display_name = f.display_name.trim();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return setErr("Username: 3–20 символов, a–z, 0–9 и _.");
    if (!display_name) return setErr("Введите отображаемое имя.");
    setState("busy");
    const { data, error } = await supabase.from("profiles").update({ username, display_name, bio: f.bio.trim() }).eq("id", me.id).select().single();
    if (error) { setState("idle"); return setErr(error.code === "23505" ? "Этот username уже занят." : "Не удалось сохранить. Попробуйте ещё раз."); }
    onSaved(data as Profile); setF({ display_name, username, bio: f.bio.trim() }); setState("saved");
    setTimeout(() => setState("idle"), 1800);
  }

  return (
    <section className="page">
      <header className="profile-head">
        <Avatar name={f.display_name || me.display_name} size={72} />
        <div><h1>{me.display_name}</h1><p className="muted">@{me.username} · с {new Date(me.created_at).toLocaleDateString("ru-RU")}</p></div>
      </header>
      <form onSubmit={save} className="stack">
        <label>Отображаемое имя<input value={f.display_name} maxLength={40} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></label>
        <label>Username<input value={f.username} maxLength={20} autoCapitalize="none" spellCheck={false} onChange={(e) => setF({ ...f, username: e.target.value })} /></label>
        <label>О себе<textarea value={f.bio} maxLength={200} rows={3} onChange={(e) => setF({ ...f, bio: e.target.value })} /></label>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row">
          <button className="btn primary" disabled={!dirty || state === "busy"}>{state === "busy" ? "Сохраняю…" : state === "saved" ? <><Check size={16} /> Сохранено</> : "Сохранить"}</button>
          <button type="button" className="btn" onClick={() => supabase.auth.signOut()}><LogOut size={16} /> Выйти</button>
        </div>
      </form>
    </section>
  );
}
