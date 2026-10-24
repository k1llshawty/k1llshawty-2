import { useState, type FormEvent } from "react";
import { supabase, configured } from "./supabase";

const UNAME = /^[a-z0-9_]{3,20}$/;

export function Wordmark({ big }: { big?: boolean }) {
  return <span className={big ? "wm wm-big" : "wm"}>k1llshawty<i>.exe</i></span>;
}

async function signIn(username: string, password: string) {
  const u = username.trim().toLowerCase();
  const bad = "Неверное имя пользователя или пароль.";
  if (!UNAME.test(u)) return bad;
  const { data: email, error: e1 } = await supabase.rpc("resolve_login", { p_username: u });
  if (e1) return "Нет связи с сервером. Попробуйте ещё раз.";
  if (!email) return bad;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? bad : null;
}

export default function Auth() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [f, setF] = useState({ invite: "", username: "", display: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!configured) return setErr("Не заполнен файл src/config.ts (адрес и ключ Supabase).");
    const username = f.username.trim().toLowerCase();
    if (!UNAME.test(username)) return setErr("Имя пользователя: 3–20 символов, a–z, 0–9 и _.");
    if (mode === "up" && f.password.length < 8) return setErr("Пароль: минимум 8 символов.");
    setBusy(true);
    if (mode === "up") {
      const { data, error } = await supabase.functions.invoke("register", {
        body: { inviteCode: f.invite, username, password: f.password, displayName: f.display },
      });
      let msg: string | null = null;
      if (error) {
        const ctx = (error as { context?: Response }).context;
        try { msg = (await ctx?.json())?.message ?? null; } catch { /* ignore */ }
        msg ??= "Не удалось связаться с сервером регистрации.";
      } else if (!data?.ok) msg = data?.message ?? "Не удалось создать аккаунт.";
      if (msg) { setBusy(false); return setErr(msg); }
    }
    const m = await signIn(username, f.password);
    setBusy(false);
    if (m) setErr(m);
  }

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit} noValidate>
        <Wordmark big />
        <p className="muted">{mode === "in" ? "Закрытый мессенджер. Вход по username." : "Регистрация только по одноразовому инвайт-коду."}</p>
        {mode === "up" && <label>Инвайт-код<input value={f.invite} onChange={set("invite")} placeholder="XXXX-XXXX-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false} /></label>}
        <label>Имя пользователя<input value={f.username} onChange={set("username")} autoComplete="username" autoCapitalize="none" spellCheck={false} /></label>
        {mode === "up" && <label>Отображаемое имя <span className="muted">(необязательно)</span><input value={f.display} onChange={set("display")} maxLength={40} /></label>}
        <label>Пароль<input type="password" value={f.password} onChange={set("password")} autoComplete={mode === "in" ? "current-password" : "new-password"} /></label>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn primary" disabled={busy}>{busy ? "Подождите…" : mode === "in" ? "Войти" : "Создать аккаунт"}</button>
        <button type="button" className="link" onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(null); }}>
          {mode === "in" ? "Есть инвайт-код? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
        </button>
        {mode === "in" && <p className="muted small">Забыли пароль? Автоматического восстановления нет — напишите владельцу сервиса, он сбросит пароль вручную.</p>}
      </form>
    </main>
  );
}
