import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createDemoApi, DEMO_MEMBERS } from './api/demo';
import './styles.css';

// V1 de démonstration : données fictives en mémoire. Le branchement Supabase remplacera createDemoApi().
const hint = 'Démo · codes : ' + DEMO_MEMBERS.map((m) => `${m.poste} ${m.pin}`).join(' · ');
createRoot(document.getElementById('root')!).render(<StrictMode><App api={createDemoApi()} demoHint={hint} /></StrictMode>);
