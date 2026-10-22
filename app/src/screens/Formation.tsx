import { useState } from 'react';
import type { Api, Session } from '../api/types';
import { BRIEFING, QUIZ } from '../domain/checklists';

/** Formation de base (BPHR 1.3 et 4.2.4) : briefing, quiz de vérification, attestation horodatée. */
export function Formation({ api, session, onDone }: { api: Api; session: Session; onDone: () => void }) {
  const [step, setStep] = useState<'brief' | 'quiz'>('brief');
  const [ans, setAns] = useState<(number | null)[]>(QUIZ.map(() => null));
  const [error, setError] = useState('');

  const submit = async () => {
    const score = ans.filter((a, i) => a === QUIZ[i].ok).length;
    try { await api.saveTraining(session.token, score); onDone(); }
    catch (e) { setError((e as Error).message); setStep('brief'); setAns(QUIZ.map(() => null)); }
  };

  if (step === 'brief') return (
    <div className="screen">
      <div><div className="eyebrow">Formation hygiène · obligatoire avant le premier service</div><h1 className="h1">Les règles du stand</h1></div>
      {BRIEFING.map((b, i) => (
        <div className="group" key={b.title} style={{ padding: '12px 16px' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{i + 1}. {b.title}</div>
          <div style={{ fontSize: 15, lineHeight: '21px', marginTop: 4 }}>{b.text}</div>
        </div>))}
      <div className="error" role="alert">{error}</div>
      <div style={{ marginTop: 'auto' }}><button className="btn btn-primary" onClick={() => setStep('quiz')}>J’ai lu, passer au quiz (5 questions)</button></div>
    </div>
  );

  return (
    <div className="screen">
      <div><div className="eyebrow">Vérification · 4 bonnes réponses sur 5</div><h1 className="h1">Quiz</h1></div>
      {QUIZ.map((q, i) => (
        <div key={q.q} className="group" style={{ padding: '10px 0' }}>
          <div style={{ fontWeight: 600, fontSize: 16, padding: '0 16px 6px' }}>{i + 1}. {q.q}</div>
          <div role="radiogroup" aria-label={q.q}>
            {q.options.map((o, j) => (
              <button key={o} role="radio" aria-checked={ans[i] === j} className="row"
                onClick={() => setAns(ans.map((a, k) => (k === i ? j : a)))}
                style={{ width: '100%', border: 'none', background: ans[i] === j ? '#E5F0FF' : '#fff', fontSize: 15, textAlign: 'left', minHeight: 44 }}>{o}</button>))}
          </div>
        </div>))}
      <div style={{ marginTop: 'auto' }}><button className="btn btn-primary" disabled={ans.includes(null)} onClick={submit}>Valider et signer l’attestation</button></div>
    </div>
  );
}
