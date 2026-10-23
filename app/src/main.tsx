import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createDemoApi, DEMO_MEMBERS } from './api/demo';
import { Production } from './Production';
import './styles.css';

// DEMO=1 : démo autonome (données fictives en mémoire). Sinon : production branchée sur Supabase.
const root = createRoot(document.getElementById('root')!);
if (__DEMO__) {
  const hint = 'Démo · codes : ' + DEMO_MEMBERS.map((m) => `${m.poste} ${m.pin}`).join(' · ');
  root.render(<StrictMode><App api={createDemoApi()} demoHint={hint} /></StrictMode>);
} else {
  root.render(<StrictMode><Production /></StrictMode>);
}
