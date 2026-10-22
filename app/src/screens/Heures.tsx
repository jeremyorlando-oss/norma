import { useCallback, useEffect, useState } from 'react';
import type { Api, EventInfo, HoursAlert, Session, TimeEntry } from '../api/types';
import { Segmented } from '../components/Controls';
import { breakMinutes, fmtMin, workedMinutes } from '../domain/hours';

const hm = (d: Date) => d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
const dm = (d: Date) => d.toLocaleDateString('fr-CH', { weekday: 'short', day: '2-digit', month: '2-digit' });
const local = (d: Date | null) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
const fromLocal = (s: string) => (s ? new Date(s) : null);
const rowBtn = { width: '100%', border: 'none', background: '#fff', fontSize: 16, textAlign: 'left' } as const;
type Range = 'jour' | 'evenement' | 'semaine';

/** Alerte « oubli de dépointage » (onglet Jour). */
export function HoursAlerts({ api, onOpen }: { api: Api; onOpen: () => void }) {
  const [list, setList] = useState<HoursAlert[]>([]);
  useEffect(() => { api.hoursAlerts(new Date()).then(setList); }, [api]);
  if (!list.length) return null;
  return (
    <button className="group" style={{ ...rowBtn, background: 'var(--red-bg)', padding: '12px 16px' }} onClick={onOpen}>
      <b style={{ color: 'var(--red)' }}>Oubli de dépointage ?</b>
      {list.map((a) => <div key={a.entryId} style={{ fontSize: 15 }}>{a.prenom} pointé depuis {dm(a.since)} {hm(a.since)} ({a.hours} h) · à corriger</div>)}
    </button>
  );
}

