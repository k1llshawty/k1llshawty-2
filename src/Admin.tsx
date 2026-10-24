import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { supabase, type Profile } from "./supabase";
import { Avatar, fmtDateTime } from "./ui";
import { FlairMarks, invalidateCatalog, invalidateFlair } from "./emoji";

type Membership = { expires_at: string | null; granted_at: string };

function AdminUser({ user, onBack }: { user: Profile; onBack: () => void }) {
  const [m, setM] = useState<Membership | null>(null);
  const [active, setActive] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    const [a, f] = await Promise.all([
      supabase.from("premium_memberships").select("expires_at,granted_at").eq("user_id", user.id).maybeSingle(),
      supabase.rpc("user_flair", { p_ids: [user.id] }),
    ]);
    if (a.error || f.error) { console.error(a.error ?? f.error); return setState("error"); }
    setM((a.data as Membership | null) ?? null); setActive(((f.data as unknown[]) ?? []).length > 0); setState("ready");
  }, [user.id]);
  useEffect(() => { load(); }, [load]);

  async function run(job: PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true); setMsg(null);
    const { error } = await job;
    if (error) { console.error(error); setMsg({ ok: false, text: "Не удалось выполнить действие. Проверьте права и повторите." }); }
    else setMsg({ ok: true, text: ok });
    invalidateFlair(user.id); await load(); setBusy(false);
  }
  const grant = (days: number | null) => run(supabase.rpc("admin_grant_premium", { p_user: user.id, p_days: days }), days === null ? "Premium выдан бессрочно." : `Срок Premium увеличен на ${days} дн.`);
  const revoke = () => { if (window.confirm(`Отозвать Premium у @${user.username}?`)) run(supabase.rpc("admin_revoke_premium", { p_user: user.id }), "Premium отозван."); };
  const status = !m ? "Premium не выдан" : active ? (m.expires_at ? `Активен до ${fmtDateTime(m.expires_at)}` : "Активен бессрочно") : `Истёк ${m.expires_at ? fmtDateTime(m.expires_at) : ""}`;

  return (
    <>
      <header className="chat-head">
        <button className="icon-btn back" onClick={onBack} aria-label="Назад"><ArrowLeft size={20} strokeWidth={1.75} /></button>
        <div className="ch-who static"><Avatar name={user.display_name} size={40} path={user.avatar_path} />
          <span className="cr-main"><span className="ch-name"><strong>{user.display_name}</strong><FlairMarks uid={user.id} /></span><span className="dim small">@{user.username}</span></span></div>
      </header>
      <div className="adm-body">
        {state === "loading" && <div className="skel" />}
        {state === "error" && <p className="err">Не удалось загрузить данные. Проверьте, что выполнена миграция 0008.</p>}
        {state === "ready" && (
          <section><h2>k1llshawty Premium</h2>
            <p className={active ? "on-txt" : "muted"}>{status}</p>
            <p className="dim small">Срок добавляется к текущему, если Premium уже активен. Оплаты и автопродления нет: Premium выдаёт владелец.</p>
            <div className="row">
              <button className="btn" onClick={() => grant(30)} disabled={busy}>+30 дней</button>
              <button className="btn" onClick={() => grant(90)} disabled={busy}>+90 дней</button>
              <button className="btn" onClick={() => grant(null)} disabled={busy}>Бессрочно</button>
              <button className="btn ghost" onClick={revoke} disabled={busy || !m}>Отозвать</button>
            </div>
            {msg && <p className={msg.ok ? "on-txt small" : "err small"} role="status">{msg.text}</p>}
          </section>)}
      </div>
    </>);
}

