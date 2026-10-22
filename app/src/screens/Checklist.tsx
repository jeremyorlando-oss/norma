import { useT } from '../i18n';
import { useEffect, useState } from 'react';
import type { Api, Session } from '../api/types';
import { Segmented, TopBar, YesNo } from '../components/Controls';
import { CHECKLISTS, type ChecklistMode } from '../domain/checklists';

/** Checklists montage / ouverture / fermeture : chaque point démarre à NON (D25) ; un NON ouvre une non-conformité. */
export function Checklist({ api, session, onBack }: { api: Api; session: Session; onBack: () => void }) {
  const t = useT();
  const h = new Date().getHours();
  const [mode, setMode] = useState<ChecklistMode>(h >= 20 ? 'fermeture' : 'ouverture');
  const [done, setDone] = useState<Record<ChecklistMode, boolean>>({ montage: false, ouverture: false, fermeture: false });
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const list = CHECKLISTS[mode];

  useEffect(() => {
    Promise.all((['montage', 'ouverture', 'fermeture'] as ChecklistMode[]).map((m) => api.checklistDone(m)))
      .then(([a, b, c]) => { setDone({ montage: a, ouverture: b, fermeture: c }); if (!a) setMode('montage'); });
  }, [api]);
  useEffect(() => setAnswers({}), [mode]);

  const save = async () => {
    try {
      const labels = Object.fromEntries(list.items.map((i) => [i.id, i.text]));
      const all = Object.fromEntries(list.items.map((i) => [i.id, !!answers[i.id]]));
      const nb = await api.saveChecklist(session.token, mode, all, labels);
      setResult(nb ? t('{n} point(s) à NON : non-conformité ouverte', { n: nb }) : t('Checklist complète et conforme'));
      setTimeout(onBack, 1500);
    } catch (e) { setError(t((e as Error).message)); }
  };

  if (result) return <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}><span className={`badge ${result !== t('Checklist complète et conforme') ? 'rouge' : 'vert'}`}>{result}</span></div>;
  const yes = list.items.filter((i) => answers[i.id]).length;

  return (
    <div className="screen">
      <TopBar title={t('Checklists')} onBack={onBack} />
      <Segmented label={t('Checklist')} value={mode} onChange={setMode} options={(['montage', 'ouverture', 'fermeture'] as ChecklistMode[]).map((m) => ({ value: m, label: (done[m] ? '✓ ' : '') + t(CHECKLISTS[m].title.split(' ')[0]) }))} />
      <div><div className="eyebrow">{t(list.when)}</div><div style={{ fontSize: 22, fontWeight: 700 }}>{t(list.title)}</div></div>
      <div className="group">
        {list.items.map((i) => (
          <div className="row" key={i.id} style={{ alignItems: 'flex-start' }}>
            <span className="grow"><span style={{ fontSize: 16, lineHeight: '21px' }}>{t(i.text)}</span><span className="sub" style={{ fontSize: 11 }}>{i.source}</span></span>
            <YesNo label={t(i.text)} on={!!answers[i.id]} onToggle={() => setAnswers({ ...answers, [i.id]: !answers[i.id] })} />
          </div>))}
      </div>
      <p className="note">{t('Un point laissé à NON ouvre une non-conformité à traiter.')} {yes}/{list.items.length} {t('à OUI.')}</p>
      <div className="error" role="alert">{error}</div>
      <div style={{ marginTop: 'auto' }}><button className="btn btn-primary" onClick={save}>{t('Valider la checklist')}</button></div>
    </div>
  );
}
