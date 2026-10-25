// Espace Employé (V1.1, D30) : sur son propre téléphone, chacun voit son planning, ses heures, ses formations,
// et dépose ses documents. Aucune donnée des autres ni de l'hygiène du stand n'est visible.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LangProvider, LOCALE, useLang, useT, type Lang } from '../i18n';
import { Segmented } from '../components/Controls';
import { breakMinutes, fmtMin, workedMinutes, type Span } from '../domain/hours';
import { CONTROLLER, privacyNotice } from '../domain/privacy';
import { LOGO_ICON_URL } from '../brand/logo';

type J = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
type Tab = 'planning' | 'heures' | 'documents' | 'profil';
type DocKind = 'identite' | 'avs' | 'bancaire' | 'certificat_medical' | 'cv' | 'certificat' | 'autre';
const KINDS: DocKind[] = ['cv', 'certificat', 'identite', 'avs', 'bancaire', 'certificat_medical', 'autre'];
const KIND_FR: Record<DocKind, string> = { identite: 'Pièce d’identité / permis', avs: 'Carte AVS', bancaire: 'Coordonnées bancaires (IBAN)',
  certificat_medical: 'Certificat médical', cv: 'CV', certificat: 'Certificat de travail / diplôme', autre: 'Autre document' };
const day = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const input = { width: '100%', border: 'none', fontFamily: 'inherit', fontSize: 17, background: 'transparent', color: '#000', padding: '14px 16px' } as const;

export function Employe({ sb, signOut, onBack }: { sb: SupabaseClient; signOut: () => void; onBack?: () => void }) {
  const db = useMemo(() => sb.schema('norma'), [sb]);
  const [me, setMe] = useState<J | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const { data, error } = await db.rpc('rpc_employe_moi');
    if (error) setError(error.message); else setMe(data);
  }, [db]);
  useEffect(() => { load(); }, [load]);
  if (!me) return <div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}><p className="note">{error || '…'}</p></div>;
  return <LangProvider lang={me.langue as Lang}><Espace sb={sb} me={me} reload={load} signOut={signOut} onBack={onBack} /></LangProvider>;
}

function Espace({ sb, me, reload, signOut, onBack }: { sb: SupabaseClient; me: J; reload: () => void; signOut: () => void; onBack?: () => void }) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('planning');
  const titles: Record<Tab, string> = { planning: t('Mon planning'), heures: t('Mes heures'), documents: t('Mes documents'), profil: t('Mon profil') };
  return (
    <div className="screen">
      {onBack && <button className="link" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={onBack}>‹ Direction</button>}
      <div><div className="eyebrow">{me.prenom} · {t(me.poste)}</div><h1 className="h1">{titles[tab]}</h1></div>
      <Segmented label={t('Sections')} value={tab} onChange={setTab}
        options={[{ value: 'planning', label: t('Planning') }, { value: 'heures', label: t('Heures') }, { value: 'documents', label: t('Documents') }, { value: 'profil', label: t('Profil') }]} />
      {tab === 'planning' && <Planning sb={sb} />}
      {tab === 'heures' && <Heures sb={sb} />}
      {tab === 'documents' && <Documents sb={sb} me={me} />}
      {tab === 'profil' && <Profil sb={sb} me={me} reload={reload} signOut={signOut} />}
    </div>
  );
}

function useRpc<T>(sb: SupabaseClient, fn: string, args: J, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    sb.schema('norma').rpc(fn, args).then(({ data, error }) => { if (error) setError(error.message); else setData(data as T); });
  }, deps);   // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error };
}

function Planning({ sb }: { sb: SupabaseClient }) {
  const t = useT(); const loc = LOCALE[useLang()];
  const { data, error } = useRpc<J[]>(sb, 'rpc_mon_planning', {}, []);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const fmt = (s: string) => day(s).toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'long' });
  return (
    <>
      <div className="group">
        {data?.length === 0 && <div className="row"><span className="sub">{t('Aucun événement prévu pour vous pour le moment.')}</span></div>}
        {data?.map((e) => {
          const past = day(e.end) < today;
          return (<div className="row" key={e.id} style={{ opacity: past ? 0.5 : 1 }}>
            <span className="grow"><span className="main">{e.name}</span>
              <span className="sub">{fmt(e.start)}{e.end !== e.start ? ` → ${fmt(e.end)}` : ''}{e.place ? ` · ${e.place}` : ''}{past ? ` · ${t('terminé')}` : ''}</span></span></div>);
        })}
      </div>
      <p className="note">{t('Les horaires précis sont communiqués par le Gérant ou le Manager.')}</p>
      <div className="error" role="alert">{error}</div>
    </>
  );
}

