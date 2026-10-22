import { useState } from 'react';
import type { Api, Session } from '../api/types';
import { useLang } from '../i18n';
import { CONTROLLER, privacyNotice } from '../domain/privacy';

/** Notice LPD (art. 19) : affichée à la première session, lecture confirmée et horodatée. */
export function Notice({ api, session, onDone }: { api: Api; session: Session; onDone: () => void }) {
  const n = privacyNotice(useLang(), CONTROLLER);
  const [error, setError] = useState('');
  const ok = async () => { try { await api.ackPrivacy(session.token); onDone(); } catch (e) { setError((e as Error).message); } };
  return (
    <div className="screen">
      <div><div className="eyebrow">NORMA</div><h1 className="h1">{n.title}</h1></div>
      <p style={{ fontSize: 16, lineHeight: '22px', margin: 0 }}>{n.intro}</p>
      {n.sections.map((s) => (
        <div key={s.title}>
          <div className="section-label">{s.title}</div>
          <div className="group">
            {s.text && <div style={{ padding: '12px 16px', fontSize: 15, lineHeight: '21px' }}>{s.text}</div>}
            {s.rows?.map(([d, why, keep]) => (
              <div className="row" key={d} style={{ alignItems: 'flex-start' }}>
                <span className="grow"><span className="main" style={{ fontSize: 15 }}>{d}</span><span className="sub">{why}</span></span>
                <span className="sub" style={{ maxWidth: 140, textAlign: 'right' }}>{keep}</span></div>))}
          </div>
        </div>))}
      <div className="error" role="alert">{error}</div>
      <div style={{ marginTop: 'auto' }}><button className="btn btn-primary" onClick={ok}>{n.ack}</button></div>
    </div>
  );
}
