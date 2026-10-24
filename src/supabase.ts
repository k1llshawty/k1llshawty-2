import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";
// Только публичные значения. service_role в браузере не используется никогда.
const url = import.meta.env.VITE_SUPABASE_URL || SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;
export const configured = url.startsWith("https://") && !url.includes("ВАШ") && !key.includes("ВАШ");
export const supabase = createClient(configured ? url : "https://placeholder.supabase.co", configured ? key : "placeholder", {
  auth: { persistSession: true, autoRefreshToken: true },
});
export type Profile = { id: string; username: string; display_name: string; bio: string; created_at: string; avatar_path: string | null; cover_path: string | null; last_seen_at: string | null };
