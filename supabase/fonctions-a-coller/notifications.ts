// NORMA · fonction serveur « notifications » — fichier généré par app/scripts/build-fonctions.mjs, à coller tel quel.

// supabase/functions/notifications/index.ts
import webpush from "npm:web-push@3.6.7";

// supabase/functions/_commun/serveur.ts
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
var cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
function admin() {
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const key = keys.default ?? Object.values(keys)[0] ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Cl\xE9 secr\xE8te du projet introuvable");
  return createClient(Deno.env.get("SUPABASE_URL"), key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function cronAutorise(req, sb) {
  const secret = req.headers.get("x-norma-cron");
  if (!secret) return false;
  const { data } = await sb.schema("norma").rpc("cron_verifier", { p_secret: secret });
  return data === true;
}

// supabase/functions/notifications/index.ts
Deno.serve(async (req) => {
  const sb = admin();
  if (!await cronAutorise(req, sb)) return json({ error: "Non autoris\xE9" }, 401);
  const db = sb.schema("norma");
  let { data: keys } = await db.rpc("push_cles");
  if (!keys) {
    const k = webpush.generateVAPIDKeys();
    await db.rpc("push_cles_enregistrer", { p_public: k.publicKey, p_private: { privateKey: k.privateKey } });
    ({ data: keys } = await db.rpc("push_cles"));
  }
  webpush.setVapidDetails(`mailto:${Deno.env.get("NORMA_EXPEDITEUR") ?? "info@originalscompletos.ch"}`, keys.publicKey, keys.privateJwk.privateKey);
  const { data: items, error } = await db.rpc("push_a_envoyer", { p_now: (/* @__PURE__ */ new Date()).toISOString() });
  if (error) return json({ error: error.message }, 500);
  let sent = 0;
  for (const it of items) {
    for (const s of it.to) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: it.title, body: it.body, tag: it.key, url: it.url ?? "/", badge: s.badge ?? null, urgent: it.urgent }),
          { TTL: 3600, urgency: it.urgent ? "high" : "normal" }
        );
        sent++;
      } catch (e) {
        const code = e.statusCode;
        if (code === 404 || code === 410) await db.rpc("push_supprimer", { p_endpoint: s.endpoint });
      }
    }
  }
  return json({ alertes: items.length, envois: sent });
});