function Heures({ sb }: { sb: SupabaseClient }) {
  const t = useT(); const loc = LOCALE[useLang()];
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const to = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const { data, error } = useRpc<J[]>(sb, 'rpc_mes_heures', { p_from: month.toISOString(), p_to: to.toISOString() }, [month.getTime()]);
  const now = new Date();
  const shifts = (data ?? []).map((s) => ({ start: new Date(s.start), end: s.end ? new Date(s.end) : null, corrected: (s.corrections as J[]).length > 0,
    breaks: (s.breaks as J[]).map((b): Span => ({ start: new Date(b.start), end: b.end ? new Date(b.end) : null })) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const total = shifts.reduce((n, s) => n + workedMinutes(s, now), 0);
  const hm = (d: Date) => d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="link" aria-label={t('Mois précédent')} onClick={() => shift(-1)}>‹</button>
        <b style={{ textTransform: 'capitalize' }}>{month.toLocaleDateString(loc, { month: 'long', year: 'numeric' })}</b>
        <button className="link" aria-label={t('Mois suivant')} onClick={() => shift(1)} disabled={to > now}>›</button>
      </div>
      <div className="group" style={{ padding: 14, textAlign: 'center' }}>
        <div className="sub">{t('Total travaillé ce mois')}</div>
        <div style={{ fontSize: 34, fontWeight: 700 }}>{fmtMin(total)}</div>
      </div>
      <div className="group">
        {data && shifts.length === 0 && <div className="row"><span className="sub">{t('Aucune heure enregistrée ce mois-ci.')}</span></div>}
        {shifts.map((s) => {
          const p = breakMinutes(s, now);
          return (<div className="row" key={s.start.toISOString()}>
            <span className="grow"><span className="main">{s.start.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span className="sub">{hm(s.start)} → {s.end ? hm(s.end) : t('en cours')}{p ? ` · ${t('pause')} ${fmtMin(p)}` : ''}{s.corrected ? ` · ${t('corrigé par la Direction')}` : ''}</span></span>
            <b>{fmtMin(workedMinutes(s, now))}</b></div>);
        })}
      </div>
      <p className="note">{t('Une erreur ? Signalez-la au Gérant : les corrections sont tracées.')}</p>
      <div className="error" role="alert">{error}</div>
    </>
  );
}

function Documents({ sb, me }: { sb: SupabaseClient; me: J }) {
  const t = useT(); const loc = LOCALE[useLang()];
  const [docs, setDocs] = useState<J[]>([]);
  const [kind, setKind] = useState<DocKind>('identite');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const db = useMemo(() => sb.schema('norma'), [sb]);
  const load = useCallback(() => { db.rpc('rpc_mes_documents').then(({ data }) => setDocs(data ?? [])); }, [db]);
  useEffect(() => { load(); }, [load]);
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setError(''); setMsg('');
    if (f.size > 10 * 1024 * 1024) { setError(t('Fichier trop lourd (10 Mo maximum).')); return; }
    setBusy(true);
    const ext = (f.name.split('.').pop() ?? 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
    const companyId = me.companyId ?? '';
    const path = `${companyId}/${me.memberId}/${kind}/${crypto.randomUUID()}.${ext}`;
    const up = await sb.storage.from('documents-employes').upload(path, f, { contentType: f.type || undefined });
    if (up.error) { setError(t('Envoi impossible : {e}', { e: up.error.message })); setBusy(false); return; }
    const { error } = await db.rpc('rpc_document_ajoute', { p_kind: kind, p_path: path, p_filename: f.name });
    if (error) setError(error.message); else { setMsg(t('Document envoyé au Gérant.')); load(); }
    setBusy(false);
  };
  const open = async (d: J) => {
    const { data } = await sb.storage.from('documents-employes').createSignedUrl(d.path, 120);
    if (data) window.open(data.signedUrl, '_blank');
  };
  return (
    <>
      <div className="group">
        <label className="row"><span style={{ width: 90 }}>{t('Type')}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as DocKind)} style={{ flex: 1, border: 'none', fontSize: 16, background: 'transparent' }}>
            {KINDS.map((k) => <option key={k} value={k}>{t(KIND_FR[k])}</option>)}</select></label>
      </div>
      {kind === 'certificat_medical' && <p className="note">{t('Le certificat médical n’est visible que par le Gérant.')}</p>}
      <label className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
        {busy ? t('Envoi…') : t('Photographier ou choisir un fichier')}
        <input type="file" accept="image/*,application/pdf,.doc,.docx" style={{ display: 'none' }} disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      <div className="note" role="status">{msg}</div>
      <div className="error" role="alert">{error}</div>
      <div className="section-label">{t('Déjà envoyés')}</div>
      <div className="group">
        {docs.length === 0 && <div className="row"><span className="sub">{t('Aucun document pour le moment.')}</span></div>}
        {docs.map((d) => (
          <button key={d.id} className="row" style={{ width: '100%', border: 'none', background: '#fff', fontSize: 17, textAlign: 'left' }} onClick={() => open(d)}>
            <span className="grow"><span className="main">{t(KIND_FR[d.kind as DocKind])}</span>
              <span className="sub">{d.filename} · {new Date(d.at).toLocaleDateString(loc)}</span></span>›</button>))}
      </div>
      <p className="note">{t('Vos documents sont stockés en Suisse, chiffrés, et visibles seulement par vous et la Direction. Pour en supprimer un, demandez au Gérant.')}</p>
    </>
  );
}

function Profil({ sb, me, reload, signOut }: { sb: SupabaseClient; me: J; reload: () => void; signOut: () => void }) {
  const t = useT(); const lang = useLang(); const loc = LOCALE[lang];
  const [notice, setNotice] = useState(false);
  const n = privacyNotice(lang, CONTROLLER);
  const setLang = async (l: string) => { await sb.schema('norma').rpc('rpc_ma_langue', { p_lang: l }); reload(); };
  const ok = (me.formations as J[]).find((f) => f.score === 5);
  return (
    <>
      <div className="group">
        <div className="row"><span className="grow"><span className="main">{me.prenom} {me.nom}</span><span className="sub">{t(me.poste)} · {me.entreprise}</span></span></div>
        <label className="row"><span style={{ width: 90 }}>{t('Langue')}</span>
          <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ flex: 1, border: 'none', fontSize: 16, background: 'transparent' }}>
            <option value="fr">Français</option><option value="es">Español</option><option value="en">English</option></select></label>
        <div className="row"><span className="grow"><span className="main">{t('Formation hygiène')}</span>
          <span className="sub">{ok ? t('Validée le {d} (5/5)', { d: new Date(ok.at).toLocaleDateString(loc) }) : t('À faire sur la tablette du stand')}</span></span></div>
        <div className="row"><span className="grow"><span className="main">{t('Protection des données')}</span>
          <span className="sub">{me.privacyAck ? t('Notice lue le {d}', { d: new Date(me.privacyAck).toLocaleDateString(loc) }) : t('Notice à lire sur la tablette du stand')}</span></span>
          <button className="link" onClick={() => setNotice(!notice)}>{notice ? t('Fermer') : t('Lire')}</button></div>
      </div>
      <MesInfos sb={sb} />
      {notice && (
        <div className="group" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <b>{n.title}</b><p className="note" style={{ margin: 0 }}>{n.intro}</p>
          {n.sections.map((s) => (<div key={s.title}><b>{s.title}</b>
            {s.text && <p className="note" style={{ margin: '4px 0 0' }}>{s.text}</p>}
            {s.rows?.map((r) => <p key={r[0]} className="note" style={{ margin: '4px 0 0' }}><b>{r[0]}</b> · {r[1]} · {r[2]}</p>)}</div>))}
        </div>)}
      <img src={LOGO_ICON_URL} alt="" style={{ width: 40, height: 40, alignSelf: 'center', opacity: 0.6 }} />
      <button className="btn" style={{ color: 'var(--red)' }} onClick={signOut}>{t('Se déconnecter')}</button>
    </>
  );
}

