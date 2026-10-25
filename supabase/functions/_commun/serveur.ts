// Outils communs aux fonctions serveur NORMA (Supabase Edge Functions, Deno).
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

export const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Client avec la clé secrète du projet (fournie automatiquement par Supabase, jamais visible dans l'app). */
export function admin() {
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
  const key = keys.default ?? Object.values(keys)[0] ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('Clé secrète du projet introuvable');
  return createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Les tâches automatiques (pg_cron) envoient un secret stocké dans la base : rien d'autre ne peut les déclencher. */
export async function cronAutorise(req: Request, sb: ReturnType<typeof admin>) {
  const secret = req.headers.get('x-norma-cron');
  if (!secret) return false;
  const { data } = await sb.schema('norma').rpc('cron_verifier', { p_secret: secret });
  return data === true;
}
