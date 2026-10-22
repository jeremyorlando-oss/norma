import { Notice } from './screens/Notice';
import { LangProvider } from './i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Api, Session } from './api/types';
import { Allergenes } from './screens/Allergenes';
import { Checklist } from './screens/Checklist';
import { Formation } from './screens/Formation';
import { MaintienChaud } from './screens/MaintienChaud';
import { Direction } from './screens/Direction';
import { Huile } from './screens/Huile';
import { Signaler } from './screens/Signaler';
import { Nettoyage } from './screens/Nettoyage';
import { Preparations } from './screens/Preparations';
import { Reception } from './screens/Reception';
import { Pointage } from './screens/Pointage';
import { PrisePoste } from './screens/PrisePoste';
import { Releve } from './screens/Releve';
import { SessionHome, type Target } from './screens/SessionHome';

type View = 'home' | 'notice' | 'prise' | 'formation' | Target;
const IDLE_MS = 2 * 60_000;   // D35 : fermeture après 2 min sans activité

export function App({ api, demoHint }: { api: Api; demoHint?: string }) {
  const [mode, setMode] = useState<'stand' | 'direction'>(location.hash === '#direction' ? 'direction' : 'stand');
  const [session, setSession] = useState<Session | null>(null);
  const [depannage, setDepannage] = useState(false);
  const [view, setView] = useState<View>('home');
  const timer = useRef<number>();

  const close = useCallback(() => {
    if (session && !depannage) api.closeSession(session.token);
    setSession(null); setView('home');
    if (depannage) { setDepannage(false); setMode('direction'); }
  }, [api, session, depannage]);

  // Inactivité : toute interaction relance le minuteur
  useEffect(() => {
    if (!session) return;
    const reset = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(close, IDLE_MS); };
    reset();
    window.addEventListener('pointerdown', reset);
    return () => { window.clearTimeout(timer.current); window.removeEventListener('pointerdown', reset); };
  }, [session, close]);

  if (mode === 'direction' && !session) return <Direction api={api} onLogout={() => setMode('stand')}
    onDepannage={(s) => { setDepannage(true); setSession(s); setView(s.aptToday ? 'home' : 'prise'); }} />;
  if (!session) return <Pointage api={api} demoHint={demoHint} onDirection={() => setMode('direction')}
    onSession={(s) => { setSession(s); setView(!s.privacyAck ? 'notice' : !s.aptToday ? 'prise' : !s.trained ? 'formation' : 'home'); }} />;

  const back = () => setView('home');
  return (
    <LangProvider lang={depannage ? 'fr' : session.langue}>
      {/* D36 : bouton « off » discret sur tous les écrans de session */}
      <button className="off" aria-label="Fermer la session" onClick={close}
        style={{ position: 'fixed', top: 'max(16px, env(safe-area-inset-top))', right: 16, zIndex: 10 }}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M12 3v9" /><path d="M6.3 7.2a8 8 0 1 0 11.4 0" />
        </svg>
      </button>
      {view === 'notice' && <Notice api={api} session={session} onDone={() => { setSession({ ...session, privacyAck: true }); setView(!session.aptToday ? 'prise' : !session.trained ? 'formation' : 'home'); }} />}
      {view === 'prise' && <PrisePoste api={api} session={session} onDone={(ok) => { setSession({ ...session, aptToday: ok }); setView(session.trained ? 'home' : 'formation'); }} />}
      {view === 'formation' && <Formation api={api} session={session} onDone={() => { setSession({ ...session, trained: true }); back(); }} />}
      {view === 'checklist' && <Checklist api={api} session={session} onBack={back} />}
      {view === 'chaud' && <MaintienChaud api={api} session={session} onBack={back} />}
      {depannage && <div style={{ background: 'var(--yellow)', textAlign: 'center', fontSize: 13, fontWeight: 600, padding: 6 }}>Saisie de dépannage depuis l’iPhone · {session.prenom}</div>}
      {view === 'home' && <SessionHome api={api} session={session} onOpen={setView}
        onDepointer={async () => { await api.depointer(session.token); setSession(null); }}
        onBreak={async (on) => { await (on ? api.startBreak(session.token) : api.endBreak(session.token)); setSession({ ...session, onBreak: on }); }} />}
      {view === 'releve' && <Releve api={api} session={session} onBack={back} />}
      {view === 'nettoyage' && <Nettoyage api={api} session={session} onBack={back} />}
      {view === 'huile' && <Huile api={api} session={session} onBack={back} />}
      {view === 'reception' && <Reception api={api} session={session} onBack={back} />}
      {view === 'preparations' && <Preparations api={api} session={session} onBack={back} />}
      {view === 'allergenes' && <Allergenes api={api} onBack={back} />}
      {view === 'signaler' && <Signaler api={api} session={session} onBack={back} />}
    </LangProvider>
  );
}