/** Lien d'invitation reçu par WhatsApp : la personne crée son accès (e-mail + mot de passe), puis est connectée. */
export function Invitation({ sb, token, onDone }: { sb: SupabaseClient; token: string; onDone: () => void }) {
  const [info, setInfo] = useState<J | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    sb.functions.invoke('invitation', { body: { action: 'check', token } }).then(async ({ data, error }) => {
      if (error) {
        const msg = await (error as { context?: Response }).context?.json?.().catch(() => null);
        setError(msg?.error ?? 'Invitation invalide ou expirée');
      } else setInfo(data);
    });
  }, [sb, token]);
  if (!info) return (
    <div className="screen" style={{ justifyContent: 'center', gap: 16, textAlign: 'center', maxWidth: 420, margin: '0 auto' }}>
      <img src={LOGO_ICON_URL} alt="NORMA" style={{ width: 72, height: 72, alignSelf: 'center' }} />
      <p className="note" role="alert">{error ? `${error}. Demandez un nouveau lien au Gérant · Pida un nuevo enlace al Gerente · Ask the manager for a new link.` : '…'}</p>
      {error && <button className="btn" onClick={onDone}>OK</button>}
    </div>);
  return <LangProvider lang={info.langue as Lang}><Creer sb={sb} token={token} info={info} onDone={onDone} /></LangProvider>;
}

