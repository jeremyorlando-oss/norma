import { useT } from '../i18n';
import { useEffect, useState } from 'react';
import type { Api, Equipment, OilInput, Session } from '../api/types';
import { Segmented, TopBar } from '../components/Controls';
import { Wheel } from '../components/Wheel';
import { readingStatus } from '../domain/rules';

const DEFECTS = [['couleur', 'Couleur foncée'], ['odeur', 'Odeur forte'], ['mousse', 'Mousse'], ['fumee', 'Fumée']] as const;
const COL = { vert: 'var(--green)', jaune: '#000', rouge: 'var(--red)' };
const BAND = { vert: 'var(--green-bg)', jaune: 'var(--yellow)', rouge: 'var(--red-bg)' };
type Moment = OilInput['moment'];

// D28 : soir = composés polaires ; matin = aspect + température ; service = température
const defaultMoment = (): Moment => { const h = new Date().getHours(); return h < 11 ? 'matin' : h >= 20 ? 'soir' : 'service'; };
const polarStatus = (p: number) => (p >= 25 ? 'rouge' : p >= 22 ? 'jaune' : 'vert');

export function Huile({ api, session, onBack }: { api: Api; session: Session; onBack: () => void }) {
  const t = useT();
  const [fryers, setFryers] = useState<Equipment[]>([]);
  const [fryer, setFryer] = useState('');
  const [moment, setMoment] = useState<Moment>(defaultMoment());
  const [temp, setTemp] = useState(170);
  const [polar, setPolar] = useState(36);     // demi-points : 18,0 %
  const [defects, setDefects] = useState<string[]>([]);
  const [filtered, setFiltered] = useState(false);
  const [changed, setChanged] = useState(false);
  const [result, setResult] = useState<string>('');
  const [alarm, setAlarm] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.equipments().then((e) => { const f = e.filter((x) => x.type === 'friteuse'); setFryers(f); setFryer(f[0]?.id ?? ''); }); }, [api]);
  const eq = fryers.find((f) => f.id === fryer);
  if (!eq) return null;
  const tStatus = readingStatus(temp, null, eq.max);
  const pStatus = polarStatus(polar / 2);

  const save = async () => {
    try {
      const r = await api.huile(session.token, { equipmentId: eq.id, moment, temperature: moment === 'soir' ? null : temp,
        polar: moment === 'soir' ? polar / 2 : null, defects: moment === 'soir' ? [] : defects, filtered, changed });
      setAlarm(r.mustChange && !changed);
      setResult(t(r.mustChange && !changed ? (moment === 'soir' ? 'Huile à changer demain matin : rappel programmé.' : 'Huile à changer maintenant : non-conformité ouverte.') : 'Contrôle enregistré.'));
      setTimeout(onBack, 1600);
    } catch (e) { setError(t((e as Error).message)); }
  };

  if (result) return <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}><span className={`badge ${alarm ? 'rouge' : 'vert'}`}>{alarm ? '! ' : '✓ '}{result}</span></div>;

  return (
    <div className="screen">
      <TopBar title={t('Huile')} onBack={onBack} />
      {fryers.length > 1 && <Segmented label={t('Friteuse')} value={fryer} onChange={setFryer} options={fryers.map((f) => ({ value: f.id, label: f.name }))} />}
      <Segmented label={t('Moment du contrôle')} value={moment} onChange={setMoment}
        options={[{ value: 'matin', label: t('Matin') }, { value: 'service', label: t('Service') }, { value: 'soir', label: t('Soir') }]} />

      {moment === 'soir' ? (
        <>
          <div className="section-label">{t('Composés polaires · changement dès 25 %')}</div>
          <div className="group" style={{ padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ width: '100%' }}>
              <Wheel ariaLabel="Composés polaires" reverse count={81} index={polar} onChange={setPolar} label={(i) => (i / 2).toFixed(1).replace('.', ',') + ' %'}
                color={COL[pStatus]} bandColor={BAND[pStatus]} bandBorder={COL[pStatus]} />
            </div>
            <span className={`badge ${pStatus}`}>{pStatus === 'rouge' ? t('À changer demain matin') : pStatus === 'jaune' ? t('Proche du seuil') : t('✓ Conforme')}</span>
          </div>
        </>
      ) : (
        <>
          <div className="section-label">{t('Température · ≤')} {eq.max} {t('°C')}</div>
          <div className="group" style={{ padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ width: '100%' }}>
              <Wheel ariaLabel="Température de l'huile" reverse count={101} index={temp - 120} onChange={(i) => setTemp(i + 120)} label={(i) => `${i + 120} °C`}
                visible={3} color={COL[tStatus]} bandColor={BAND[tStatus]} bandBorder={COL[tStatus]} />
            </div>
          </div>
          <div className="section-label">{t('Aspect · touchez ce qui ne va pas')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {DEFECTS.map(([k, l]) => {
              const on = defects.includes(k);
              return <button key={k} aria-pressed={on} onClick={() => setDefects(on ? defects.filter((d) => d !== k) : [...defects, k])}
                style={{ height: 46, border: on ? '2px solid var(--red)' : 'none', borderRadius: 12, background: on ? 'var(--red-bg)' : '#fff', color: on ? 'var(--red)' : '#000', fontSize: 16, fontWeight: on ? 600 : 400 }}>{t(l)}</button>;
            })}
          </div>
        </>
      )}

      <div className="group">
        <label className="row" style={{ fontSize: 17 }}><input type="checkbox" checked={filtered} onChange={(e) => setFiltered(e.target.checked)} style={{ width: 22, height: 22, accentColor: 'var(--blue)' }} /> {t('Huile filtrée')}</label>
        <label className="row" style={{ fontSize: 17 }}><input type="checkbox" checked={changed} onChange={(e) => setChanged(e.target.checked)} style={{ width: 22, height: 22, accentColor: 'var(--blue)' }} /> {t('Huile changée')}</label>
      </div>
      <div className="error" role="alert">{error}</div>
      <div style={{ marginTop: 'auto' }}><button className="btn btn-primary" onClick={save}>{t('Enregistrer')}</button></div>
    </div>
  );
}