/** Heures de l'équipe : pauses, corrections tracées, récapitulatif et export (OLT 1 art. 73). */
export function Heures({ api, session }: { api: Api; session: Session }) {
  const [range, setRange] = useState<Range>('jour');
  const [list, setList] = useState<TimeEntry[]>([]);
  const [ev, setEv] = useState<EventInfo | null>(null);
  const [edit, setEdit] = useState<TimeEntry | null>(null);
  const now = new Date();
  const load = useCallback(async () => {
    const e = await api.currentEvent(new Date()); setEv(e);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const [from, to] = range === 'jour' ? [t, new Date(t.getTime() + 86_400_000)] : range === 'semaine' ? [new Date(t.getTime() - 6 * 86_400_000), new Date(t.getTime() + 86_400_000)]
      : e ? [e.start, new Date(e.end.getTime() + 86_400_000)] : [t, t];
    let l = await api.timeEntries(from, to);
    if (range === 'evenement') l = l.filter((x) => e && x.eventId === e.id);
    setList(l);
  }, [api, range]);
  useEffect(() => { load(); }, [load]);

  if (edit) return <Correction api={api} session={session} entry={edit} onDone={() => { setEdit(null); load(); }} />;
  const totals = new Map<string, { prenom: string; min: number; pause: number; jours: Set<string> }>();
  for (const e of list) {
    const t = totals.get(e.memberId) ?? { prenom: e.prenom, min: 0, pause: 0, jours: new Set() };
    t.min += workedMinutes(e, now); t.pause += breakMinutes(e, now); t.jours.add(e.start.toDateString()); totals.set(e.memberId, t);
  }
  const csv = () => {
    const rows = [['Personne', 'Poste', 'Date', 'Arrivée', 'Départ', 'Pauses (min)', 'Travaillé (h)', 'Corrections'],
      ...list.slice().reverse().map((e) => [e.prenom, e.poste, e.start.toLocaleDateString('fr-CH'), hm(e.start), e.end ? hm(e.end) : 'en service',
        String(breakMinutes(e, now)), (workedMinutes(e, now) / 60).toFixed(2), e.corrections.map((c) => `${c.by}: ${c.what} (${c.reason})`).join(' | ')])];
    const blob = new Blob(['﻿' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `NORMA-heures-${range}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };
  return (
    <>
      <div className="section-label">Heures de l’équipe</div>
      <Segmented label="Période" value={range} onChange={setRange}
        options={[{ value: 'jour', label: 'Aujourd’hui' }, { value: 'evenement', label: ev ? 'Événement' : 'Événement —' }, { value: 'semaine', label: '7 jours' }]} />
      <div className="group">
        {list.length === 0 && <div className="row sub">Aucun pointage sur cette période.</div>}
        {list.map((e) => {
          const forgot = !e.end && now.getTime() - e.start.getTime() > 10 * 3_600_000;
          return (
            <button key={e.id} className="row" style={rowBtn} onClick={() => setEdit(e)}>
              <span className="grow"><span className="main">{e.prenom} · {dm(e.start)}</span>
                <span className="sub">{hm(e.start)} → {e.end ? hm(e.end) : 'en service'} · pauses {breakMinutes(e, now)} min{e.corrections.length ? ` · corrigé ${e.corrections.length}×` : ''}</span></span>
              <span className={`pill ${forgot ? 'rouge' : e.end ? '' : 'vert'}`}>{forgot ? 'Oubli ?' : fmtMin(workedMinutes(e, now))}</span></button>);
        })}
      </div>
      {totals.size > 0 && <>
        <div className="section-label">Récapitulatif</div>
        <div className="group">
          {[...totals.values()].map((t) => (
            <div className="row" key={t.prenom}><span className="grow"><span className="main">{t.prenom}</span><span className="sub">{t.jours.size} jour(s) · pauses {fmtMin(t.pause)}</span></span><b>{fmtMin(t.min)}</b></div>))}
        </div>
        <button className="link" onClick={csv}>Exporter pour les salaires (tableur)</button></>}
      <p className="note">Registre conservé au moins 5 ans (OLT 1 art. 73 al. 2). Une correction garde l’ancienne valeur, l’auteur et le motif. Alerte « oubli » après 10 h pointé (règle interne).</p>
    </>
  );
}

function Correction({ api, session, entry, onDone }: { api: Api; session: Session; entry: TimeEntry; onDone: () => void }) {
  const [start, setStart] = useState(local(entry.start));
  const [end, setEnd] = useState(local(entry.end));
  const [breaks, setBreaks] = useState(entry.breaks.map((b) => ({ s: local(b.start), e: local(b.end) })));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const inp = { border: 'none', fontFamily: 'inherit', fontSize: 15, background: 'transparent', textAlign: 'right' } as const;
  const save = async () => {
    try {
      await api.correctEntry(session.token, entry.id, { start: fromLocal(start)!, end: fromLocal(end),
        breaks: breaks.filter((b) => b.s).map((b) => ({ start: fromLocal(b.s)!, end: fromLocal(b.e) })) }, reason);
      onDone();
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <>
      <div className="topbar"><button className="link" onClick={onDone}>‹ Heures</button><span className="title">{entry.prenom}</span><span style={{ width: 60 }} /></div>
      <div className="group">
        <label className="row"><span className="grow">Arrivée</span><input aria-label="Arrivée" type="datetime-local" style={inp} value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="row"><span className="grow">Départ</span><input aria-label="Départ" type="datetime-local" style={inp} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <div className="section-label">Pauses</div>
      <div className="group">
        {breaks.map((b, i) => (
          <div className="row" key={i} style={{ flexWrap: 'wrap', gap: 6 }}>
            <input aria-label={`Début pause ${i + 1}`} type="datetime-local" style={inp} value={b.s} onChange={(e) => setBreaks(breaks.map((x, j) => (j === i ? { ...x, s: e.target.value } : x)))} />
            <span>→</span>
            <input aria-label={`Fin pause ${i + 1}`} type="datetime-local" style={inp} value={b.e} onChange={(e) => setBreaks(breaks.map((x, j) => (j === i ? { ...x, e: e.target.value } : x)))} />
            <button className="link" style={{ color: 'var(--red)' }} onClick={() => setBreaks(breaks.filter((_, j) => j !== i))}>Retirer</button>
          </div>))}
        <button className="row link" style={{ width: '100%' }} onClick={() => setBreaks([...breaks, { s: start, e: '' }])}>+ Ajouter une pause</button>
      </div>
      <div className="group"><label className="row"><span style={{ width: 70 }}>Motif</span>
        <input aria-label="Motif" style={{ ...inp, flex: 1, textAlign: 'left' }} placeholder="ex. a oublié de dépointer, parti à 22:15" value={reason} onChange={(e) => setReason(e.target.value)} /></label></div>
      {entry.corrections.length > 0 && <>
        <div className="section-label">Historique</div>
        <div className="group">{entry.corrections.map((c, i) => <div className="row sub" key={i}>{c.at.toLocaleString('fr-CH')} · {c.by} : {c.what} — {c.reason}</div>)}</div></>}
      <div className="error" role="alert">{error}</div>
      <button className="btn btn-primary" onClick={save}>Enregistrer la correction</button>
    </>
  );
}
