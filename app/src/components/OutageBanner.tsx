import { useEffect, useState } from 'react';
import type { Api, Outage } from '../api/types';
import { useT } from '../i18n';

const LIMIT = 30 * 60_000;   // BPHR : interruption de la chaîne du froid 30 min max
const mmss = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Minuteur de coupure de courant, visible sur la tablette tant que le courant n'est pas rétabli. */
export function OutageBanner({ api, token }: { api: Api; token?: string }) {
  const t = useT();
  const [o, setO] = useState<Outage | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const load = () => api.outage().then(setO);
    load(); const a = setInterval(load, 10_000), b = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [api]);
  if (!o || o.end) return null;
  const el = now - o.start.getTime(), over = el >= LIMIT;
  return (
    <div role="alert" style={{ width: '100%', borderRadius: 12, padding: '12px 16px', background: over ? 'var(--red)' : 'var(--yellow)', color: over ? '#fff' : '#000' }}>
      <div style={{ fontSize: 17, fontWeight: 700 }}>⚡ {t('Coupure de courant')} · {mmss(el)}</div>
      <div style={{ fontSize: 14, marginTop: 2 }}>{over ? t('Plus de 30 min : relevez la température de chaque frigo, puis décidez de garder ou jeter.') : t('Ne pas ouvrir frigos, saladette et congélateur. Limite : 30 min.')}</div>
      {token && <button className="btn" style={{ marginTop: 10, height: 40, background: '#fff', color: '#000' }} onClick={async () => { await api.endOutage(token); setO(await api.outage()); }}>{t('Courant rétabli')}</button>}
    </div>
  );
}
