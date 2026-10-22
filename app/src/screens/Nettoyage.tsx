import { useCallback, useEffect, useState } from 'react';
import type { Api, CleaningTask, Session } from '../api/types';
import { dueAlert, formatDelay } from '../domain/rules';

export function Nettoyage({ api, session, onBack }: { api: Api; session: Session; onBack: () => void }) {
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [error, setError] = useState('');
  const now = new Date();
  const load = useCallback(() => api.cleaningTasks(new Date()).then(setTasks), [api]);
  useEffect(() => { load(); }, [load]);

  const done = async (t: CleaningTask) => {
    try { await api.nettoyage(session.token, t.id); load(); }
    catch (e) { setError((e as Error).message); }
  };
  const recent = (t: CleaningTask) => t.lastDone && now.getTime() - t.lastDone.at.getTime() < 10 * 60_000;
  const todo = tasks.filter((t) => !recent(t)).sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  const fait = tasks.filter(recent);

  return (
    <div className="screen">
      <div className="topbar"><button className="link" onClick={onBack}>‹ Retour</button><span className="title">Nettoyage</span><span style={{ width: 70 }} /></div>
      <div className="section-label">À faire</div>
      <div className="group">
        {todo.map((t) => {
          const al = t.dueAt ? dueAlert(t.dueAt, now) : 'ok';
          return (
            <div className="row" key={t.id}>
              <button className={`check ${al === 'rouge' ? 'late' : al === 'jaune' ? 'soon' : ''}`} aria-label={`Valider : ${t.name}`} onClick={() => done(t)} />
              <span className="grow">
                <span className="main">{t.name}</span>
                {t.dueAt && al !== 'ok' ? <span className={`pill ${al}`}>{formatDelay(t.dueAt, now)}</span> : <span className="sub">{t.frequency}</span>}
                <span className="sub" style={{ fontSize: 12 }}>{t.product}</span>
              </span>
            </div>);
        })}
      </div>
      {fait.length > 0 && <>
        <div className="section-label">Fait</div>
        <div className="group">
          {fait.map((t) => (
            <div className="row" key={t.id}>
              <span className="check done" aria-hidden="true">✓</span>
              <span className="grow"><span className="main">{t.name}</span>
                <span className="sub">{t.lastDone!.at.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })} · {t.lastDone!.by} · {t.product}</span></span>
            </div>))}
        </div></>}
      <div className="error" role="alert">{error}</div>
      <p className="note">Touchez le cercle pour valider. Votre nom, l’heure et le produit prévu au plan sont enregistrés.</p>
    </div>
  );
}