function UsersView() {
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
        <div className="search"><Search size={16} strokeWidth={1.75} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по username" aria-label="Поиск пользователей" autoCapitalize="none" /></div>
        {state === "loading" && <div className="skel" />}
        {state === "error" && <div className="empty-in"><p className="err">Не удалось загрузить пользователей.</p></div>}
        {state === "ready" && !res.length && <div className="empty-in"><p className="muted">Никого не найдено.</p></div>}
        <ul className="chat-list">{res.map((p) => (
          <li key={p.id}><button className={"chat-row" + (sel?.id === p.id ? " on" : "")} onClick={() => setSel(p)}>
            <Avatar name={p.display_name} size={44} path={p.avatar_path} />
            <span className="cr-main"><span className="ch-name"><strong>{p.display_name}</strong><FlairMarks uid={p.id} /></span><span className="muted small">@{p.username}</span></span>
          </button></li>))}</ul>
      </aside>
      <section className="chat-pane">
        {sel ? <AdminUser key={sel.id} user={sel} onBack={() => setSel(null)} />
          : <div className="empty-in"><ShieldCheck size={34} strokeWidth={1.4} className="dim" /><p className="dim">Выберите пользователя, чтобы управлять Premium.</p></div>}
      </section>
    </div>);
}

// ── наборы эмодзи и стикеров ──
type PackRow = { id: string; title: string; kinds: string[]; premium_only: boolean; published: boolean; emoji_items: { count: number }[] };
type Staged = { blob: Blob; url: string; name: string };
const KIND_LABELS: Record<string, string> = { status: "Эмодзи ника", message: "Эмодзи в сообщениях", sticker: "Стикеры" };
const MAX_FILES = 60, MAX_SRC = 3 * 1024 * 1024;

const LIMIT = 500 * 1024; // bucket принимает до 512 КБ; небольшой запас
async function fit(file: File, maxSide: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  try {
    let side = maxSide;
    for (let attempt = 0; attempt < 6; attempt++) {
      const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      const to = (t: string, q?: number) => new Promise<Blob | null>((res) => c.toBlob(res, t, q));
      for (const q of [0.9, 0.75, 0.6, 0.45]) {
        const b = await to("image/webp", q);
        if (b && b.type === "image/webp" && b.size <= LIMIT) return b;
        if (b && b.type !== "image/webp") break; // браузер не умеет WebP: качество не поможет, уменьшаем размер
      }
      const png = await to("image/png");
      if (png && png.size <= LIMIT) return png;
      side = Math.round(side * 0.8);
    }
  } finally { bmp.close(); }
  throw new Error("too_big");
}

