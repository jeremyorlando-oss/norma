import { useCallback, useEffect, useState } from 'react';
import type { Api, CleaningTask, Equipment, EquipmentInput, EquipmentType, Member, OfficialLimit, Session } from '../api/types';
import type { Right } from '../domain/rules';
import { Field, Segmented, inputStyle } from '../components/Controls';

const rowBtn = { width: '100%', border: 'none', background: '#fff', fontSize: 17, textAlign: 'left' } as const;
const TYPES: [EquipmentType, string][] = [['froid_positif', 'Frigo / saladette'], ['froid_negatif', 'Congélateur'], ['cuisson', 'Cuisson / réchauffe à cœur'],
  ['maintien_chaud', 'Maintien au chaud'], ['friteuse', 'Friteuse']];
const NEW_DEFAULT: Record<EquipmentType, { min: number | null; max: number | null }> = { froid_positif: { min: 0, max: 4 }, froid_negatif: { min: null, max: -18 },
  cuisson: { min: 72, max: null }, maintien_chaud: { min: 65, max: null }, friteuse: { min: null, max: 175 } };
export const RIGHT_LABEL: Record<Right, string> = {
  pointage: 'Pointer', prise_poste: 'Prise de poste', nettoyage: 'Valider les nettoyages', signaler_nc: 'Signaler un problème',
  allergenes_lecture: 'Consulter les allergènes', releves: 'Relevés de température, huile, checklists', reception: 'Réceptionner les marchandises',
  preparations: 'Produire des préparations', jeter_lot: 'Jeter un lot', traiter_nc: 'Traiter les incidents', cloturer_nc: 'Clôturer les incidents',
  tableau_bord: 'Voir le tableau de bord', heures_equipe: 'Voir les heures de l’équipe', export: 'Exporter les rapports', equipements: 'Gérer le matériel',
  gestion_equipe: 'Gérer l’équipe et les événements', admin_documents: 'Documents administratifs', reglages_gerant: 'Réglages du Gérant',
};
const LOCKED: Right[] = ['pointage', 'prise_poste', 'signaler_nc'];
const INTERVALS: [number | null, string][] = [[null, 'Sans échéance horaire'], [60, 'Toutes les heures'], [120, 'Toutes les 2 h'], [180, 'Toutes les 3 h'], [240, 'Toutes les 4 h'], [360, 'Toutes les 6 h']];
const num = (v: number | null) => (v === null ? '—' : `${String(v).replace('.', ',').replace('-', '−')} °C`);
const range = (e: { min: number | null; max: number | null }) => (e.min !== null && e.max !== null ? `${num(e.min)} à ${num(e.max)}` : e.min !== null ? `≥ ${num(e.min)}` : `≤ ${num(e.max)}`);
const toNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.').replace('−', '-')));

/** Réglages (Direction) : matériel, plan de nettoyage, droits des postes. */
export function Reglages({ api, session, onBack }: { api: Api; session: Session; onBack: () => void }) {
  const [part, setPart] = useState<'materiel' | 'nettoyage' | 'postes'>('materiel');
  return (
    <>
      <div className="topbar"><button className="link" onClick={onBack}>‹ Plus</button><span className="title">Réglages</span><span style={{ width: 50 }} /></div>
      <Segmented label="Réglages" value={part} onChange={setPart} options={[{ value: 'materiel', label: 'Matériel' }, { value: 'nettoyage', label: 'Nettoyage' }, { value: 'postes', label: 'Postes' }]} />
      {part === 'materiel' && <Materiel api={api} session={session} />}
      {part === 'nettoyage' && <PlanNettoyage api={api} session={session} />}
      {part === 'postes' && <Postes api={api} session={session} />}
    </>
  );
}

