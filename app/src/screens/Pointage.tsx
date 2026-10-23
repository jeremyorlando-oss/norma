import { LOGO_GLYPH_WHITE_URL } from '../brand/logo';
import { useT } from '../i18n';
import { OutageBanner } from '../components/OutageBanner';
import { useEffect, useState } from 'react';
import type { Api, Session, StandAlert } from '../api/types';
import { formatDelay, worstAlert } from '../domain/rules';

const BG = { ok: '#FFFFFF', jaune: 'var(--yellow-screen)', rouge: 'var(--red-screen)' } as const;

export function Pointage({ api, onSession, demoHint, onDirection }: { api: Api; onSession: (s: Session) => void; demoHint?: string; onDirection?: () => void }) {
  const t = useT();
  const [eventName, setEventName] = useState('');
  useEffect(() => { api.currentEvent(new Date()).then((e) => setEventName(e ? `${e.name} · ${e.place}` : '')); }, [api]);
  const [now, setNow] = useState(new Date());
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [alerts, setAlerts] = useState<StandAlert[]>([]);

  useEffect(() => {
    const tick = () => { const n = new Date(); setNow(n); api.alerts(n).then(setAlerts); };
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [api]);

  const press = async (k: string) => {
    setError('');
    if (k === '⌫') return setCode(code.slice(0, -1));
    const c = (code + k).slice(0, 4);
    setCode(c);
    if (c.length === 4) {
      try { onSession(await api.openSession(c)); }
      catch (e) { setError(t((e as Error).message)); }
      finally { setCode(''); }
    }
  };

  const level = worstAlert(alerts.map((a) => a.alert));
  return (
    <div className="full-bg" style={{ background: BG[level] }}>
      <div className="screen" style={{ alignItems: 'center', gap: 14 }}>
        <div style={{ textAlign: 'center', paddingTop: 16 }}>
          {/* Icône discrète style « verre liquide » : translucide, floutée, qui laisse passer la couleur de l'écran */}
          <div aria-label="NORMA" role="img" style={{ width: 40, height: 40, margin: '0 auto 8px', borderRadius: 11, display: 'grid', placeItems: 'center',
            background: 'linear-gradient(160deg, rgba(255,255,255,0.42), rgba(255,255,255,0.12))', border: '0.5px solid rgba(255,255,255,0.6)',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.7), 0 4px 14px rgba(0,0,0,0.10)', backdropFilter: 'blur(12px) saturate(160%)', WebkitBackdropFilter: 'blur(12px) saturate(160%)' }}>
            <img src={LOGO_GLYPH_WHITE_URL} alt="" style={{ width: 24, height: 24, opacity: 0.9, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.12))' }} />
          </div>
          <div className="eyebrow" style={{ color: '#3C3C43' }}>
            {now.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          {eventName && <div style={{ fontSize: 15, fontWeight: 600, color: '#3C3C43' }}>{eventName}</div>}
          <div className="clock">{now.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>

        <OutageBanner api={api} />
        {alerts.length > 0 && (
          <div className="group" style={{ width: '100%' }} role="status" aria-live="polite">
            {alerts.map((a) => (
              <div className="row" key={a.title} style={{ alignItems: 'flex-start' }}>
                <span style={{ width: 12, height: 12, borderRadius: 6, marginTop: 5, flexShrink: 0,
                  background: a.alert === 'rouge' ? 'var(--red)' : 'var(--yellow)', border: a.alert === 'jaune' ? '1px solid #B38F00' : undefined }} />
                <span className="grow">
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{a.title}</span>
                  <span className={`pill ${a.alert}`}>{formatDelay(a.dueAt, now)}</span>
                  <span className="sub" style={{ fontSize: 12 }}>{t('Peut le faire :')} {a.who}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ textAlign: 'center', width: '100%' }}><div style={{ fontSize: 17, fontWeight: 600 }}>Tapez votre code</div><div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>Escriba su código · Enter your code</div></div>
        <div className={`dots ${error ? 'shake' : ''}`} aria-label={`${code.length} chiffres saisis`}>
          {[0, 1, 2, 3].map((i) => <span key={i} className={`dot ${i < code.length ? 'on' : ''}`} />)}
        </div>
        <div className="error" role="alert">{error}</div>
        <div className="keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
            k === '' ? <span key={i} /> :
              <button key={i} className={`key ${k === '⌫' ? 'ghost' : ''}`} aria-label={k === '⌫' ? 'Effacer' : k} onClick={() => press(k)}>{k}</button>)}
        </div>
        {demoHint && <div className="demo-banner">{demoHint}</div>}
        {demoHint && onDirection && <button className="link" style={{ fontSize: 13 }} onClick={onDirection}>{t('Démo : ouvrir l’espace Direction (iPhone)')}</button>}
      </div>
    </div>
  );
}
