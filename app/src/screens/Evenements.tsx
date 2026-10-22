import { useCallback, useEffect, useState } from 'react';
import type { Api, Equipment, EventInfo, EventInput, EventSummary, Member, Session } from '../api/types';
import { Field, inputStyle } from '../components/Controls';

const dmy = (d: Date) => d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const rowBtn = { width: '100%', border: 'none', background: '#fff', fontSize: 17, textAlign: 'left' } as const;
const empty = (): EventInput => ({ name: '', place: '', start: new Date(), end: new Date(), organizer: '', ofcoRef: '', team: [], equipment: [], notes: '' });

/** Événements : fiche, liste, bilan (espace Direction). */
export function Evenements({ api, session }: { api: Api; session: Session }) {
  const [list, setList] = useState<EventInfo[]>([]);
  const [edit, setEdit] = useState<EventInput | null>(null);
  const [open, setOpen] = useState<EventInfo | null>(null);
  const load = useCallback(() => api.events().then(setList), [api]);
  useEffect(() => { load(); }, [load]);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const state = (e: EventInfo) => (now < e.start ? ['À venir', 'jaune'] : now > e.end ? ['Terminé', ''] : ['En cours', 'vert']);

  if (edit) return <Fiche api={api} session={session} value={edit} onDone={() => { setEdit(null); load(); }} />;
  if (open) return <Bilan api={api} session={session} ev={open} onBack={() => setOpen(null)} onEdit={() => { setEdit(open); setOpen(null); }} />;
  return (
    <>
      <div className="section-label">Événements</div>
      <div className="group">
        {list.map((e) => { const [l, c] = state(e); return (
          <button key={e.id} className="row" style={rowBtn} onClick={() => setOpen(e)}>
            <span className="grow"><span className="main">{e.name}</span><span className="sub">{e.place} · {dmy(e.start)} → {dmy(e.end)}</span></span>
            <span className={`pill ${c}`}>{l}</span></button>); })}
        <button className="row" style={{ ...rowBtn, color: 'var(--blue)' }} onClick={() => setEdit(empty())}>+ Nouvel événement</button>
      </div>
    </>
  );
}

function Fiche({ api, session, value, onDone }: { api: Api; session: Session; value: EventInput; onDone: () => void }) {
  const [e, setE] = useState(value);
  const [team, setTeam] = useState<Member[]>([]);
  const [eqs, setEqs] = useState<Equipment[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { api.team().then(setTeam); api.equipments().then(setEqs); }, [api]);
  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => setE({ ...e, [k]: v });
  const toggle = (k: 'team' | 'equipment', id: string) => set(k, e[k].includes(id) ? e[k].filter((x) => x !== id) : [...e[k], id]);
  const save = async () => { try { await api.saveEvent(session.token, e); onDone(); } catch (x) { setError((x as Error).message); } };
  const check = (on: boolean) => <span style={{ fontSize: 20, color: on ? 'var(--blue)' : '#C7C7CC' }}>{on ? '✓' : '○'}</span>;
  return (
    <>
      <div className="topbar"><button className="link" onClick={onDone}>Annuler</button><span className="title">{value.id ? 'Modifier' : 'Nouvel événement'}</span><button className="link" style={{ fontWeight: 600 }} onClick={save}>OK</button></div>
      <div className="group">
        <Field label="Nom"><input aria-label="Nom" style={inputStyle} value={e.name} placeholder="ex. Festival de…" onChange={(x) => set('name', x.target.value)} /></Field>
        <Field label="Lieu"><input aria-label="Lieu" style={inputStyle} value={e.place} onChange={(x) => set('place', x.target.value)} /></Field>
        <Field label="Début"><input aria-label="Début" type="date" style={inputStyle} value={iso(e.start)} onChange={(x) => x.target.value && set('start', parse(x.target.value))} /></Field>
        <Field label="Fin"><input aria-label="Fin" type="date" style={inputStyle} value={iso(e.end)} onChange={(x) => x.target.value && set('end', parse(x.target.value))} /></Field>
        <Field label="Organisateur"><input aria-label="Organisateur" style={inputStyle} value={e.organizer} onChange={(x) => set('organizer', x.target.value)} /></Field>
        <Field label="Annonce OFCO"><input aria-label="Annonce OFCO" style={inputStyle} value={e.ofcoRef} placeholder="n° ou date d’envoi" onChange={(x) => set('ofcoRef', x.target.value)} /></Field>
      </div>
      <p className="note">L’annonce à l’OFCO (art. 20 ODAlOUs) est à faire avant l’événement ; notez ici sa référence.</p>
      <div className="section-label">Équipe prévue</div>
      <div className="group">{team.map((m) => <button key={m.id} className="row" style={rowBtn} onClick={() => toggle('team', m.id)}><span className="grow">{m.prenom} <span className="sub">{m.poste}</span></span>{check(e.team.includes(m.id))}</button>)}</div>
      <div className="section-label">Matériel emporté</div>
      <div className="group">{eqs.map((q) => <button key={q.id} className="row" style={rowBtn} onClick={() => toggle('equipment', q.id)}><span className="grow">{q.name}</span>{check(e.equipment.includes(q.id))}</button>)}</div>
      <div className="group"><Field label="Notes"><input aria-label="Notes" style={inputStyle} value={e.notes} placeholder="électricité, eau, accès…" onChange={(x) => set('notes', x.target.value)} /></Field></div>
      <div className="error" role="alert">{error}</div>
      <button className="btn btn-primary" onClick={save}>Enregistrer l’événement</button>
    </>
  );
}

