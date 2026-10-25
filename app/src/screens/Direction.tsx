import { useCallback, useEffect, useState } from 'react';
import type { AdminDoc, Api, AuditEntry, DocKind, EventInfo, InspectorAccess, DayStats, Member, MemberAccount, MemberDoc, Nc, NcStep, ReportSettings, Session } from '../api/types';
import { Segmented } from '../components/Controls';
import { Evenements } from './Evenements';
import { Reglages } from './Reglages';
import { Heures, HoursAlerts } from './Heures';

type Tab = 'jour' | 'nc' | 'equipe' | 'plus';
const STEP_LABEL: Record<NcStep['step'], string> = { mesure_immediate: 'Mesure immédiate', evaluation_risque: 'Évaluation du risque',
  action_corrective: 'Action corrective', verification: 'Vérification', cloture: 'Clôture' };
const hm = (d: Date) => d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });

/** Espace Direction (iPhone Gérant / Manager) : version simplifiée, supervision + dépannage (D30). */
export function Direction({ api, onDepannage, onLogout, onInspector, initialSession }: { api: Api; onDepannage: (s: Session) => void; onLogout: () => void;
  onInspector: (a: InspectorAccess) => void; initialSession?: Session }) {
  const [session, setSession] = useState<Session | null>(initialSession ?? null);
  const [tab, setTab] = useState<Tab>('jour');
  const [reglages, setReglages] = useState(false);

  if (!session) return (
    <div className="screen">
      <div style={{ paddingTop: 40 }}><div className="eyebrow">NORMA · Direction</div><h1 className="h1">Connexion</h1></div>
      <p className="note">Sur l’iPhone : e-mail + mot de passe la première fois, puis Face ID. <b>Démo : choisissez un compte.</b></p>
      <div className="group">
        {[['m1', 'Orlando · Gérant'], ['m2', 'Vincent · Manager']].map(([id, l]) => (
          <button key={id} className="row" style={{ width: '100%', border: 'none', background: '#fff', fontSize: 17, textAlign: 'left' }}
            onClick={() => api.directionLogin(id).then(setSession)}>{l}<span style={{ marginLeft: 'auto', color: '#C7C7CC' }}>›</span></button>))}
      </div>
      <button className="link" onClick={onLogout}>‹ Revenir à la tablette</button>
    </div>
  );

  return (
    <div className="screen">
      <div><div className="eyebrow">{session.poste}</div><h1 className="h1">{tab === 'jour' ? 'Aujourd’hui' : tab === 'nc' ? 'Incidents' : tab === 'equipe' ? 'Équipe' : 'Plus'}</h1></div>
      <Segmented label="Sections" value={tab} onChange={setTab}
        options={[{ value: 'jour', label: 'Jour' }, { value: 'nc', label: 'Incidents' }, { value: 'equipe', label: 'Équipe' }, { value: 'plus', label: 'Plus' }]} />
      {tab === 'jour' && <HoursAlerts api={api} onOpen={() => setTab('equipe')} />}
      {tab === 'jour' && <Jour api={api} onEvents={() => setTab('plus')} />}
      {tab === 'nc' && <Incidents api={api} session={session} />}
      {tab === 'equipe' && <Equipe api={api} session={session} />}
      {tab === 'equipe' && session.droits.includes('heures_equipe') && <Heures api={api} session={session} />}
      {tab === 'plus' && reglages && <Reglages api={api} session={session} onBack={() => setReglages(false)} />}
      {tab === 'plus' && !reglages && <Evenements api={api} session={session} />}
      {tab === 'plus' && !reglages && (
        <div className="group">
          <button className="row" style={rowBtn} onClick={() => setReglages(true)}>
            <span className="grow"><span className="main">Réglages</span><span className="sub">Matériel · plan de nettoyage · droits des postes</span></span>›</button>
          {session.droits.includes('export') && <button className="row" style={rowBtn} onClick={async () => onInspector(await api.openInspector(session.token))}>
            <span className="grow"><span className="main">Mode inspecteur</span><span className="sub">Lecture seule pour un contrôle officiel · se ferme après 2 h</span></span>›</button>}
          <button className="row" style={rowBtn} onClick={() => onDepannage(session)}>
            <span className="grow"><span className="main">Saisie de dépannage</span><span className="sub">Ouvre les écrans du stand · marqué « iPhone » dans le registre</span></span>›</button>
          <button className="row" style={rowBtn} onClick={async () => {
            const { downloadDailyReport } = await import('../report/download');
            await downloadDailyReport(await api.dayReport(new Date()));
          }}><span className="grow"><span className="main">Rapport du jour (PDF)</span><span className="sub">Envoyé automatiquement chaque matin par e-mail · ici : générer maintenant</span></span>›</button>
          <button className="row" style={{ ...rowBtn, color: 'var(--red)' }} onClick={() => { setSession(null); onLogout(); }}>Se déconnecter</button>
        </div>)}
      {tab === 'plus' && !reglages && <Envois api={api} session={session} />}
      {tab === 'plus' && !reglages && <Documents api={api} session={session} />}
      {tab === 'plus' && !reglages && <Journal api={api} />}
    </div>
  );
}
const rowBtn = { width: '100%', border: 'none', background: '#fff', fontSize: 17, textAlign: 'left' } as const;

