import { useState } from "react";
import { Lock } from "lucide-react";
import { supabase } from "./supabase";
import { EMOJI } from "./emojiData";
import { CustomEmoji, invalidateFlair, useCatalog } from "./emoji";

export function EmojiPicker({ kind, premium, onUnicode, onCustom }: { kind: "status" | "message"; premium: boolean; onUnicode: (e: string) => void; onCustom: (id: string) => void }) {
  const cat = useCatalog(kind);
  return (
    <div className="picker" role="dialog" aria-label="Эмодзи">
      {EMOJI.map((c) => (
        <section key={c.name}><h3>{c.name}</h3>
          <div className="pgrid">{c.items.map((e) => <button key={e} className="pcell" onClick={() => onUnicode(e)}>{e}</button>)}</div></section>))}
      {cat.loading && <p className="dim small">Загрузка наборов…</p>}
      {cat.error && <p className="err small">Не удалось загрузить наборы.</p>}
      {cat.packs.map((p) => { const locked = p.premium_only && !premium; return (
        <section key={p.id}><h3>{p.title}{p.premium_only && <span className="dim"> · Premium</span>}{locked && <Lock size={12} strokeWidth={1.75} />}</h3>
          <div className="pgrid">{p.items.map((i) => (
            <button key={i.id} className="pcell" disabled={locked} title={locked ? "Нужен Premium" : i.alt} onClick={() => onCustom(i.id)}><CustomEmoji id={i.id} size={28} /></button>))}</div></section>); })}
    </div>);
}

export function StickerPicker({ premium, onPick }: { premium: boolean; onPick: (id: string) => void }) {
  const cat = useCatalog("sticker");
  return (
    <div className="picker" role="dialog" aria-label="Стикеры">
      {cat.loading && <p className="dim small">Загрузка стикеров…</p>}
      {cat.error && <p className="err small">Не удалось загрузить стикеры.</p>}
      {!cat.loading && !cat.error && !cat.packs.length && <p className="dim small">Наборов стикеров пока нет.</p>}
      {cat.packs.map((p) => { const locked = p.premium_only && !premium; return (
        <section key={p.id}><h3>{p.title}{p.premium_only && <span className="dim"> · Premium</span>}{locked && <Lock size={12} strokeWidth={1.75} />}</h3>
          <div className="sgrid">{p.items.map((i) => (
            <button key={i.id} className="scell" disabled={locked} title={locked ? "Нужен Premium" : i.alt} onClick={() => onPick(i.id)}><CustomEmoji id={i.id} size={72} className="stk" /></button>))}</div></section>); })}
    </div>);
}

const DURATIONS: { label: string; hours: number | null }[] = [{ label: "1 час", hours: 1 }, { label: "8 часов", hours: 8 }, { label: "24 часа", hours: 24 }, { label: "Без срока", hours: null }];

export function StatusEditor({ uid, onClose }: { uid: string; onClose: () => void }) {
  const [sel, setSel] = useState<{ emoji?: string; custom?: string } | null>(null);
  const [hours, setHours] = useState<number | null>(24);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save(clear: boolean) {
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("set_status", { p_emoji: clear ? null : sel?.emoji ?? null, p_custom: clear ? null : sel?.custom ?? null, p_hours: clear ? null : hours });
    setBusy(false);
    if (error) { console.error(error); return setErr(error.message?.includes("premium_required") ? "Эмодзи-статус доступен только с активным Premium." : error.message?.includes("bad_duration") ? "Недопустимый срок статуса." : "Не удалось сохранить статус. Попробуйте ещё раз."); }
    invalidateFlair(uid); onClose();
  }
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Эмодзи-статус">
        <h2>Эмодзи-статус</h2>
        <div className="status-prev"><span className="dim small">Предпросмотр</span>
          <span>{sel?.custom ? <CustomEmoji id={sel.custom} size={24} /> : sel?.emoji ? <span style={{ fontSize: 22 }}>{sel.emoji}</span> : <span className="dim small">не выбран</span>}</span></div>
        <EmojiPicker kind="status" premium onUnicode={(e) => setSel({ emoji: e })} onCustom={(id) => setSel({ custom: id })} />
        <label>Срок действия<select value={hours ?? ""} onChange={(e) => setHours(e.target.value === "" ? null : Number(e.target.value))}>
          {DURATIONS.map((d) => <option key={d.label} value={d.hours ?? ""}>{d.label}</option>)}</select></label>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row end">
          <button className="btn ghost" onClick={() => save(true)} disabled={busy}>Убрать статус</button>
          <button className="btn ghost" onClick={onClose} disabled={busy}>Отмена</button>
          <button className="btn primary" onClick={() => save(false)} disabled={busy || !sel}>{busy ? "Сохраняю…" : "Сохранить"}</button>
        </div>
      </div>
    </div>);
}