function Creer({ sb, token, info, onDone }: { sb: SupabaseClient; token: string; info: J; onDone: () => void }) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (pw.length < 10) return setError(t('Mot de passe trop court (10 caractères minimum)'));
    if (pw !== pw2) return setError(t('Les deux mots de passe ne sont pas identiques'));
    setBusy(true);
    const { error } = await sb.functions.invoke('invitation', { body: { action: 'accept', token, email: email.trim(), password: pw } });
    if (error) {
      const msg = await (error as { context?: Response }).context?.json?.().catch(() => null);
      setError(t(msg?.error ?? 'Création du compte impossible')); setBusy(false); return;
    }
    const r = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: pw });
    if (r.error) { setError(r.error.message); setBusy(false); return; }
    onDone();
  };
  return (
    <form className="screen" style={{ justifyContent: 'center', gap: 16, maxWidth: 420, margin: '0 auto' }} onSubmit={submit}>
      <img src={LOGO_ICON_URL} alt="NORMA" style={{ width: 72, height: 72, alignSelf: 'center' }} />
      <h1 className="h1" style={{ textAlign: 'center' }}>{t('Bonjour {p}', { p: info.prenom })}</h1>
      <p className="note" style={{ textAlign: 'center' }}>{t('Créez votre accès à NORMA ({e}) : planning, heures et documents, sur votre téléphone.', { e: info.entreprise })}</p>
      <div className="group">
        <input aria-label={t('E-mail')} type="email" autoComplete="username" placeholder={t('E-mail')} value={email} onChange={(e) => setEmail(e.target.value)} style={input} required />
        <input aria-label={t('Mot de passe (10 caractères minimum)')} type="password" autoComplete="new-password" placeholder={t('Mot de passe (10 caractères minimum)')} value={pw}
          onChange={(e) => setPw(e.target.value)} style={{ ...input, borderTop: '0.5px solid #E5E5EA' }} required />
        <input aria-label={t('Répéter le mot de passe')} type="password" autoComplete="new-password" placeholder={t('Répéter le mot de passe')} value={pw2}
          onChange={(e) => setPw2(e.target.value)} style={{ ...input, borderTop: '0.5px solid #E5E5EA' }} required />
      </div>
      <div className="error" role="alert">{error}</div>
      <button className="btn btn-primary" disabled={busy}>{busy ? '…' : t('Créer mon accès')}</button>
      <p className="note" style={{ textAlign: 'center' }}>{t('Ensuite, ajoutez NORMA à l’écran d’accueil : Partager › Sur l’écran d’accueil.')}</p>
    </form>
  );
}

type Field = { k: string; label: string; ph?: string; type?: 'date' | 'select'; opts?: [string, string][]; ac?: string; im?: 'numeric' | 'tel' | 'email' };
const PERMITS: [string, string][] = [['', '—'], ['CH', 'Suisse (pas de permis)'], ['B', 'Permis B'], ['C', 'Permis C'], ['L', 'Permis L'], ['G', 'Permis G (frontalier)'],
  ['Ci', 'Permis Ci'], ['F', 'Permis F'], ['N', 'Permis N'], ['S', 'Permis S'], ['autre', 'Autre']];
const CIVIL: [string, string][] = [['', '—'], ['celibataire', 'Célibataire'], ['marie', 'Marié·e'], ['partenariat', 'Partenariat enregistré'],
  ['separe', 'Séparé·e'], ['divorce', 'Divorcé·e'], ['veuf', 'Veuf·ve']];