/** Administratif : documents du stand (déposés, jamais générés), revue périodique du plan HACCP (BPHR 4.2.4). */
function Documents({ api, session }: { api: Api; session: Session }) {
  const [docs, setDocs] = useState<AdminDoc[]>([]);
  const [review, setReview] = useState<Date | null>(null);
  useEffect(() => { api.documents().then(setDocs); api.haccpReview(null).then(setReview); }, [api]);
  const col = { ok: 'vert', manquant: 'rouge', a_jour: 'jaune' } as const;
  const txt = { ok: 'OK', manquant: 'Manquant', a_jour: 'À mettre à jour' };
  return (
    <>
      <div className="section-label">Administratif et documents du stand</div>
      <div className="group">
        {docs.map((d) => (
          <div className="row" key={d.id}><span className="grow"><span className="main" style={{ fontSize: 16 }}>{d.name}</span><span className="sub">{d.detail}</span></span>
            <span className={`pill ${col[d.status]}`}>{txt[d.status]}</span></div>))}
      </div>
      <div className="group">
        <button className="row" style={rowBtn} onClick={async () => { const { downloadPrivacyNotice } = await import('../report/download'); await downloadPrivacyNotice(await api.privacyAcks()); }}>
          <span className="grow"><span className="main" style={{ fontSize: 16 }}>Notice protection des données (PDF)</span>
          <span className="sub">FR · ES · EN, avec la liste des lectures confirmées · à mettre dans le classeur</span></span>›</button>
      </div>
      <div className="group">
        <div className="row"><span className="grow"><span className="main" style={{ fontSize: 16 }}>Revue du plan HACCP</span>
          <span className="sub">{review ? `Dernière revue : ${review.toLocaleDateString('fr-CH')}` : 'Aucune revue enregistrée · à faire au moins 1× par an et à chaque changement (menu, équipement, incident)'}</span></span>
          {session.droits.includes('reglages_gerant') && <button className="link" style={{ fontSize: 15 }} onClick={() => api.haccpReview(session.token).then(setReview)}>Revue faite</button>}</div>
      </div>
    </>
  );
}

/** Journal des accès sensibles (mode inspecteur). */
function Journal({ api }: { api: Api }) {
  const [list, setList] = useState<AuditEntry[]>([]);
  useEffect(() => { api.auditLog().then(setList); }, [api]);
  if (!list.length) return null;
  return (<><div className="section-label">Journal des accès inspecteur</div>
    <div className="group">{list.slice(0, 20).map((a, i) => <div className="row sub" key={i}>{a.at.toLocaleString('fr-CH')} · {a.who} · {a.action}</div>)}</div></>);
}

