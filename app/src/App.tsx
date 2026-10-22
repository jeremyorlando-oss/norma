import { useCallback, useEffect, useRef, useState } from 'react';
import type { Api, Session } from './api/types';
import { Huile } from './screens/Huile';
import { Nettoyage } from './screens/Nettoyage';
import { Preparations } from './screens/Preparations';
import { Reception } from './screens/Reception';
import { Pointage } from './screens/Pointage';
import { PrisePoste } from './screens/PrisePoste';
import { Releve } from './screens/Releve';
import { SessionHome, type Target } from './screens/SessionHome';

type View = 'home' | 'prise' | Target;
const IDLE_MS = 2 * 60_000;   // D35 : fermeture après 2 min sans activité

export function App({ api, demoHint }: { api: Api; demoHint?: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>('home');
  const timer = useRef<number>();

  const close = useCallback(() => {
    if (session) api.closeSession(session.token);
    setSession(null); setView('home');
  }, [api, session]);

  // Inactivité : toute interaction relance le minuteur
  useEffect(() => {
    if (!session) return;
    const reset = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(close, IDLE_MS); };
    reset();
    window.addEventListener('pointerdown', reset);
    return () => { window.clearTimeout(timer.current); window.removeEventListener('pointerdown', reset); };
  }, [session, close]);

  if (!session) return <Pointage api={api} demoHint={demoHint}
    onSession={(s) => { setSession(s); setView(s.aptToday ? 'home' : 'prise'); }} />;

  const back = () => setView('home');
  return (
    <>
      {/* D36 : bouton « off » discret sur tous les écrans de session */}
      <button className="off" aria-label="Fermer la session" onClick={close}
        style={{ position: 'fixed', top: 'max(16px, env(safe-area-inset-top))', right: 16, zIndex: 10 }}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M12 3v9" /><path d="M6.3 7.2a8 8 0 1 0 11.4 0" />
        </svg>
      </button>
      {view === 'prise' && <PrisePoste api={api} session={session} onDone={(ok) => { setSession({ ...session, aptToday: ok }); back(); }} />}
      {view === 'home' && <SessionHome api={api} session={session} onOpen={setView}
        onDepointer={async () => { await api.depointer(session.token); setSession(null); }} />}
      {view === 'releve' && <Releve api={api} session={session} onBack={back} />}
      {view === 'nettoyage' && <Nettoyage api={api} session={session} onBack={back} />}
      {view === 'huile' && <Huile api={api} session={session} onBack={back} />}
      {view === 'reception' && <Reception api={api} session={session} onBack={back} />}
      {view === 'preparations' && <Preparations api={api} session={session} onBack={back} />}
    </>
  );
}
