// Fonction serveur « notifications » : appelée chaque minute par pg_cron, envoie les notifications iPhone (Web Push).
// La base choisit quoi envoyer et à qui (push_a_envoyer, règles de notify/rules.ts) ; chaque alerte ne part qu'une fois.
// Les clés VAPID sont créées automatiquement au premier appel et gardées dans la base (aucune clé à copier).
import webpush from 'npm:web-push@3.6.7';
import { admin, cronAutorise, json } from '../_commun/serveur.ts';

type Sub = { endpoint: string; p256dh: string; auth: string };
type Item = { key: string; title: string; body: string; urgent: boolean; to: Sub[] };

Deno.serve(async (req) => {
  const sb = admin();
  if (!(await cronAutorise(req, sb))) return json({ error: 'Non autorisé' }, 401);
  const db = sb.schema('norma');
  let { data: keys } = await db.rpc('push_cles');
  if (!keys) {
    const k = webpush.generateVAPIDKeys();
    await db.rpc('push_cles_enregistrer', { p_public: k.publicKey, p_private: { privateKey: k.privateKey } });
    ({ data: keys } = await db.rpc('push_cles'));
  }
  webpush.setVapidDetails(`mailto:${Deno.env.get('NORMA_EXPEDITEUR') ?? 'info@originalscompletos.ch'}`, keys.publicKey, keys.privateJwk.privateKey);
  const { data: items, error } = await db.rpc('push_a_envoyer', { p_now: new Date().toISOString() });
  if (error) return json({ error: error.message }, 500);
  let sent = 0;
  for (const it of items as Item[]) {
    for (const s of it.to) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: it.title, body: it.body, tag: it.key }), { TTL: 3600, urgency: it.urgent ? 'high' : 'normal' });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.rpc('push_supprimer', { p_endpoint: s.endpoint });   // abonnement expiré
      }
    }
  }
  return json({ alertes: (items as Item[]).length, envois: sent });
});