function Materiel({ api, session }: { api: Api; session: Session }) {
  const [list, setList] = useState<Equipment[]>([]);
  const [limits, setLimits] = useState<Record<EquipmentType, OfficialLimit> | null>(null);
  const [edit, setEdit] = useState<(EquipmentInput & { minS: string; maxS: string }) | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.equipments().then((l) => setList([...l])), [api]);
  useEffect(() => { load(); api.officialLimits().then(setLimits); }, [api, load]);
  const gerant = session.droits.includes('reglages_gerant');
  const canEdit = session.droits.includes('equipements');
  const open = (e: EquipmentInput) => { setError(''); setEdit({ ...e, minS: e.min === null ? '' : String(e.min), maxS: e.max === null ? '' : String(e.max) }); };
  const save = async () => {
    if (!edit) return;
    try { await api.saveEquipment(session.token, { id: edit.id, name: edit.name, type: edit.type, min: toNum(edit.minS), max: toNum(edit.maxS) }); setEdit(null); load(); }
    catch (x) { setError((x as Error).message); }
  };
  const del = async () => { if (edit?.id) { await api.deleteEquipment(session.token, edit.id); setEdit(null); load(); } };

  if (edit && limits) {
    const l = limits[edit.type];
    const showMin = edit.type === 'froid_positif' || l.min !== null || edit.type === 'cuisson';
    const showMax = edit.type !== 'cuisson' && edit.type !== 'maintien_chaud';
    return (
      <>
        <div className="group">
          <Field label="Nom"><input aria-label="Nom de l’équipement" style={inputStyle} value={edit.name} placeholder="ex. Frigo boissons" onChange={(x) => setEdit({ ...edit, name: x.target.value })} /></Field>
          <Field label="Type"><select aria-label="Type" style={inputStyle} value={edit.type} disabled={!!edit.id && !gerant}
            onChange={(x) => { const t = x.target.value as EquipmentType; const d = NEW_DEFAULT[t];
              setEdit({ ...edit, type: t, min: d.min, max: d.max, minS: d.min === null ? '' : String(d.min), maxS: d.max === null ? '' : String(d.max) }); }}>
            {TYPES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
          {showMin && <Field label="Min °C"><input aria-label="Seuil minimum" inputMode="decimal" style={inputStyle} value={edit.minS} disabled={!gerant} onChange={(x) => setEdit({ ...edit, minS: x.target.value })} /></Field>}
          {showMax && <Field label="Max °C"><input aria-label="Seuil maximum" inputMode="decimal" style={inputStyle} value={edit.maxS} disabled={!gerant} onChange={(x) => setEdit({ ...edit, maxS: x.target.value })} /></Field>}
        </div>
        <p className="note">Limite officielle : {range(l)} ({l.source}). Les seuils peuvent seulement être plus stricts.{!gerant && ' Seuils modifiables par le Gérant uniquement.'}
          {!edit.id && ' Une tâche de nettoyage est créée pour ce matériel, à compléter dans le plan.'}</p>
        <div className="error" role="alert">{error}</div>
        <button className="btn btn-primary" onClick={save}>Enregistrer</button>
        <button className="link" onClick={() => setEdit(null)}>Annuler</button>
        {edit.id && <button className="link" style={{ color: 'var(--red)' }} onClick={del}>Retirer ce matériel</button>}
      </>
    );
  }
  return (
    <>
      <div className="group">
        {list.map((e) => (
          <button key={e.id} className="row" style={rowBtn} disabled={!canEdit} onClick={() => open(e)}>
            <span className="grow"><span className="main">{e.name}</span><span className="sub">{TYPES.find(([t]) => t === e.type)![1]} · {range(e)}</span></span>{canEdit && '›'}</button>))}
        {canEdit && <button className="row" style={{ ...rowBtn, color: 'var(--blue)' }} onClick={() => open({ name: '', type: 'froid_positif', ...NEW_DEFAULT.froid_positif })}>+ Ajouter du matériel</button>}
      </div>
      <p className="note">Retirer un matériel ne supprime pas ses relevés : ils restent dans les registres.</p>
    </>
  );
}

function PlanNettoyage({ api, session }: { api: Api; session: Session }) {
  const [list, setList] = useState<CleaningTask[]>([]);
  const [edit, setEdit] = useState<{ id?: string; name: string; product: string; frequency: string; interval: number | null } | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.cleaningTasks(new Date()).then(setList), [api]);
  useEffect(() => { load(); }, [load]);
  const gerant = session.droits.includes('reglages_gerant');
  const save = async () => { if (!edit) return; try { await api.saveCleaningTask(session.token, edit); setEdit(null); load(); } catch (x) { setError((x as Error).message); } };
  const del = async () => { if (edit?.id) { await api.deleteCleaningTask(session.token, edit.id); setEdit(null); load(); } };

  if (edit) return (
    <>
      <div className="group">
        <Field label="Zone"><input aria-label="Zone ou objet" style={inputStyle} value={edit.name} placeholder="ex. Plan de travail" onChange={(x) => setEdit({ ...edit, name: x.target.value })} /></Field>
        <Field label="Produit"><input aria-label="Produit, dosage, protection" style={inputStyle} value={edit.product} placeholder="produit · dosage · gants" onChange={(x) => setEdit({ ...edit, product: x.target.value })} /></Field>
        <Field label="Fréquence"><input aria-label="Fréquence" style={inputStyle} value={edit.frequency} placeholder="ex. Fin de service" onChange={(x) => setEdit({ ...edit, frequency: x.target.value })} /></Field>
        <Field label="Rappel"><select aria-label="Rappel" style={inputStyle} value={edit.interval ?? ''} onChange={(x) => setEdit({ ...edit, interval: x.target.value === '' ? null : Number(x.target.value) })}>
          {INTERVALS.map(([v, l]) => <option key={l} value={v ?? ''}>{l}</option>)}</select></Field>
      </div>
      <p className="note">Le plan écrit doit indiquer le produit, le dosage et la protection (BPHR 2.3.4). Le rappel colore la tablette en jaune 15 min avant, en rouge après.</p>
      <div className="error" role="alert">{error}</div>
      <button className="btn btn-primary" onClick={save}>Enregistrer</button>
      <button className="link" onClick={() => setEdit(null)}>Annuler</button>
      {edit.id && <button className="link" style={{ color: 'var(--red)' }} onClick={del}>Retirer du plan</button>}
    </>
  );
  return (
    <>
      <div className="group">
        {list.map((t) => (
          <button key={t.id} className="row" style={rowBtn} disabled={!gerant} onClick={() => { setError(''); setEdit({ id: t.id, name: t.name, product: t.product, frequency: t.frequency, interval: t.interval ?? null }); }}>
            <span className="grow"><span className="main">{t.name}</span><span className="sub">{t.frequency} · {t.product}</span></span>{gerant && '›'}</button>))}
        {gerant && <button className="row" style={{ ...rowBtn, color: 'var(--blue)' }} onClick={() => setEdit({ name: '', product: '', frequency: '', interval: null })}>+ Ajouter une zone</button>}
      </div>
      {!gerant && <p className="note">Lecture seule : le plan de nettoyage est modifié par le Gérant.</p>}
    </>
  );
}