function PackManager() {
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [title, setTitle] = useState("");
  const [kinds, setKinds] = useState<Record<string, boolean>>({ status: true, message: false, sticker: false });
  const [premiumOnly, setPremiumOnly] = useState(false);
  const [publish, setPublish] = useState(true);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("emoji_packs").select("id,title,kinds,premium_only,published,emoji_items(count)").order("created_at", { ascending: false });
    if (error) { console.error(error); return setState("error"); }
    setPacks((data ?? []) as unknown as PackRow[]); setState("ready");
  }, []);
  useEffect(() => { load(); }, [load]);
  // Адреса превью освобождаются при удалении файла, после создания набора и при закрытии раздела (но не при каждом изменении списка)
  const stagedRef = useRef<Staged[]>([]);
  stagedRef.current = staged;
  useEffect(() => () => stagedRef.current.forEach((x) => URL.revokeObjectURL(x.url)), []);

  const sel = Object.keys(kinds).filter((k) => kinds[k]);
  async function pick(files: FileList | null) {
    if (!files) return; setErr(null);
    const list = [...files];
    if (staged.length + list.length > MAX_FILES) return setErr(`За раз можно добавить не больше ${MAX_FILES} изображений.`);
    const side = kinds.sticker ? 512 : 128, add: Staged[] = [];
    const fail = (m: string) => { add.forEach((x) => URL.revokeObjectURL(x.url)); setErr(m); };
    for (const f of list) {
      if (!["image/png", "image/webp"].includes(f.type)) return fail("Подходят только PNG и WebP с прозрачным фоном.");
      if (f.size > MAX_SRC) return fail(`Файл «${f.name}» больше 3 МБ.`);
      try { const b = await fit(f, side); add.push({ blob: b, url: URL.createObjectURL(b), name: f.name }); }
      catch (e) { return fail(e instanceof Error && e.message === "too_big" ? `Файл «${f.name}» не удаётся уместить в 512 КБ даже после сжатия. Возьмите более простое или маленькое изображение.` : `Не удалось прочитать «${f.name}».`); }
    }
    setStaged((p) => [...p, ...add]);
  }
  async function create() {
    if (!title.trim() || !sel.length || !staged.length) return setErr("Укажите название, назначение и добавьте хотя бы одно изображение.");
    setBusy(true); setErr(null);
    const up: string[] = []; let packId: string | null = null;
    try {
      const { data: pk, error: e1 } = await supabase.from("emoji_packs").insert({ title: title.trim(), kinds: sel, premium_only: premiumOnly, published: false }).select("id").single();
      if (e1 || !pk) throw e1; packId = pk.id as string;
      const rows: { pack_id: string; path: string; alt: string; position: number }[] = [];
      for (let i = 0; i < staged.length; i++) {
        const path = `${packId}/${crypto.randomUUID()}.${staged[i].blob.type === "image/webp" ? "webp" : "png"}`;
        const { error } = await supabase.storage.from("emoji-packs").upload(path, staged[i].blob, { contentType: staged[i].blob.type });
        if (error) throw error; up.push(path);
        rows.push({ pack_id: packId, path, alt: staged[i].name.replace(/\.[^.]+$/, "").slice(0, 40), position: i });
      }
      const { error: e2 } = await supabase.from("emoji_items").insert(rows); if (e2) throw e2;
      if (publish) { const { error: e3 } = await supabase.from("emoji_packs").update({ published: true }).eq("id", packId); if (e3) throw e3; }
      invalidateCatalog(); setTitle(""); staged.forEach((x) => URL.revokeObjectURL(x.url)); setStaged([]); await load();
    } catch (e) {
      console.error(e);
      if (up.length) { const { error: ce } = await supabase.storage.from("emoji-packs").remove(up); if (ce) console.error("cleanup storage:", ce); }
      if (packId) { const { error: de } = await supabase.from("emoji_packs").delete().eq("id", packId); if (de) console.error("cleanup pack:", de); }
      setErr("Не удалось сохранить набор. Ничего не добавлено, попробуйте ещё раз.");
    }
    setBusy(false);
  }
  async function patch(id: string, v: Partial<Pick<PackRow, "published" | "premium_only">>) {
    const { error } = await supabase.from("emoji_packs").update(v).eq("id", id);
    if (error) { console.error(error); setErr("Не удалось изменить набор."); } else { invalidateCatalog(); await load(); }
  }
  async function remove(p: PackRow) {
    if (!window.confirm(`Удалить набор «${p.title}» со всеми изображениями?`)) return;
    setErr(null);
    const { data: items, error: e0 } = await supabase.from("emoji_items").select("path").eq("pack_id", p.id);
    if (e0) { console.error(e0); return setErr("Не удалось получить список файлов набора."); }
    // Сначала строки в базе: если изображения уже используются, база откажет, и файлы останутся нетронутыми
    const { error } = await supabase.from("emoji_packs").delete().eq("id", p.id);
    if (error) {
      console.error(error);
      return setErr(error.message?.includes("item_in_use")
        ? "Набор нельзя удалить: его изображения уже есть в сообщениях, стикерах или эмодзи-статусах. Скройте набор: он пропадёт из выбора, а старые сообщения продолжат отображаться."
        : "Не удалось удалить набор.");
    }
    const paths = (items ?? []).map((x) => x.path as string);
    if (paths.length) {
      const { error: se } = await supabase.storage.from("emoji-packs").remove(paths);
      if (se) { console.error(se); setErr("Набор удалён, но файлы в хранилище очистить не удалось. Удалите их вручную: Supabase → Storage → emoji-packs."); }
    }
    invalidateCatalog(); await load();
  }

  return (
    <div className="adm-body wide">
      <section><h2>Новый набор</h2>
        <label>Название<input value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} placeholder="Например, «Готика»" /></label>
        <div className="row">{Object.keys(KIND_LABELS).map((k) => (
          <label key={k} className="check"><input type="checkbox" checked={kinds[k]} onChange={(e) => setKinds({ ...kinds, [k]: e.target.checked })} /><span>{KIND_LABELS[k]}</span></label>))}</div>
        <label className="check"><input type="checkbox" checked={premiumOnly} onChange={(e) => setPremiumOnly(e.target.checked)} /><span>Только для Premium (смотреть могут все)</span></label>
        <input ref={input} type="file" accept="image/png,image/webp" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        <div className="row"><button className="btn" onClick={() => input.current?.click()} disabled={busy}>Выбрать файлы</button><span className="dim small">PNG или WebP, до {MAX_FILES} штук; изображения уменьшаются в браузере</span></div>
        {!!staged.length && <div className="stage">{staged.map((s, i) => (
          <div key={s.url} className="stage-i"><img src={s.url} alt={s.name} /><button className="icon-btn" onClick={() => { URL.revokeObjectURL(s.url); setStaged(staged.filter((_, j) => j !== i)); }} aria-label="Убрать изображение" disabled={busy}><X size={14} /></button></div>))}</div>}
        <label className="check"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /><span>Опубликовать сразу</span></label>
        {err && <p className="err small" role="alert">{err}</p>}
        <div className="row"><button className="btn primary" onClick={create} disabled={busy}>{busy ? "Загружаю…" : "Создать набор"}</button></div>
      </section>
      <section><h2>Наборы</h2>
        {state === "loading" && <div className="skel" />}
        {state === "error" && <p className="err small">Не удалось загрузить наборы. Проверьте, что выполнена миграция 0008.</p>}
        {state === "ready" && !packs.length && <p className="dim small">Наборов пока нет.</p>}
        {state === "ready" && !!packs.length && <p className="dim small">Скрытый набор нельзя выбрать для новых сообщений и статусов, но уже отправленные стикеры, эмодзи и статусы продолжают показываться. Использованный набор удалить нельзя — только скрыть.</p>}
        <ul className="adm-list">{packs.map((p) => (
          <li key={p.id} className="pack-row"><div className="cr-main"><strong>{p.title}</strong>
            <span className="dim small">{p.kinds.map((k) => KIND_LABELS[k]).join(", ")} · {p.emoji_items[0]?.count ?? 0} шт. · {p.published ? "опубликован" : "скрыт"}{p.premium_only ? " · Premium" : ""}</span></div>
            <div className="row"><button className="btn" onClick={() => patch(p.id, { published: !p.published })}>{p.published ? "Скрыть" : "Опубликовать"}</button>
              <button className="btn ghost" onClick={() => patch(p.id, { premium_only: !p.premium_only })}>{p.premium_only ? "Для всех" : "Только Premium"}</button>
              <button className="icon-btn" onClick={() => remove(p)} aria-label="Удалить набор"><Trash2 size={16} strokeWidth={1.75} /></button></div></li>))}</ul>
      </section>
    </div>);
}

export default function Admin() {
  const [mode, setMode] = useState<"users" | "packs">("users");
  return (
    <div className="adm-root">
      <header className="topbar"><h2>Администрирование</h2>
        <div className="seg-tabs" role="tablist">
          <button role="tab" aria-selected={mode === "users"} className={mode === "users" ? "on" : ""} onClick={() => setMode("users")}>Premium</button>
          <button role="tab" aria-selected={mode === "packs"} className={mode === "packs" ? "on" : ""} onClick={() => setMode("packs")}>Наборы эмодзи и стикеров</button>
        </div></header>
      {mode === "users" ? <UsersView /> : <PackManager />}
    </div>);
}
