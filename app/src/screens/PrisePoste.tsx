import { useState } from 'react';
import type { Api, Session } from '../api/types';

const QUESTIONS = [
  { key: 'apte', text: 'Je n’ai ni fièvre, ni diarrhée, ni vomissements, ni maladie contagieuse' },
  { key: 'plaies', text: 'Aucune plaie non protégée aux mains' },
  { key: 'tenue', text: 'Tenue propre, coiffe, cheveux attachés, chaussures fermées' },
  { key: 'bijoux', text: 'Pas de bijoux ni montre, ongles courts sans vernis' },
  { key: 'mains', text: 'Mains lavées et désinfectées' },
] as const;

export function PrisePoste({ api, session, onDone }: { api: Api; session: Session; onDone: (apte: boolean) => void }) {
  const [answers, setAnswers] = useState<Record<string, boolean | undefined>>({});
  const [error, setError] = useState('');
  const complete = QUESTIONS.every((q) => answers[q.key] !== undefined);

  const submit = async () => {
    const health = !!answers.apte && !!answers.plaies;   // santé : enregistré seulement apte / non apte
    try {
      await api.prisePoste(session.token, { apte: health, tenue: !!answers.tenue, bijoux: !!answers.bijoux, mains: !!answers.mains });
      onDone(health && !!answers.tenue && !!answers.bijoux && !!answers.mains);
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="screen">
      <div>
        <div className="eyebrow">{session.arrivee ? `Arrivée pointée à ${new Date().toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}` : 'Prise de poste'}</div>
        <h1 className="h1">Bonjour {session.prenom}</h1>
      </div>
      {QUESTIONS.map((q) => (
        <div key={q.key} className="group row" style={{ padding: '12px 16px' }}>
          <span className="grow" style={{ fontSize: 16, lineHeight: '21px' }}>{q.text}</span>
          <span className="yn" role="radiogroup" aria-label={q.text}>
            <button role="radio" aria-checked={answers[q.key] === true} className={answers[q.key] === true ? 'yes' : ''}
              onClick={() => setAnswers({ ...answers, [q.key]: true })}>Oui</button>
            <button role="radio" aria-checked={answers[q.key] === false} className={answers[q.key] === false ? 'no' : ''}
              onClick={() => setAnswers({ ...answers, [q.key]: false })}>Non</button>
          </span>
        </div>
      ))}
      {(answers.apte === false || answers.plaies === false) && (
        <div className="group" style={{ background: 'var(--red-bg)', padding: '12px 16px', fontSize: 14, lineHeight: '19px' }}>
          <strong style={{ color: 'var(--red)' }}>Non apte à manipuler des denrées.</strong> Le responsable sera averti.
          Aucun symptôme n’est enregistré.
        </div>
      )}
      <div className="error" role="alert">{error}</div>
      <div style={{ marginTop: 'auto' }}>
        <button className="btn btn-primary" disabled={!complete} onClick={submit}>Commencer mon service</button>
      </div>
    </div>
  );
}
