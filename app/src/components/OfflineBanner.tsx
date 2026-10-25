import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { clearFailed, onSync, syncState, type SyncState } from '../offline/sync';

/** État du réseau sur la tablette : hors ligne, saisies en attente, synchronisation, saisies refusées. */
export function OfflineBanner() {
  const t = useT();
  const [s, setS] = useState<SyncState>(syncState());
  const [open, setOpen] = useState(false);
  useEffect(() => onSync(setS), []);
  if (s.online && !s.pending && !s.failed.length) return null;
  const hm = (iso: string) => new Date(iso).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
  return (
    <div role="status" style={{ width: '100%', borderRadius: 12, padding: '10px 14px', background: s.failed.length ? 'var(--red-bg)' : '#E5E5EA', color: '#000' }}>
      {!s.online && <div style={{ fontWeight: 700 }}>{t('Hors ligne')} · {t('les saisies sont gardées sur la tablette')}</div>}
      {s.pending > 0 && <div>{s.syncing ? t('Envoi de {n} saisie(s)…', { n: s.pending }) : t('{n} saisie(s) en attente d’envoi', { n: s.pending })}</div>}
      {s.failed.length > 0 && (<>
        <button className="link" style={{ color: 'var(--red)', padding: 0 }} onClick={() => setOpen(!open)}>
          {t('{n} saisie(s) refusée(s) par le serveur', { n: s.failed.length })} {open ? '⌃' : '›'}</button>
        {open && <>
          {s.failed.map((f, i) => <div key={i} style={{ fontSize: 14 }}>{hm(f.clientAt)} · {f.who} · {f.error}</div>)}
          <p style={{ fontSize: 13, margin: '6px 0' }}>{t('Refaites ces saisies à la main si nécessaire, puis effacez la liste.')}</p>
          <button className="link" style={{ padding: 0 }} onClick={clearFailed}>{t('Effacer la liste')}</button></>}
      </>)}
    </div>
  );
}
