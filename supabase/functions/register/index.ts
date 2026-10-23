import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "method" });

  let b: any;
  try { b = await req.json(); } catch { return reply(400, { error: "bad_request", message: "Некорректный запрос." }); }
  const username = String(b.username ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  const display = String(b.displayName ?? "").trim() || username;
  const code = String(b.inviteCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Ограничение попыток: 10 за 10 минут с одного IP (хранится только хеш)
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const ipHash = await sha256("ip:" + ip);
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await admin.from("register_attempts").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since);
  if ((count ?? 0) >= 10) return reply(429, { error: "rate_limited", message: "Слишком много попыток. Подождите несколько минут." });
  await admin.from("register_attempts").insert({ ip_hash: ipHash });
  admin.from("register_attempts").delete().lt("created_at", new Date(Date.now() - 86_400_000).toISOString()).then(() => {});

  if (!/^[a-z0-9_]{3,20}$/.test(username)) return reply(400, { error: "username", message: "Username: 3–20 символов, a–z, 0–9 и _." });
  if (password.length < 8 || password.length > 72) return reply(400, { error: "password", message: "Пароль: от 8 до 72 символов." });
  if (display.length > 40) return reply(400, { error: "display_name", message: "Имя не длиннее 40 символов." });
  if (code.length !== 16) return reply(400, { error: "invite", message: "Инвайт-код недействителен." });

  const { data: taken } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (taken) return reply(409, { error: "username_taken", message: "Этот username уже занят." });

  // Атомарное потребление: один UPDATE, второй параллельный запрос получит 0 строк
  const nowIso = new Date().toISOString();
  const { data: invite } = await admin.from("invite_codes").update({ used_at: nowIso })
    .eq("code_hash", await sha256(code)).is("used_at", null).or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .select("id").maybeSingle();
  if (!invite) return reply(403, { error: "invite", message: "Инвайт-код недействителен или уже использован." });

  const release = () => admin.from("invite_codes").update({ used_at: null, used_by: null }).eq("id", invite.id);

  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email: `u_${username}@k1llshawty.invalid`, password, email_confirm: true,
  });
  if (authErr || !created.user) {
    await release();
    console.error("createUser failed:", authErr?.message);
    return reply(500, { error: "auth", message: "Не удалось создать аккаунт. Код сохранён, попробуйте ещё раз." });
  }
  const uid = created.user.id;

  const { error: profErr } = await admin.from("profiles").insert({ id: uid, username, display_name: display });
  if (profErr) {
    await admin.auth.admin.deleteUser(uid);   // без профиля аккаунт не оставляем
    await release();
    const dup = profErr.code === "23505";
    return reply(dup ? 409 : 500, { error: dup ? "username_taken" : "profile", message: dup ? "Этот username уже занят." : "Не удалось создать профиль. Код сохранён, попробуйте ещё раз." });
  }
  await admin.from("invite_codes").update({ used_by: uid }).eq("id", invite.id);
  return reply(200, { ok: true });
});
