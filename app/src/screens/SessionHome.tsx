import { useT } from '../i18n';
import { useEffect, useState } from 'react';
import type { Api, Session } from '../api/types';
import { dueAlert, type Right } from '../domain/rules';

export type Target = 'releve' | 'nettoyage' | 'huile' | 'reception' | 'preparations' | 'allergenes' | 'signaler' | 'checklist' | 'chaud';
const TILES: { right: Right; title: string; target?: Target }[] = [
  { right: 'releves', title: 'Checklists', target: 'checklist' },
  { right: 'releves', title: 'Températures', target: 'releve' },
  { right: 'releves', title: 'Maintien au chaud', target: 'chaud' },
  { right: 'nettoyage', title: 'Nettoyage', target: 'nettoyage' },
  { right: 'releves', title: 'Huile', target: 'huile' },
  { right: 'reception', title: 'Réception', target: 'reception' },
  { right: 'preparations', title: 'Préparations', target: 'preparations' },
  { right: 'allergenes_lecture', title: 'Allergènes', target: 'allergenes' },
  { right: 'signaler_nc', title: 'Signaler un problème', target: 'signaler' },
];

export function SessionHome({ api, session, onOpen, onDepointer }:
  { api: Api; session: Session; onOpen: (t: Target) => void; onDepointer: () => void }) {
  const tt = useT();
  const [late, setLate] = useState(0);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const n = new Date();
    api.cleaningTasks(n).then((ts) => setLate(ts.filter((t) => t.dueAt && dueAlert(t.dueAt, n) !== 'ok').length));
  }, [api]);

  const tiles = TILES.filter((t) => session.droits.includes(t.right));
  return (
    <div className="screen">
      <div>
        <div className="eyebrow">{tt(session.poste)}</div>
        <h1 className="h1">{session.prenom}</h1>
      </div>
      {!session.aptToday && session.poste !== 'Gérant' && session.poste !== 'Manager' && (
        <div className="group" style={{ background: 'var(--red-bg)', padding: '12px 16px', fontSize: 14 }}> {tt('Prise de poste non conforme : relevés et préparations bloqués aujourd’hui.')}</div>
      )}
      <div className="tiles">
        {tiles.map((t) => (
          <button key={t.title} className="tile" disabled={!t.target} onClick={() => t.target && onOpen(t.target)}>
            <span className="t">{tt(t.title)}</span>
            {t.target === 'nettoyage' && late > 0 ? <span className="pill jaune">{tt('{n} à faire maintenant', { n: late })}</span>
              : <span className="s">{t.target ? tt('Ouvrir') : tt('Bientôt disponible')}</span>}
          </button>))}
      </div>
      <p className="note" style={{ textAlign: 'center' }}> {tt('Seules les actions autorisées pour votre poste s’affichent. La session se ferme seule après 2 min sans activité ; vous restez pointé.')}</p>
      <div style={{ marginTop: 'auto' }}>
        {confirm
          ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button className="btn" style={{ background: '#fff' }} onClick={() => setConfirm(false)}>{tt('Annuler')}</button>
              <button className="btn btn-danger" onClick={onDepointer}>{tt('Confirmer le départ')}</button>
            </div>
          : <button className="btn btn-outline-danger" onClick={() => setConfirm(true)}>{tt('Terminer mon service · dépointer')}</button>}
      </div>
    </div>
  );
}
