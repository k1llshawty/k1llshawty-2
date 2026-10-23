import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import type { Profile } from "./supabase";
import { SIZES, compress, saveMedia, useSignedUrl, type Kind } from "./media";

const OK = ["image/jpeg", "image/png", "image/webp"];

export default function ImageEditor({ kind, profile, onClose, onSaved }: { kind: Kind; profile: Profile; onClose: () => void; onSaved: (p: Profile) => void }) {
  const oldPath = kind === "avatar" ? profile.avatar_path : profile.cover_path;
  const current = useSignedUrl(oldPath);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const label = kind === "avatar" ? "аватар" : "обложку";

  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [busy, onClose]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function pick(file?: File) {
    if (!file) return;
    setErr(null);
    if (!OK.includes(file.type)) return setErr("Подходят только JPEG, PNG и WebP.");
    if (file.size > SIZES[kind].maxMb * 1024 * 1024) return setErr(`Файл больше ${SIZES[kind].maxMb} МБ.`);
    try { const b = await compress(file, kind); setBlob(b); setPreview(URL.createObjectURL(b)); }
    catch { setErr("Не удалось прочитать изображение. Попробуйте другой файл."); }
  }
  async function commit(remove: boolean) {
    setBusy(true); setErr(null);
    try { onSaved(await saveMedia(profile.id, kind, remove ? null : blob, oldPath)); onClose(); }
    catch { setBusy(false); setErr("Не удалось сохранить. Прежнее изображение осталось на месте."); }
  }
  const shown = preview ?? current;

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Изменить ${label}`}>
        <h2>Изменить {label}</h2>
        <div className={"ed-frame " + kind}>
          {shown ? <img src={shown} alt="Предпросмотр" /> : <span className="muted small">Изображения нет</span>}
        </div>
        <p className="dim small">{kind === "avatar" ? "Фото кадрируется по центру в круг." : "Обложка кадрируется по центру, пропорции 8:3."} JPEG, PNG или WebP.</p>
        <input ref={input} type="file" accept={OK.join(",")} hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row">
          <button className="btn" onClick={() => input.current?.click()} disabled={busy}><ImagePlus size={15} strokeWidth={1.75} />Выбрать файл</button>
          {oldPath && !blob && <button className="btn ghost" onClick={() => commit(true)} disabled={busy}><Trash2 size={15} strokeWidth={1.75} />Удалить</button>}
        </div>
        <div className="row end">
          <button className="btn ghost" onClick={onClose} disabled={busy}>Отмена</button>
          <button className="btn primary" onClick={() => commit(false)} disabled={!blob || busy}>{busy ? "Загружаю…" : "Сохранить"}</button>
        </div>
      </div>
    </div>);
}
