import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { supabase, type Profile } from "./supabase";
import { Avatar, type Nav } from "./ui";

export default function Explore({ me, nav }: { me: Profile; nav: Nav }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Profile[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const seq = useRef(0);
  useEffect(() => {
    const id = ++seq.current;
    setState("loading");
    const t = window.setTimeout(async () => {
      const clean = q.replace(/[%,()*\\]/g, " ").trim();
      let req = supabase.from("profiles").select("*").neq("id", me.id).limit(30);
      req = clean ? req.or(`username.ilike.%${clean}%,display_name.ilike.%${clean}%`).order("display_name") : req.order("created_at", { ascending: false });
      const { data, error } = await req;
      if (id !== seq.current) return;
      if (error) return setState("error");
      setRes((data ?? []) as Profile[]); setState("ready");
    }, 280);
    return () => clearTimeout(t);
  }, [q, me.id]);
  return (
    <div className="col">
      <header className="topbar"><h2>Поиск</h2></header>
      <div className="search"><Search size={16} strokeWidth={1.75} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя или username" aria-label="Поиск людей" autoCapitalize="none" /></div>
      {state === "loading" && <div className="skel" />}
      {state === "error" && <div className="empty-in"><p className="err">Не удалось выполнить поиск.</p></div>}
      {state === "ready" && !res.length && <div className="empty-in"><p className="muted">{q.trim() ? "Никого не найдено." : "Пока здесь только вы."}</p></div>}
      {state === "ready" && <ul className="chat-list">{res.map((p) => (
        <li key={p.id}><button className="chat-row" onClick={() => nav.goProfile(p)}>
          <Avatar name={p.display_name} size={46} path={p.avatar_path} uid={p.id} />
          <span className="cr-main"><strong>{p.display_name}</strong><span className="muted small">@{p.username}</span></span>
        </button></li>))}</ul>}
    </div>
  );
}