function Postes({ api, session }: { api: Api; session: Session }) {
  const [postes, setPostes] = useState<Record<string, Right[]>>({});
  const [extras, setExtras] = useState<Record<string, Right[]>>({});
  const [team, setTeam] = useState<Member[]>([]);
  const [poste, setPoste] = useState('Manager');
  const [who, setWho] = useState<Member | null>(null);
  const load = useCallback(() => { api.postes().then(setPostes); api.extraRights().then(setExtras); api.team().then(setTeam); }, [api]);
  useEffect(() => { load(); }, [load]);
  const gerant = session.droits.includes('reglages_gerant');
  const all = Object.keys(RIGHT_LABEL).filter((r) => r !== 'reglages_gerant') as Right[];
  const box = (on: boolean, locked: boolean) => <span style={{ fontSize: 20, color: locked ? '#C7C7CC' : on ? 'var(--blue)' : '#C7C7CC' }}>{on ? '✓' : '○'}</span>;
  if (!postes[poste]) return null;

  if (who) {
    const base = postes[who.poste] ?? [];
    const mine = extras[who.id] ?? [];
    const toggle = async (r: Right) => { await api.setExtraRights(session.token, who.id, mine.includes(r) ? mine.filter((x) => x !== r) : [...mine, r]); load(); };
    return (
      <>
        <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setWho(null)}>‹ Postes</button>
        <div><div style={{ fontSize: 22, fontWeight: 700 }}>{who.prenom}</div><div className="sub" style={{ color: 'var(--text-2)' }}>{who.poste} · droits en plus de son poste</div></div>
        <div className="group">
          {all.filter((r) => !base.includes(r)).map((r) => (
            <button key={r} className="row" style={rowBtn} onClick={() => toggle(r)}><span className="grow">{RIGHT_LABEL[r]}</span>{box(mine.includes(r), false)}</button>))}
        </div>
        <p className="note">Pris en compte à sa prochaine ouverture de session.</p>
      </>
    );
  }
  const rights = postes[poste];
  const toggle = async (r: Right) => { if (!gerant || LOCKED.includes(r) || poste === 'Gérant') return;
    await api.setPosteRights(session.token, poste, rights.includes(r) ? rights.filter((x) => x !== r) : [...rights, r]); load(); };
  return (
    <>
      <select aria-label="Poste" style={{ ...inputStyle, textAlign: 'left', background: '#fff', borderRadius: 10, padding: '12px 16px', fontSize: 17 }} value={poste} onChange={(x) => setPoste(x.target.value)}>
        {Object.keys(postes).map((p) => <option key={p}>{p}</option>)}</select>
      <div className="group">
        {all.map((r) => (
          <button key={r} className="row" style={rowBtn} onClick={() => toggle(r)}>
            <span className="grow">{RIGHT_LABEL[r]}{LOCKED.includes(r) && <span className="sub">Toujours actif</span>}</span>{box(rights.includes(r), LOCKED.includes(r) || poste === 'Gérant')}</button>))}
      </div>
      <p className="note">{poste === 'Gérant' ? 'Le Gérant a tous les droits.' : gerant ? 'Touchez un droit pour l’activer ou le retirer pour tout le poste.' : 'Lecture seule : les droits sont modifiés par le Gérant.'}</p>
      {gerant && <>
        <div className="section-label">Droits en plus pour une personne</div>
        <div className="group">
          {team.filter((m) => m.poste !== 'Gérant').map((m) => (
            <button key={m.id} className="row" style={rowBtn} onClick={() => setWho(m)}>
              <span className="grow"><span className="main">{m.prenom}</span><span className="sub">{m.poste}{extras[m.id]?.length ? ` · + ${extras[m.id].map((r) => RIGHT_LABEL[r].toLowerCase()).join(', ')}` : ''}</span></span>›</button>))}
        </div></>}
    </>
  );
}