const SECTIONS: [string, Field[]][] = [
  ['Identité', [{ k: 'prenoms', label: 'Prénoms complets', ac: 'given-name' }, { k: 'nom', label: 'Nom complet', ac: 'family-name' },
    { k: 'birthDate', label: 'Date de naissance', type: 'date', ac: 'bday' }, { k: 'nationality', label: 'Nationalité' },
    { k: 'permit', label: 'Permis de séjour', type: 'select', opts: PERMITS }, { k: 'permitUntil', label: 'Permis valable jusqu’au', type: 'date' }]],
  ['Coordonnées', [{ k: 'email', label: 'E-mail', ac: 'email', im: 'email' }, { k: 'phone', label: 'Téléphone', ac: 'tel', im: 'tel' },
    { k: 'street', label: 'Rue et numéro', ac: 'street-address' }, { k: 'npa', label: 'NPA', ac: 'postal-code', im: 'numeric' },
    { k: 'city', label: 'Localité', ac: 'address-level2' }, { k: 'country', label: 'Pays', ac: 'country-name' }]],
  ['Salaire et assurances sociales', [{ k: 'avs', label: 'Numéro AVS', ph: '756.1234.5678.97', im: 'numeric' },
    { k: 'iban', label: 'IBAN', ph: 'CH93 0076 2011 6238 5295 7' }, { k: 'ibanHolder', label: 'Titulaire du compte' },
    { k: 'civilStatus', label: 'État civil', type: 'select', opts: CIVIL }, { k: 'children', label: 'Enfants à charge', im: 'numeric' }]],
  ['Personne à prévenir en cas d’urgence', [{ k: 'emergencyName', label: 'Nom' }, { k: 'emergencyPhone', label: 'Téléphone', im: 'tel' }]],
];

/** Informations personnelles (dossier du personnel) : saisies par la personne elle-même. */
function MesInfos({ sb }: { sb: SupabaseClient }) {
  const t = useT();
  const [v, setV] = useState<J | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const db = useMemo(() => sb.schema('norma'), [sb]);
  const show = (d: J) => ({ ...d, iban: (d.iban ?? '').replace(/(.{4})/g, '$1 ').trim() });
  useEffect(() => { db.rpc('rpc_mon_profil').then(({ data }) => data && setV(show(data))); }, [db]);
  if (!v) return null;
  const save = async () => {
    setMsg(''); setError('');
    const { data, error } = await db.rpc('rpc_mon_profil_maj', { p: { ...v, children: v.children === null || v.children === undefined ? '' : String(v.children) } });
    if (error) setError(t(error.message)); else { setV(show(data)); setMsg(t('Informations enregistrées.')); }
  };
  const fmt = (k: string, x: string) => {
    if (k === 'avs') { const d = x.replace(/\D/g, '').slice(0, 13); return [d.slice(0, 3), d.slice(3, 7), d.slice(7, 11), d.slice(11, 13)].filter(Boolean).join('.'); }
    if (k === 'iban') return x.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 34).replace(/(.{4})/g, '$1 ').trim();
    if (k === 'children') return x.replace(/\D/g, '').slice(0, 2);
    return x;
  };
  const style = { flex: 1, minWidth: 0, border: 'none', fontSize: 16, fontFamily: 'inherit', background: 'transparent' } as const;
  return (
    <>
      {SECTIONS.map(([title, fields]) => (<div key={title}>
        <div className="section-label">{t(title)}</div>
        <div className="group">
          {fields.map((f) => (
            <label className="row" key={f.k}><span style={{ width: 130, flexShrink: 0 }}>{t(f.label)}</span>
              {f.type === 'select'
                ? <select value={v[f.k] ?? ''} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} style={style}>
                    {f.opts!.map(([val, l]) => <option key={val} value={val}>{t(l)}</option>)}</select>
                : <input type={f.type ?? 'text'} value={v[f.k] ?? ''} placeholder={f.ph} inputMode={f.im} autoComplete={f.ac}
                    onChange={(e) => setV({ ...v, [f.k]: fmt(f.k, e.target.value) })} style={style} />}
            </label>))}
        </div>
      </div>))}
      <div className="note" role="status">{msg}</div>
      <div className="error" role="alert">{error}</div>
      <button className="btn btn-primary" onClick={save}>{t('Enregistrer mes informations')}</button>
      <p className="note">{t('Ces informations servent au contrat, aux salaires et aux assurances sociales. Visibles seulement par vous et la Direction ; données de salaire (AVS, IBAN, date de naissance, état civil, enfants, permis) : Gérant seul.')}</p>
      <p className="note">{t('Déposez aussi dans Documents : pièce d’identité ou permis, carte AVS, attestation bancaire, CV, certificats.')}</p>
    </>
  );
}
