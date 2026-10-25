// NORMA · fonction serveur « invitation » — fichier généré par app/scripts/build-fonctions.mjs, à coller tel quel.

// ../supabase/functions/_commun/serveur.ts
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
var cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
function admin() {
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const key = keys.default ?? Object.values(keys)[0] ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Cl\xE9 secr\xE8te du projet introuvable");
  return createClient(Deno.env.get("SUPABASE_URL"), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ../supabase/functions/invitation/index.ts
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "M\xE9thode non autoris\xE9e" }, 405);
  const sb = admin();
  const db = sb.schema("norma");
  const { action, token, email, password } = await req.json().catch(() => ({}));
  if (typeof token !== "string" || !/^[0-9a-f]{48}$/.test(token)) return json({ error: "Invitation invalide ou expir\xE9e" }, 400);
  const { data: inv } = await db.rpc("invitation_valide", { p_token: token });
  if (!inv) return json({ error: "Invitation invalide ou expir\xE9e" }, 400);
  if (action === "check") return json(inv);
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return json({ error: "E-mail invalide" }, 400);
  if (typeof password !== "string" || password.length < 10) return json({ error: "Mot de passe trop court (10 caract\xE8res minimum)" }, 400);
  const { data: u, error } = await sb.auth.admin.createUser({ email: email.trim().toLowerCase(), password, email_confirm: true });
  if (error || !u.user) {
    const taken = /already|registered|exists/i.test(error?.message ?? "");
    return json({ error: taken ? "Cette adresse e-mail a d\xE9j\xE0 un compte" : "Cr\xE9ation du compte impossible" }, 400);
  }
  const { error: e2 } = await db.rpc("invitation_utiliser", { p_token: token, p_user: u.user.id });
  if (e2) {
    await sb.auth.admin.deleteUser(u.user.id);
    return json({ error: "Invitation invalide ou expir\xE9e" }, 400);
  }
  return json({ ok: true });
});
