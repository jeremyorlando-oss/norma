import { useCallback, useEffect, useState } from 'react';
import type { Api, DayStats, Member, Nc, NcStep, Session } from '../api/types';
import { Segmented } from '../components/Controls';

type Tab = 'jour' | 'nc' | 'equipe' | 'plus';
const STEP_LABEL: Record<NcStep['step'], string> = { mesure_immediate: 'Mesure immédiate', evaluation_risque: 'Évaluation du risque',
  action_corrective: 'Action corrective', verification: 'Vérification', cloture: 'Clôture' };
const hm = (d: Date) => d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });

/** Espace Direction (iPhone Gérant / Manager) : version simplifiée, supervision + dépannage (D30). */
export function Direction({ api, onDepannage, onLogout }: { api: Api; onDepannage: (s: Session) => void; onLogout: () => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Tab>('jour');

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
      {tab === 'jour' && <Jour api={api} />}
      {tab === 'nc' && <Incidents api={api} session={session} />}
      {tab === 'equipe' && <Equipe api={api} session={session} />}
      {tab === 'plus' && (
        <div className="group">
          <button className="row" style={rowBtn} onClick={() => onDepannage(session)}>
            <span className="grow"><span className="main">Saisie de dépannage</span><span className="sub">Ouvre les écrans du stand · marqué « iPhone » dans le registre</span></span>›</button>
          <button className="row" style={rowBtn} onClick={async () => {
            const { downloadDailyReport } = await import('../report/download');
            await downloadDailyReport(await api.dayReport(new Date()));
          }}><span className="grow"><span className="main">Rapport du jour (PDF)</span><span className="sub">Envoyé automatiquement chaque soir · ici : générer maintenant</span></span>›</button>
          <button className="row" style={{ ...rowBtn, color: 'var(--red)' }} onClick={() => { setSession(null); onLogout(); }}>Se déconnecter</button>
        </div>)}
    </div>
  );
}
const rowBtn = { width: '100%', border: 'none', background: '#fff', fontSize: 17, textAlign: 'left' } as const;

function Jour({ api }: { api: Api }) {
  const [s, setS] = useState<DayStats | null>(null);
  const [team, setTeam] = useState<Member[]>([]);
  const [open, setOpen] = useState(0);
  useEffect(() => {
    api.dayStats(new Date()).then(setS); api.team().then(setTeam);
    api.nonconformities().then((n) => setOpen(n.filter((x) => !x.closed).length));
  }, [api]);
  if (!s) return null;
  const tile = (n: number, l: string, bad = false) => (
    <div className="group" style={{ padding: 12 }}><div style={{ fontSize: 28, fontWeight: 700, color: bad && n > 0 ? 'var(--red)' : '#000' }}>{n}</div><div className="sub" style={{ fontSize: 13, color: 'var(--text-2)' }}>{l}</div></div>);
  const present = team.filter((m) => m.clockedIn);
  return (
    <>
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

function Equipe({ api, session }: { api: Api; session: Session }) {
  const [team, setTeam] = useState<Member[]>([]);
  const [prenom, setPrenom] = useState('');
  const [poste, setPoste] = useState('Aide de cuisine');
  const [code, setCode] = useState<{ who: string; pin: string } | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.team().then(setTeam), [api]);
  useEffect(() => { load(); }, [load]);
  const postes = ['Aide de cuisine', 'Caisse', 'Chef de cuisine', ...(session.poste === 'Gérant' ? ['Manager'] : [])];

  const add = async () => {
    setError('');
    try { const pin = await api.addMember(session.token, prenom.trim(), poste); setCode({ who: prenom.trim(), pin }); setPrenom(''); load(); }
    catch (e) { setError((e as Error).message); }
  };
  const reset = async (m: Member) => {
    setError('');
    try { setCode({ who: m.prenom, pin: await api.resetPin(session.token, m.id) }); } catch (e) { setError((e as Error).message); }
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
        {team.map((m) => (
          <div className="row" key={m.id}><span className="grow"><span className="main">{m.prenom}</span><span className="sub">{m.poste}{m.clockedIn ? ' · pointé' : ''}</span></span>
            {!(m.poste === 'Gérant' && session.poste !== 'Gérant') && <button className="link" style={{ fontSize: 15 }} onClick={() => reset(m)}>Nouveau code</button>}</div>))}
      </div>
      <div className="section-label">Ajouter un membre</div>
      <div className="group">
        <label className="row"><span style={{ width: 80 }}>Prénom</span><input value={prenom} onChange={(e) => setPrenom(e.target.value)} style={{ flex: 1, border: 'none', fontSize: 16, fontFamily: 'inherit' }} /></label>
        <label className="row"><span style={{ width: 80 }}>Poste</span>
          <select value={poste} onChange={(e) => setPoste(e.target.value)} style={{ flex: 1, border: 'none', fontSize: 16, background: 'transparent' }}>{postes.map((p) => <option key={p}>{p}</option>)}</select></label>
      </div>
      <div className="error" role="alert">{error}</div>
      <button className="btn btn-primary" disabled={prenom.trim().length < 2} onClick={add}>Ajouter et générer le code</button>
    </>
  );
}
