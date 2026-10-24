import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, MessageSquare, Search, SendHorizontal } from "lucide-react";
import { supabase, type Profile } from "./supabase";
import { Avatar, Badges, OnlineContext, fmtChatTime, fmtClock, lastSeenText, useBadges, type Nav } from "./ui";

type Row = { conversation_id: string; other_id: string; last_body: string | null; last_at: string | null; last_sender: string | null; unread: number };
type Msg = { id: number; conversation_id: string; sender_id: string; body: string; created_at: string };
const PAGE = 40;

export default function Chats({ me, chatId, setChatId, nav }: { me: Profile; chatId: string | null; setChatId: (id: string | null) => void; nav: Nav }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [peers, setPeers] = useState<Record<string, Profile>>({});
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [msgState, setMsgState] = useState<"loading" | "ready" | "error">("loading");
  const [older, setOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const openRef = useRef(chatId), peersRef = useRef(peers), timer = useRef(0);
  const box = useRef<HTMLDivElement>(null), ta = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true), prevH = useRef<number | null>(null);
  const baseId = useRef(0), online = useContext(OnlineContext);
  openRef.current = chatId; peersRef.current = peers;

  const loadList = useCallback(async () => {
    const { data, error } = await supabase.rpc("my_chats");
    if (error) return setListState("error");
    const list = (data ?? []) as Row[];
    const missing = list.map((r) => r.other_id).filter((id) => !peersRef.current[id]);
    if (missing.length) {
      const { data: ps } = await supabase.from("profiles").select("*").in("id", missing);
      if (ps) setPeers((p) => ({ ...p, ...Object.fromEntries((ps as Profile[]).map((x) => [x.id, x])) }));
    }
    setRows(list); setListState("ready");
  }, []);
  const refreshSoon = useCallback(() => { clearTimeout(timer.current); timer.current = window.setTimeout(loadList, 300); }, [loadList]);
  // Прочтение хранится на сервере (conversation_members.last_read_at), счётчик берётся из базы
  const markRead = useCallback((cid: string) => {
    if (document.hidden) return;
    supabase.rpc("mark_chat_read", { p_cid: cid }).then(({ error }) => { if (error) console.error("mark_chat_read:", error); refreshSoon(); });
  }, [refreshSoon]);
  useEffect(() => {
    const v = () => { if (!document.hidden && openRef.current) markRead(openRef.current); };
    document.addEventListener("visibilitychange", v);
    return () => document.removeEventListener("visibilitychange", v);
  }, [markRead]);

  useEffect(() => { loadList(); }, [loadList]);
  // Одна Realtime-подписка живёт, пока открыт раздел «Чаты», и снимается при уходе
  useEffect(() => {
    const ch = supabase.channel("msgs-" + me.id).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
      const m = payload.new as Msg;
      if (m.conversation_id === openRef.current) {
        setMsgs((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));
        if (m.sender_id !== me.id) markRead(m.conversation_id);
      }
      refreshSoon();
    }).subscribe();
    return () => { clearTimeout(timer.current); supabase.removeChannel(ch); };
  }, [me.id, markRead, refreshSoon]);

  useEffect(() => {
    setDraft(""); setSendErr(null); setMsgs([]); setOlder(false);
    if (!chatId) return;
    let dead = false; atBottom.current = true; setMsgState("loading");
    if (!rows.some((r) => r.conversation_id === chatId)) loadList();
    supabase.from("messages").select("*").eq("conversation_id", chatId).order("created_at", { ascending: false }).limit(PAGE).then(({ data, error }) => {
      if (dead) return;
      if (error) return setMsgState("error");
      const list = ((data ?? []) as Msg[]).reverse();
      baseId.current = list.length ? list[list.length - 1].id : 0;
      setMsgs(list); setOlder((data ?? []).length === PAGE); setMsgState("ready");
      markRead(chatId);
    });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    if (prevH.current !== null) { el.scrollTop = el.scrollHeight - prevH.current; prevH.current = null; }
    else if (atBottom.current) el.scrollTop = el.scrollHeight;
  }, [msgs, msgState]);
  useEffect(() => { const el = ta.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 140) + "px"; } }, [draft]);

  async function loadOlder() {
    if (!chatId || !msgs.length) return;
    const { data, error } = await supabase.from("messages").select("*").eq("conversation_id", chatId).lt("created_at", msgs[0].created_at).order("created_at", { ascending: false }).limit(PAGE);
    if (error) return;
    prevH.current = box.current?.scrollHeight ?? 0;
    setMsgs((p) => [...((data ?? []) as Msg[]).reverse(), ...p]); setOlder((data ?? []).length === PAGE);
  }
  async function send() {
    const body = draft.trim();
    if (!body || sending || !chatId) return;
    setSending(true); setSendErr(null);
    const { data, error } = await supabase.from("messages").insert({ conversation_id: chatId, body }).select().single();
    setSending(false);
    if (error || !data) return setSendErr("Не удалось отправить. Проверьте соединение и повторите.");
    atBottom.current = true;
    setMsgs((p) => (p.some((x) => x.id === data.id) ? p : [...p, data as Msg])); setDraft(""); refreshSoon();
  }

  const row = rows.find((r) => r.conversation_id === chatId), peer = row ? peers[row.other_id] : undefined;
  const peerBadges = useBadges(peer?.id);
  const peerId = row?.other_id, peerOn = peerId ? online.has(peerId) : false;
  // Свежее время последнего визита подтягиваем при открытии чата и когда собеседник выходит из сети
  useEffect(() => {
    if (!peerId || peerOn) return;
    supabase.from("profiles").select("*").eq("id", peerId).single().then(({ data }) => { if (data) setPeers((p) => ({ ...p, [peerId]: data as Profile })); });
  }, [peerId, peerOn]);
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => { const p = peers[r.other_id]; return !needle || `${p?.display_name} ${p?.username} ${r.last_body ?? ""}`.toLowerCase().includes(needle); });

  return (
    <div className={"split" + (chatId ? " open" : "")}>
      <aside className="list-pane">
        <header className="topbar"><h2>Чаты</h2></header>
        <div className="search"><Search size={16} strokeWidth={1.75} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по перепискам" aria-label="Поиск по перепискам" /></div>
        {listState === "loading" && <div className="skel" />}
        {listState === "error" && <div className="empty-in"><p className="err">Не удалось загрузить чаты.</p><button className="btn" onClick={() => { setListState("loading"); loadList(); }}>Повторить</button></div>}
        {listState === "ready" && !rows.length && <div className="empty-in"><MessageSquare size={34} strokeWidth={1.4} className="dim" /><p className="muted">Пока нет переписок.</p><button className="btn" onClick={() => nav.goTab("explore")}>Найти людей</button></div>}
        {listState === "ready" && !!rows.length && !shown.length && <div className="empty-in"><p className="muted">Ничего не найдено.</p></div>}
        <ul className="chat-list">
          {shown.map((r) => { const p = peers[r.other_id]; return (
            <li key={r.conversation_id}>
              <button className={"chat-row" + (r.conversation_id === chatId ? " on" : "")} onClick={() => setChatId(r.conversation_id)}>
                <Avatar name={p?.display_name ?? "?"} size={48} path={p?.avatar_path} uid={p?.id} />
                <span className="cr-main">
                  <span className="cr-top"><strong>{p?.display_name ?? "…"}</strong>{r.last_at && <time className="dim">{fmtChatTime(r.last_at)}</time>}</span>
                  <span className="cr-bot"><span className="cr-prev muted">{r.last_body ? (r.last_sender === me.id ? "Вы: " : "") + r.last_body : "Нет сообщений"}</span>{r.unread > 0 && <b className="badge">{r.unread > 99 ? "99+" : r.unread}</b>}</span>
                </span>
              </button>
            </li>); })}
        </ul>
      </aside>
      <section className="chat-pane">
        {!chatId ? <div className="empty-in"><p className="dim">Выберите чат, чтобы начать переписку.</p></div> : (
          <>
            <header className="chat-head">
              <button className="icon-btn back" onClick={() => setChatId(null)} aria-label="К списку чатов"><ArrowLeft size={20} strokeWidth={1.75} /></button>
              <button className="ch-who" onClick={() => peer && nav.goProfile(peer)} disabled={!peer}>
                <Avatar name={peer?.display_name ?? "?"} size={40} path={peer?.avatar_path} uid={peer?.id} />
                <span className="cr-main"><span className="ch-name"><strong>{peer?.display_name ?? "…"}</strong><Badges list={peerBadges} max={2} compact /></span><span className={"small " + (peerOn ? "on-txt" : "dim")}>{peer ? (peerOn ? "В сети" : peer.last_seen_at ? lastSeenText(peer.last_seen_at) : "Не в сети") : ""}</span></span>
              </button>
            </header>
            <div className="msgs" ref={box} onScroll={(e) => { const t = e.currentTarget; atBottom.current = t.scrollHeight - t.scrollTop - t.clientHeight < 80; }}>
              {older && <button className="btn ghost older" onClick={loadOlder}>Показать ранее</button>}
              {msgState === "loading" && <p className="dim small center-t">Загрузка…</p>}
              {msgState === "error" && <div className="empty-in"><p className="err">Не удалось загрузить сообщения.</p></div>}
              {msgState === "ready" && !msgs.length && <p className="dim small center-t">Сообщений пока нет. Напишите первым.</p>}
              {msgs.map((m) => (
                <div key={m.id} className={"bubble " + (m.sender_id === me.id ? "out" : "in") + (m.id > baseId.current ? " fresh" : "")}><span>{m.body}</span><time>{fmtClock(m.created_at)}</time></div>
              ))}
            </div>
            <div className="composer-wrap">
              {sendErr && <p className="err small" role="alert">{sendErr}</p>}
              <div className="composer">
                <textarea ref={ta} rows={1} value={draft} maxLength={4000} placeholder="Сообщение" aria-label="Сообщение" onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
                <button className="send" onClick={send} disabled={!draft.trim() || sending} aria-label="Отправить"><SendHorizontal size={20} strokeWidth={1.75} /></button>
              </div>
            </div>
          </>)}
      </section>
    </div>
  );
}
