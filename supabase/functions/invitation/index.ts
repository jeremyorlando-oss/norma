// Fonction serveur « invitation » : la personne invitée par WhatsApp crée son accès (e-mail + mot de passe).
// Les inscriptions libres sont fermées ; seul un lien valide (usage unique, 48 h) permet de créer un compte.
import { admin, cors, json } from '../_commun/serveur.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);
  const sb = admin();
  const db = sb.schema('norma');
  const { action, token, email, password } = await req.json().catch(() => ({}));
  if (typeof token !== 'string' || !/^[0-9a-f]{48}$/.test(token)) return json({ error: 'Invitation invalide ou expirée' }, 400);
  const { data: inv } = await db.rpc('invitation_valide', { p_token: token });
  if (!inv) return json({ error: 'Invitation invalide ou expirée' }, 400);
  if (action === 'check') return json(inv);

  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return json({ error: 'E-mail invalide' }, 400);
  if (typeof password !== 'string' || password.length < 10) return json({ error: 'Mot de passe trop court (10 caractères minimum)' }, 400);
  const { data: u, error } = await sb.auth.admin.createUser({ email: email.trim().toLowerCase(), password, email_confirm: true });
  if (error || !u.user) {
    const taken = /already|registered|exists/i.test(error?.message ?? '');
    return json({ error: taken ? 'Cette adresse e-mail a déjà un compte' : 'Création du compte impossible' }, 400);
  }
  const { error: e2 } = await db.rpc('invitation_utiliser', { p_token: token, p_user: u.user.id });
  if (e2) { await sb.auth.admin.deleteUser(u.user.id); return json({ error: 'Invitation invalide ou expirée' }, 400); }
  return json({ ok: true });
});