function Bilan({ api, session, ev, onBack, onEdit }: { api: Api; session: Session; ev: EventInfo; onBack: () => void; onEdit: () => void }) {
  const [s, setS] = useState<EventSummary | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api.eventSummary(ev.id, new Date()).then(setS); }, [api, ev.id]);
  const tile = (n: number | string, l: string, bad = false) => (
    <div className="group" style={{ padding: 12 }}><div style={{ fontSize: 26, fontWeight: 700, color: bad && Number(n) > 0 ? 'var(--red)' : '#000' }}>{n}</div><div className="sub" style={{ fontSize: 13, color: 'var(--text-2)' }}>{l}</div></div>);
  const del = async () => { try { await api.deleteEvent(session.token, ev.id); onBack(); } catch (x) { setError((x as Error).message); } };
  return (
    <>
      <div className="topbar"><button className="link" onClick={onBack}>‹ Événements</button><span className="title">Bilan</span><button className="link" onClick={onEdit}>Modifier</button></div>
      <div><div style={{ fontSize: 22, fontWeight: 700 }}>{ev.name}</div>
        <div className="sub" style={{ color: 'var(--text-2)' }}>{ev.place} · {dmy(ev.start)} → {dmy(ev.end)}{ev.organizer ? ` · ${ev.organizer}` : ''}</div></div>
      <div className="group">
        <div className="row"><span className="grow">Annonce OFCO</span>{ev.ofcoRef ? <span className="pill vert">{ev.ofcoRef}</span> : <span className="pill rouge">À faire</span>}</div>
        {s && <div className="row"><span className="grow">Checklist de montage</span>{s.checklistsMontage ? <span className="pill vert">Faite</span> : <span className="pill jaune">Pas encore</span>}</div>}
        {ev.notes && <div className="row sub">{ev.notes}</div>}
      </div>
      {s && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        {tile(s.jours, 'Jours')}{tile(s.releves, 'Relevés')}{tile(s.relevesRouges, 'Hors seuil', true)}
        {tile(s.ncOuvertes, 'Incidents ouverts', true)}{tile(s.ncCloturees, 'Incidents clôturés')}{tile(s.nettoyages, 'Nettoyages')}
        {tile(s.receptions, 'Réceptions')}{tile(s.lotsProduits, 'Lots produits')}{tile(s.lotsJetes, 'Lots jetés')}
        {tile(s.heures, 'Heures équipe')}{tile(s.personnes, 'Personnes')}
      </div>}
      <p className="note">Chiffres tirés des registres. Les rapports PDF de chaque jour restent la preuve officielle.</p>
      {session.droits.includes('reglages_gerant') && <button className="link" style={{ color: 'var(--red)' }} onClick={del}>Supprimer l’événement</button>}
      <div className="error" role="alert">{error}</div>
    </>
  );
}
