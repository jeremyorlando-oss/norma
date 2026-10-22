import { useT } from '../i18n';
import { useCallback, useEffect, useState } from 'react';
import type { Api, HotBatch, Session } from '../api/types';
import { TopBar } from '../components/Controls';
import { dueAlert } from '../domain/rules';

const MAX = 3 * 3600_000;   // BPHR 2.4.4 : ≥ 65 °C pendant 3 h au maximum

export function MaintienChaud({ api, session, onBack }: { api: Api; session: Session; onBack: () => void }) {
  const t = useT();
  const [list, setList] = useState<HotBatch[]>([]);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState('');
  const load = useCallback(() => api.hotBatches().then((l) => { setList(l); setNow(new Date()); }), [api]);
  useEffect(() => { load(); const id = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(id); }, [load]);

  const act = async (f: () => Promise<void>) => { setError(''); try { await f(); load(); } catch (e) { setError(t((e as Error).message)); } };
  const active = list.filter((h) => !h.ended);
  const fmt = (ms: number) => `${Math.floor(ms / 3600_000)} h ${String(Math.floor((ms % 3600_000) / 60_000)).padStart(2, '0')}`;

  return (
    <div className="screen">
      <TopBar title={t('Maintien au chaud')} onBack={onBack} />
      <p className="note">{t('Au chaud à 65 °C minimum,')} <b>{t('3 heures au maximum')}</b> {t('(guide BPHR 2.4.4). Lancez un minuteur à chaque nouveau bac.')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {['Saucisses volaille', 'Saucisses végétariennes', 'Frites', 'Autre'].map((p) =>
          <button key={p} className="btn" style={{ height: 48, fontSize: 15, background: '#fff', color: 'var(--blue)' }} onClick={() => act(() => api.startHot(session.token, p))}>+ {t(p)}</button>)}
      </div>
      <div className="section-label">{t('En cours')}</div>
      <div className="group">
        {active.length === 0 && <div className="row sub">{t('Aucun bac au chaud.')}</div>}
        {active.map((h) => {
          const el = Math.max(0, now.getTime() - h.startedAt.getTime());
          const al = dueAlert(new Date(h.startedAt.getTime() + MAX), now);
          return (
            <div className="row" key={h.id}>
              <span className="grow"><span className="main">{t(h.product)}</span>
                <span className={`pill ${al === 'ok' ? 'vert' : al}`}>{al === 'rouge' ? t('Plus de 3 h : à jeter') : t('Depuis {a} · reste {b}', { a: fmt(el), b: fmt(Math.max(0, MAX - el)) })}</span>
                <span className="sub">{t('Lancé à')} {h.startedAt.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })} {t('par')} {h.by}</span></span>
              {al !== 'rouge' && <button className="link" style={{ fontSize: 15 }} onClick={() => act(() => api.endHot(session.token, h.id, 'vendu'))}>{t('Bac vide')}</button>}
              <button onClick={() => act(() => api.endHot(session.token, h.id, 'jete'))}
                style={{ height: 34, padding: '0 12px', borderRadius: 17, border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 600 }}>{t('Jeté')}</button>
            </div>);
        })}
      </div>
      <div className="error" role="alert">{error}</div>
    </div>
  );
}
