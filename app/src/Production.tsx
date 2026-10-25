// Production : connexion au compte (tablette du stand ou iPhone du Gérant / Manager), puis l'app correspondante.
import { useEffect, useState } from 'react';
import { createClient, type Session as AuthSession } from '@supabase/supabase-js';
import { App } from './App';
import { createSupabaseApi } from './api/supabase';
import type { Session } from './api/types';
import { LOGO_ICON_URL } from './brand/logo';
import { Employe, Invitation } from './screens/Employe';

// Réseau faible en festival : au-delà de 12 s sans réponse, la saisie part dans la file hors ligne
const fetchWithTimeout: typeof fetch = (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(12_000) });
const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },   // la tablette reste connectée
  global: { fetch: fetchWithTimeout },
});
const WHO_KEY = 'norma.appareil';   // « tablette » mémorisé : l'app du stand s'ouvre même sans réseau
const rememberedDevice = () => { try { return localStorage.getItem(WHO_KEY) === 'tablette'; } catch { return false; } };
const api = createSupabaseApi(sb);

type Who = { kind: 'loading' } | { kind: 'login' } | { kind: 'device' } | { kind: 'direction'; session: Session } | { kind: 'employee' } | { kind: 'other' };
const inviteToken = () => /^#\/invitation\/([0-9a-f]{48})$/.exec(location.hash)?.[1] ?? null;

export function Production() {
  const [auth, setAuth] = useState<AuthSession | null | undefined>(undefined);
  const [who, setWho] = useState<Who>({ kind: 'loading' });
  const [invite, setInvite] = useState(inviteToken);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setAuth(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setAuth(s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (auth === undefined) return;
    if (!auth) { setWho(rememberedDevice() && !navigator.onLine ? { kind: 'device' } : { kind: 'login' }); return; }
    sb.schema('norma').rpc('rpc_moi').then(({ data, error, status }) => {
      if ((!status || error) && rememberedDevice()) return setWho({ kind: 'device' });   // pas de réseau : tablette du stand
      try { localStorage.setItem(WHO_KEY, data?.kind === 'device' ? 'tablette' : ''); } catch { /* stockage indisponible */ }
      if (error || !data) return setWho({ kind: 'other' });
      if (data.kind === 'device') return setWho({ kind: 'device' });
      if (data.kind === 'direction') return api.directionLogin('').then((session) => setWho({ kind: 'direction', session }));
      if (data.kind === 'employee') return setWho({ kind: 'employee' });
      setWho({ kind: 'other' });
    });
  }, [auth]);

  const signOut = () => { sb.auth.signOut(); };
  if (invite) return <Invitation sb={sb} token={invite} onDone={() => { history.replaceState(null, '', '/'); setInvite(null); }} />;
  if (who.kind === 'loading') return <div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}><p className="note">Connexion…</p></div>;
  if (who.kind === 'login') return <Connexion />;
  if (who.kind === 'device') return <App api={api} />;
  if (who.kind === 'employee') return <Employe sb={sb} signOut={signOut} />;
  if (who.kind === 'direction') return <App api={api} direction={{ session: who.session, signOut }} />;
  return (
    <div className="screen" style={{ justifyContent: 'center', gap: 16, textAlign: 'center' }}>
      <h1 className="h1">Compte non relié</h1>
      <p className="note">Ce compte n’est pas (ou plus) relié à NORMA. Demandez au Gérant une nouvelle invitation.</p>
      <button className="btn" onClick={signOut}>Se déconnecter</button>
    </div>
  );
}

function Connexion() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === 'Invalid login credentials' ? 'E-mail ou mot de passe incorrect' : error.message);
  };
  const input = { width: '100%', border: 'none', fontFamily: 'inherit', fontSize: 17, background: 'transparent', color: '#000', padding: '14px 16px' } as const;
  return (
    <form className="screen" style={{ justifyContent: 'center', gap: 16, maxWidth: 420, margin: '0 auto' }} onSubmit={submit}>
      <img src={LOGO_ICON_URL} alt="NORMA" style={{ width: 72, height: 72, alignSelf: 'center' }} />
      <h1 className="h1" style={{ textAlign: 'center' }}>NORMA</h1>
      <p className="note" style={{ textAlign: 'center' }}>Tablette du stand, iPhone de la Direction ou téléphone d’un membre de l’équipe. L’iPhone propose ensuite de retenir le mot de passe avec Face ID.</p>
      <div className="group">
        <input aria-label="E-mail" type="email" autoComplete="username" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} style={input} required />
        <input aria-label="Mot de passe" type="password" autoComplete="current-password" placeholder="Mot de passe" value={password}
          onChange={(e) => setPassword(e.target.value)} style={{ ...input, borderTop: '0.5px solid #E5E5EA' }} required />
      </div>
      <div className="error" role="alert">{error}</div>
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
    </form>
  );
}
