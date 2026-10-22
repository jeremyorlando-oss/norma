import { useEffect, useState } from 'react';
import type { Api, Session } from '../api/types';
import { dueAlert, type Right } from '../domain/rules';

export type Target = 'releve' | 'nettoyage' | 'huile' | 'reception' | 'preparations';
const TILES: { right: Right; title: string; target?: Target }[] = [
  { right: 'releves', title: 'Températures', target: 'releve' },
  { right: 'nettoyage', title: 'Nettoyage', target: 'nettoyage' },
  { right: 'releves', title: 'Huile', target: 'huile' },
  { right: 'reception', title: 'Réception', target: 'reception' },
  { right: 'preparations', title: 'Préparations', target: 'preparations' },
  { right: 'allergenes_lecture', title: 'Allergènes' },
  { right: 'signaler_nc', title: 'Signaler un problème' },
];

export function SessionHome({ api, session, onOpen, onDepointer }:
  { api: Api; session: Session; onOpen: (t: Target) => void; onDepointer: () => void }) {
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
        <div className="eyebrow">{session.poste}</div>
        <h1 className="h1">{session.prenom}</h1>
      </div>
      {!session.aptToday && (
        <div className="group" style={{ background: 'var(--red-bg)', padding: '12px 16px', fontSize: 14 }}>
          Prise de poste non conforme : relevés et préparations bloqués aujourd’hui.</div>
      )}
      <div className="tiles">
        {tiles.map((t) => (
          <button key={t.title} className="tile" disabled={!t.target} onClick={() => t.target && onOpen(t.target)}>
            <span className="t">{t.title}</span>
            {t.target === 'nettoyage' && late > 0 ? <span className="pill jaune">{late} à faire maintenant</span>
              : <span className="s">{t.target ? 'Ouvrir' : 'Bientôt disponible'}</span>}
          </button>))}
      </div>
      <p className="note" style={{ textAlign: 'center' }}>
        Seules les actions autorisées pour votre poste s’affichent. La session se ferme seule après 2 min sans activité ; vous restez pointé.</p>
      <div style={{ marginTop: 'auto' }}>
        {confirm
          ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button className="btn" style={{ background: '#fff' }} onClick={() => setConfirm(false)}>Annuler</button>
              <button className="btn btn-danger" onClick={onDepointer}>Confirmer le départ</button>
            </div>
          : <button className="btn btn-outline-danger" onClick={() => setConfirm(true)}>Terminer mon service · dépointer</button>}
      </div>
    </div>
  );
}
