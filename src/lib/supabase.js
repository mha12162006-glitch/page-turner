import { createClient } from "@supabase/supabase-js";
import { relWith, same } from "./util";

const SUPABASE_URL =
  (window.APP_CONFIG || {}).url || "PASTE_YOUR_PROJECT_URL";
const SUPABASE_ANON_KEY =
  (window.APP_CONFIG || {}).key || "PASTE_YOUR_ANON_PUBLIC_KEY";

export const configured = !SUPABASE_URL.startsWith("PASTE");

export const sb = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

export const isUniqueViolation = (error) =>
  error?.code === "23505" ||
  /duplicate key|unique constraint|already exists/i.test(error?.message || "");

export async function findExistingSeries(userId, candidate, known = []) {
  const local = (known || []).find((x) => same(x, candidate));
  if (local) return local;
  if (!userId) return null;
  const { data, error } = await sb
    .from("series")
    .select("*")
    .eq("user_id", userId);
  if (error) return null;
  return (data || []).find((x) => same(x, candidate)) || null;
}

export async function addFriend(me, uid, rows) {
  const ex = relWith(rows, me, uid);
  if (ex && ex.dir === "in" && ex.status === "pending") {
    return await sb
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", ex.id);
  }
  if (ex) return {};
  return await sb.from("friendships").insert({ addressee: uid });
}
