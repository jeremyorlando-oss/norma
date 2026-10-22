import { useEffect, useMemo, useState } from 'react';
import type { Api, Equipment, Session } from '../api/types';
import { Wheel } from '../components/Wheel';
import { formatTemp, readingStatus } from '../domain/rules';

const COL = { vert: 'var(--green)', jaune: '#000', rouge: 'var(--red)' };
const BAND = { vert: 'var(--green-bg)', jaune: 'var(--yellow)', rouge: 'var(--red-bg)' };
const LABEL = { vert: '✓ Conforme', jaune: '! Conforme · proche de la limite', rouge: '✕ Non conforme' };
const ACTIONS = ['Porte, joint et réglage vérifiés', 'Produits isolés', 'Produits éliminés', 'Responsable averti'];

// Températures de −40,0 à +120,0 °C par pas de 0,1
const MIN_T = -400, MAX_T = 1200;

export function Releve({ api, session, onBack }: { api: Api; session: Session; onBack: () => void }) {
  const [eqs, setEqs] = useState<Equipment[]>([]);
  const [eqIdx, setEqIdx] = useState(0);
  const [t, setT] = useState(35);          // dixièmes de degré
  const [step, setStep] = useState<'saisie' | 'ecart' | 'ok'>('saisie');
  const [actions, setActions] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => { api.equipments().then((e) => { setEqs(e); setT(Math.round(e[0].defaultValue * 10)); }); }, [api]);
  const eq = eqs[eqIdx];
  const status = useMemo(() => (eq ? readingStatus(t / 10, eq.min, eq.max) : 'vert'), [eq, t]);
  if (!eq) return null;
  const seuil = eq.min !== null && eq.max !== null ? `${eq.min} à ${eq.max} °C` : eq.max !== null ? `≤ ${formatTemp(eq.max)}` : `≥ ${formatTemp(eq.min!)}`;

  const save = async () => {
    try { await api.releve(session.token, eq.id, t / 10, actions); setStep('ok'); setTimeout(onBack, 900); }
    catch (e) { setError((e as Error).message); }
  };

  if (step === 'ok') return <div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}><span className="badge vert">✓ Relevé enregistré</span></div>;

  if (step === 'ecart') return (
    <div className="screen">
      <div className="topbar"><button className="link" onClick={() => setStep('saisie')}>‹ Relevé</button><span className="title">Hors seuil</span><span style={{ width: 70 }} /></div>
      <div className="group row"><span style={{ fontSize: 40, fontWeight: 300, color: 'var(--red)' }}>{formatTemp(t / 10)}</span>
        <span className="grow"><b style={{ color: 'var(--red)' }}>Non conforme</b><span className="sub">{eq.name} · seuil {seuil}</span></span></div>
      <div className="section-label">Action corrective · obligatoire</div>
      <div className="group">
        {ACTIONS.map((a) => (
          <label key={a} className="row" style={{ fontSize: 17 }}>
            <input type="checkbox" style={{ width: 22, height: 22, accentColor: 'var(--blue)' }} checked={actions.includes(a)}
              onChange={(e) => setActions(e.target.checked ? [...actions, a] : actions.filter((x) => x !== a))} /> {a}
          </label>))}
      </div>
      <div className="group" style={{ background: 'var(--red-bg)', padding: '12px 16px', fontSize: 13, lineHeight: '18px' }}>
        Ce relevé reste <b>non conforme</b> dans le registre. Une non-conformité est ouverte automatiquement.</div>
      <div className="error" role="alert">{error}</div>
      <div style={{ marginTop: 'auto' }}><button className="btn btn-danger" disabled={actions.length === 0} onClick={save}>Enregistrer et ouvrir la NC</button></div>
    </div>
  );

  return (
    <div className="screen">
      <div className="topbar"><button className="link" onClick={onBack}>‹ Retour</button><span className="title">Relevé</span><span style={{ width: 70 }} /></div>
      <div className="section-label">Équipement · seuil {seuil}</div>
      <div className="group">
        <Wheel ariaLabel="Équipement" count={eqs.length} index={eqIdx} rowHeight={44} visible={3} centerSize={20}
          label={(i) => eqs[i].name} onChange={(i) => { setEqIdx(i); setT(Math.round(eqs[i].defaultValue * 10)); }} />
      </div>
      <div className="group" style={{ padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ width: '100%' }}>
          <Wheel ariaLabel="Température" reverse count={MAX_T - MIN_T + 1} index={t - MIN_T} onChange={(i) => setT(i + MIN_T)}
            label={(i) => formatTemp((i + MIN_T) / 10)} color={COL[status]} bandColor={BAND[status]} bandBorder={COL[status]} />
        </div>
        <span className={`badge ${status}`}>{LABEL[status]}</span>
        <span className="sub" style={{ fontSize: 13, color: 'var(--text-3)' }}>Glissez la molette vers le haut ou le bas</span>
      </div>
      <div className="error" role="alert">{error}</div>
      <div style={{ marginTop: 'auto' }}>
        {status === 'rouge'
          ? <button className="btn btn-danger" onClick={() => setStep('ecart')}>Continuer · action corrective</button>
          : <button className="btn btn-primary" onClick={save}>Enregistrer</button>}
      </div>
    </div>
  );
}