function Jour({ api, onEvents }: { api: Api; onEvents: () => void }) {
  const [s, setS] = useState<DayStats | null>(null);
  const [ev, setEv] = useState<EventInfo | null | undefined>(undefined);
  const [team, setTeam] = useState<Member[]>([]);
  const [open, setOpen] = useState(0);
  useEffect(() => {
    api.dayStats(new Date()).then(setS); api.currentEvent(new Date()).then(setEv); api.team().then(setTeam);
    api.nonconformities().then((n) => setOpen(n.filter((x) => !x.closed).length));
  }, [api]);
  if (!s) return null;
  const tile = (n: number, l: string, bad = false) => (
    <div className="group" style={{ padding: 12 }}><div style={{ fontSize: 28, fontWeight: 700, color: bad && n > 0 ? 'var(--red)' : '#000' }}>{n}</div><div className="sub" style={{ fontSize: 13, color: 'var(--text-2)' }}>{l}</div></div>);
  const present = team.filter((m) => m.clockedIn);
  return (
    <>
      {ev !== undefined && <button className="group row" style={{ width: '100%', border: 'none', textAlign: 'left', fontSize: 16 }} onClick={onEvents}>
        <span className="grow"><span className="main">{ev ? ev.name : 'Aucun événement en cours'}</span><span className="sub">{ev ? ev.place : 'Créer ou ouvrir un événement'}</span></span>›</button>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        {tile(open, 'Incidents ouverts', true)}{tile(s.nettoyagesEnRetard, 'Nettoyages en retard', true)}{tile(s.lotsAJeter, 'Lots à jeter', true)}
        {tile(s.releves, 'Relevés')}{tile(s.nettoyagesFaits, 'Nettoyages faits')}{tile(s.receptions, 'Réceptions')}
      </div>
      <div className="section-label">Présents · {present.length}</div>
      <div className="group">
        {present.length === 0 && <div className="row sub">Personne n’est pointé.</div>}
        {present.map((m) => (
          <div className="row" key={m.id}><span className="grow"><span className="main">{m.prenom}</span><span className="sub">{m.poste} · depuis {hm(m.since!)}</span></span>
            {m.aptToday === false ? <span className="pill rouge">Non apte</span> : m.aptToday ? <span className="pill vert">Apte</span> : <span className="pill jaune">Prise de poste ?</span>}</div>))}
      </div>
    </>
  );
}

function Incidents({ api, session }: { api: Api; session: Session }) {
  const [list, setList] = useState<Nc[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [step, setStep] = useState<NcStep['step']>('action_corrective');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => api.nonconformities().then(setList), [api]);
  useEffect(() => { load(); }, [load]);
  const nc = list.find((n) => n.id === sel);

  if (nc) {
    const add = async () => {
      setError('');
      try { await api.ncStep(session.token, nc.id, step, text.trim() || STEP_LABEL[step]); setText(''); load(); } catch (e) { setError((e as Error).message); }
    };
    const selfVerified = nc.steps.some((s) => s.step === 'verification' && nc.steps.some((a) => a.step === 'action_corrective' && a.by === s.by));
    return (
      <>
        <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setSel(null)}>‹ Tous les incidents</button>
        <div className="group" style={{ padding: 14 }}>
          <div className="eyebrow" style={{ color: nc.closed ? 'var(--green)' : 'var(--red)' }}>{nc.kind} · {nc.closed ? 'clôturé' : 'ouvert'}</div>
          <div style={{ fontSize: 17, fontWeight: 600, margin: '4px 0' }}>{nc.description}</div>
          <div className="sub">{nc.openedAt.toLocaleDateString('fr-CH')} · {hm(nc.openedAt)} · {nc.openedBy}</div>
        </div>
        <div className="group">
          {nc.steps.length === 0 && <div className="row sub">Aucune étape enregistrée.</div>}
          {nc.steps.map((s, i) => <div className="row" key={i}><span className="grow"><span className="main" style={{ fontSize: 15, fontWeight: 600 }}>{STEP_LABEL[s.step]}</span><span className="sub">{s.content} · {s.by} · {hm(s.at)}</span></span></div>)}
        </div>
        {selfVerified && <p className="note">Vérifié par la personne qui a fait l’action corrective : indiqué dans le registre.</p>}
        {!nc.closed && <>
          <select value={step} onChange={(e) => setStep(e.target.value as NcStep['step'])} aria-label="Étape"
            style={{ height: 44, borderRadius: 12, border: 'none', padding: '0 12px', fontSize: 16, background: '#fff' }}>
            {Object.entries(STEP_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Ce qui a été fait" aria-label="Détail de l’étape"
            style={{ minHeight: 70, border: 'none', borderRadius: 12, padding: '10px 14px', fontFamily: 'inherit', fontSize: 16 }} />
          <div className="error" role="alert">{error}</div>
          <button className={`btn ${step === 'cloture' ? 'btn-danger' : 'btn-primary'}`} onClick={add}>{step === 'cloture' ? 'Clôturer l’incident' : 'Ajouter l’étape'}</button>
        </>}
      </>
    );
  }
  return (
    <div className="group">
      {list.length === 0 && <div className="row sub">Aucun incident.</div>}
      {list.map((n) => (
        <button key={n.id} className="row" style={rowBtn} onClick={() => setSel(n.id)}>
          <span className="grow"><span className="main" style={{ fontSize: 16 }}>{n.description}</span><span className="sub">{n.kind} · {hm(n.openedAt)} · {n.openedBy}</span></span>
          <span className={`pill ${n.closed ? 'vert' : 'rouge'}`}>{n.closed ? 'Clôturé' : 'Ouvert'}</span></button>))}
    </div>
  );
}

const INVITE_MSG: Record<string, (p: string, l: string) => string> = {
  fr: (p, l) => `Bonjour ${p}, voici ton accès personnel à NORMA, l’app de l’équipe : ${l}\nTu y trouveras ton planning, tes heures et tes documents. Le lien est valable 48 h et ne sert qu’une fois.`,
  es: (p, l) => `Hola ${p}, aquí tienes tu acceso personal a NORMA, la app del equipo: ${l}\nAhí verás tu planificación, tus horas y tus documentos. El enlace es válido 48 h y solo sirve una vez.`,
  en: (p, l) => `Hi ${p}, here is your personal access to NORMA, the team app: ${l}\nYou will find your schedule, your hours and your documents there. The link is valid for 48 h and works only once.`,
};
const DOC_LABEL: Record<DocKind, string> = { identite: 'Pièce d’identité / permis', avs: 'Carte AVS', bancaire: 'Coordonnées bancaires',
  certificat_medical: 'Certificat médical', autre: 'Autre' };
const dmy = (d: Date) => d.toLocaleDateString('fr-CH');

function Equipe({ api, session }: { api: Api; session: Session }) {
  const [team, setTeam] = useState<Member[]>([]);
  const [acc, setAcc] = useState<Record<string, MemberAccount>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [docs, setDocs] = useState<MemberDoc[]>([]);
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [lang, setLang] = useState('fr');
  const [poste, setPoste] = useState('Aide de cuisine');
  const [code, setCode] = useState<{ who: string; pin: string } | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api.team().then(setTeam);
    api.accounts().then((l) => setAcc(Object.fromEntries(l.map((a) => [a.memberId, a])))).catch(() => undefined);
  }, [api]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setDocs([]); if (open) api.memberDocs(open).then(setDocs).catch(() => undefined); }, [api, open]);
  const postes = ['Aide de cuisine', 'Caisse', 'Chef de cuisine', ...(session.poste === 'Gérant' ? ['Manager'] : [])];
  const isOwner = session.droits.includes('reglages_gerant');
  const run = (f: () => Promise<unknown>) => async () => { setError(''); try { await f(); load(); } catch (e) { setError((e as Error).message); } };

  const add = run(async () => { const pin = await api.addMember(session.token, prenom.trim(), poste, nom.trim(), lang); setCode({ who: prenom.trim(), pin }); setPrenom(''); setNom(''); });
  const reset = (m: Member) => run(async () => setCode({ who: m.prenom, pin: await api.resetPin(session.token, m.id) }));
  const invite = (m: Member) => run(async () => {
    const tok = await api.inviteMember(m.id);
    const link = `${location.origin}/#/invitation/${tok}`;
    const msg = (INVITE_MSG[acc[m.id]?.langue ?? 'fr'] ?? INVITE_MSG.fr)(m.prenom, link);
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  });
  const revoke = (m: Member) => run(async () => { if (confirm(`Retirer l’accès téléphone de ${m.prenom} ?`)) await api.revokeAccess(m.id); });
  const openDoc = (d: MemberDoc) => run(async () => { window.open(await api.docUrl(d.path), '_blank'); });
  const delDoc = (d: MemberDoc) => run(async () => {
    if (!confirm(`Supprimer définitivement « ${d.filename} » ?`)) return;
    await api.deleteDoc(d); setDocs((x) => x.filter((y) => y.id !== d.id));
  });
  const status = (m: Member) => {
    const a = acc[m.id];
    if (!a) return '';
    if (a.compte) return ' · téléphone ✓';
    if (a.invitationJusqua) return ' · invitation envoyée';
    return '';
  };
  return (
    <>
      {code && (
        <div className="group" style={{ padding: 14, textAlign: 'center' }}>
          <div className="sub">Code de {code.who} · affiché une seule fois</div>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: 10, fontVariantNumeric: 'tabular-nums' }}>{code.pin}</div>
          <button className="link" onClick={() => setCode(null)}>C’est noté</button>
        </div>)}
      <div className="group">
        {team.map((m) => {
          const a = acc[m.id]; const canManage = !(m.poste === 'Gérant' && session.poste !== 'Gérant');
          return (<div key={m.id}>
            <button className="row" style={rowBtn} onClick={() => setOpen(open === m.id ? null : m.id)} aria-expanded={open === m.id}>
              <span className="grow"><span className="main">{m.prenom}</span><span className="sub">{m.poste}{m.clockedIn ? ' · pointé' : ''}{status(m)}</span></span>
              {open === m.id ? '⌃' : '›'}</button>
            {open === m.id && (
              <div style={{ padding: '4px 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {canManage && <button className="link" style={{ textAlign: 'left' }} onClick={reset(m)}>Nouveau code tablette</button>}
                {canManage && m.id !== session.memberId && !a?.compte && <button className="link" style={{ textAlign: 'left' }} onClick={invite(m)}>
                  {a?.invitationJusqua ? 'Renvoyer l’invitation par WhatsApp' : 'Inviter sur son téléphone (WhatsApp)'}</button>}
                {a?.invitationJusqua && !a.compte && <span className="sub">Lien valable jusqu’au {a.invitationJusqua.toLocaleString('fr-CH', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                {canManage && a?.compte && m.id !== session.memberId && <button className="link" style={{ textAlign: 'left', color: 'var(--red)' }} onClick={revoke(m)}>Retirer l’accès téléphone</button>}
                <div className="sub" style={{ marginTop: 4 }}>Documents déposés{docs.length ? '' : ' : aucun'}</div>
                {docs.map((d) => (
                  <div key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="link" style={{ textAlign: 'left', flex: 1 }} onClick={openDoc(d)}>{DOC_LABEL[d.kind]} · {d.filename} · {dmy(d.at)}</button>
                    {isOwner && <button className="link" style={{ color: 'var(--red)' }} aria-label={`Supprimer ${d.filename}`} onClick={delDoc(d)}>Supprimer</button>}
                  </div>))}
              </div>)}
          </div>);
        })}
      </div>
      <p className="note">Touchez une personne : nouveau code, invitation sur son téléphone (planning, heures, documents), documents déposés.</p>
      <div className="section-label">Ajouter un membre</div>
      <div className="group">
        <label className="row"><span style={{ width: 80 }}>Prénom</span><input value={prenom} onChange={(e) => setPrenom(e.target.value)} style={{ flex: 1, border: 'none', fontSize: 16, fontFamily: 'inherit' }} /></label>
        <label className="row"><span style={{ width: 80 }}>Nom</span><input value={nom} onChange={(e) => setNom(e.target.value)} style={{ flex: 1, border: 'none', fontSize: 16, fontFamily: 'inherit' }} /></label>
        <label className="row"><span style={{ width: 80 }}>Langue</span>
          <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ flex: 1, border: 'none', fontSize: 16, background: 'transparent' }}><option value="fr">Français</option><option value="es">Español</option><option value="en">English</option></select></label>
        <label className="row"><span style={{ width: 80 }}>Poste</span>
          <select value={poste} onChange={(e) => setPoste(e.target.value)} style={{ flex: 1, border: 'none', fontSize: 16, background: 'transparent' }}>{postes.map((p) => <option key={p}>{p}</option>)}</select></label>
      </div>
      <div className="error" role="alert">{error}</div>
      <button className="btn btn-primary" disabled={prenom.trim().length < 2} onClick={add}>Ajouter et générer le code</button>
    </>
  );
}

/** Envois automatiques : rapport du matin par e-mail (D31) et notifications sur cet iPhone. */
function Envois({ api, session }: { api: Api; session: Session }) {
  const [rs, setRs] = useState<ReportSettings | null>(null);
  const [push, setPush] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api.reportSettings().then(setRs).catch(() => undefined); api.pushEnabled().then(setPush).catch(() => setPush(false)); }, [api]);
  const togglePush = async () => {
    setError(''); setBusy(true);
    try { if (push) await api.pushUnsubscribe(); else await api.pushSubscribe(); setPush(!push); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };
  const owner = session.droits.includes('reglages_gerant');
  return (
    <>
      <div className="section-label">Envois automatiques</div>
      <div className="group">
        <label className="row"><span className="grow"><span className="main">Rapport de la veille par e-mail</span>
          <span className="sub">PDF au Gérant et aux Managers, à imprimer pour le classeur</span></span>
          {rs && <select aria-label="Heure d’envoi du rapport" value={rs.hour} disabled={!owner}
            onChange={async (e) => { const h = Number(e.target.value); await api.setReportHour(h); setRs({ ...rs, hour: h }); }}
            style={{ border: 'none', fontSize: 16, background: 'transparent' }}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h} h</option>)}</select>}</label>
        {rs?.sent.slice(0, 3).map((x) => (
          <div className="row" key={String(x.day)}><span className="grow"><span className="sub">Rapport du {dmy(x.day)} envoyé le {x.at.toLocaleString('fr-CH', { dateStyle: 'short', timeStyle: 'short' })} · {x.to} destinataire(s)</span></span></div>))}
        <div className="row"><span className="grow"><span className="main">Notifications sur cet iPhone</span>
          <span className="sub">Incident, température hors seuil, coupure de courant, oubli de dépointage, nettoyage en retard, rapport envoyé</span></span>
          <button className="link" disabled={busy || push === null} onClick={togglePush}>{push ? 'Désactiver' : 'Activer'}</button></div>
      </div>
      <div className="error" role="alert">{error}</div>
    </>
  );
}
