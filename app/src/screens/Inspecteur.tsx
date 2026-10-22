import { useEffect, useState } from 'react';
import type { Api, InspectorAccess, InspectorInfo } from '../api/types';
import type { DayReport } from '../report/dailyReport';
import { Segmented } from '../components/Controls';

const hm = (d: Date) => d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
const days = () => Array.from({ length: 8 }, (_, i) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i); return d; });

function Table({ title, head, rows, bad }: { title: string; head: string[]; rows: string[][]; bad?: boolean[] }) {
  return (
    <>
      <div className="section-label">{title} · {rows.length}</div>
      <div className="group" style={{ overflowX: 'auto' }}>
        {rows.length === 0 ? <div className="row sub">Aucun enregistrement.</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{head.map((h) => <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-2)', fontWeight: 600 }}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i} style={{ borderTop: '0.5px solid #E5E5EA', background: bad?.[i] ? 'var(--red-bg)' : undefined }}>
              {r.map((c, j) => <td key={j} style={{ padding: '8px 10px', verticalAlign: 'top' }}>{c}</td>)}</tr>)}</tbody>
          </table>)}
      </div>
    </>
  );
}

/** Mode inspecteur : lecture seule, fermeture automatique, chaque consultation est journalisée. */
export function Inspecteur({ api, access, onClose }: { api: Api; access: InspectorAccess; onClose: () => void }) {
  const [part, setPart] = useState<'registres' | 'plan' | 'documents'>('registres');
  const [day, setDay] = useState(days()[0]);
  const [r, setR] = useState<DayReport | null>(null);
  const [info, setInfo] = useState<InspectorInfo | null>(null);
  const close = async () => { await api.closeInspector(access.token); onClose(); };
  useEffect(() => { const t = window.setTimeout(close, access.until.getTime() - Date.now()); return () => window.clearTimeout(t); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.inspectorDay(access.token, day).then(setR).catch(onClose); }, [api, access.token, day]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.inspectorInfo(access.token).then(setInfo).catch(onClose); }, [api, access.token]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="screen">
      <div style={{ background: 'var(--yellow)', borderRadius: 12, padding: '10px 14px', fontSize: 14 }}>
        <b>Contrôle officiel · lecture seule</b><br />Ouvert par {access.openedBy} · se ferme à {hm(access.until)} · consultations enregistrées</div>
      <div><div className="eyebrow">{r?.company.name}</div><h1 className="h1">Registres HACCP</h1></div>
      <Segmented label="Partie" value={part} onChange={setPart} options={[{ value: 'registres', label: 'Registres' }, { value: 'plan', label: 'Seuils et plan' }, { value: 'documents', label: 'Documents' }]} />

      {part === 'registres' && <>
        <select aria-label="Jour" style={{ border: 'none', borderRadius: 10, padding: '12px 14px', fontSize: 17, background: '#fff' }}
          value={day.toDateString()} onChange={(e) => setDay(days().find((d) => d.toDateString() === e.target.value)!)}>
          {days().map((d) => <option key={d.toDateString()} value={d.toDateString()}>{d.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })}</option>)}
        </select>
        {r && <>
          <div className="sub" style={{ color: 'var(--text-2)' }}>{r.event}</div>
          <button className="btn" style={{ background: '#fff', color: 'var(--blue)' }} onClick={async () => { const { downloadDailyReport } = await import('../report/download'); await downloadDailyReport(r); }}>
            Télécharger le rapport PDF de ce jour</button>
          <Table title="Températures" head={['Heure', 'Équipement', 'Valeur', 'Par']} rows={r.readings.map((x) => [x.time, x.equipment, x.value, x.by])} bad={r.readings.map((x) => x.status === 'rouge')} />
          <Table title="Huile de friture" head={['Heure', 'Friteuse', 'Moment', 'Temp.', 'Polaires', 'Par']} rows={r.oil.map((x) => [x.time, x.fryer, x.moment, x.temp, x.polar, x.by])} />
          <Table title="Réceptions" head={['Heure', 'Fournisseur', 'Produit', 'Lot', 'DLC', 'Temp.', 'Résultat']} rows={r.receptions.map((x) => [x.time, x.supplier, x.product, x.lot, x.dlc, x.temp, x.result])} />
          <Table title="Nettoyages" head={['Heure', 'Zone', 'Produit', 'Par']} rows={[...r.cleaning.map((x) => [x.time, x.item, x.product, x.by]), ...r.cleaningMissed.map((x) => [x.due, x.item, 'NON FAIT', '—'])]}
            bad={[...r.cleaning.map(() => false), ...r.cleaningMissed.map(() => true)]} />
          <Table title="Lots de préparations" head={['Lot', 'Recette', 'Par', 'Limite', 'Jeté']} rows={r.lots.map((x) => [x.lot, x.recipe, x.by, x.useBy, x.disposed])} />
          <Table title="Incidents et actions correctives" head={['Heure', 'Type', 'Description', 'Statut', 'Suivi']} rows={r.ncs.map((x) => [x.opened, x.kind, x.description, x.status, x.steps.join(' · ')])} bad={r.ncs.map((x) => x.status !== 'Clôturée')} />
          <Table title="Prise de poste (hygiène du personnel)" head={['Personne', 'Poste', 'Résultat']} rows={r.attendance.map((x) => [x.name, x.poste, x.apte === null ? 'Non faite' : x.apte ? 'Apte' : 'Non apte'])} bad={r.attendance.map((x) => x.apte !== true)} />
        </>}
      </>}

      {part === 'plan' && info && <>
        <Table title="Seuils appliqués et sources" head={['Contrôle', 'Seuil', 'Source']} rows={info.thresholds.map((x) => [x.label, x.value, x.source])} />
        <Table title="Formations hygiène (attestations)" head={['Personne', 'Date', 'Quiz']} rows={info.trainings.map((x) => [x.name, x.at, `${x.score}/5`])} />
        <div className="group row"><span className="grow">Dernière revue du plan HACCP</span><b>{info.haccpReview ? info.haccpReview.toLocaleDateString('fr-CH') : 'aucune enregistrée'}</b></div>
      </>}
      {part === 'documents' && info && <>
        <Table title="Documents du stand" head={['Document', 'État', 'Détail']} rows={info.documents.map((d) => [d.name, d.status === 'ok' ? 'OK' : d.status === 'manquant' ? 'Manquant' : 'À mettre à jour', d.detail])} />
        <Table title="Événements" head={['Événement', 'Lieu', 'Dates', 'Annonce OFCO']} rows={info.events.map((e) => [e.name, e.place, e.dates, e.ofco])} />
      </>}

      <div style={{ marginTop: 'auto' }}><button className="btn btn-outline-danger" onClick={close}>Terminer le contrôle</button></div>
    </div>
  );
}
