// Démo autonome : mêmes règles que le serveur, données en mémoire (rien n'est enregistré).
import { dueAlert, readingStatus, type Right } from '../domain/rules';
import type { Api, CleaningTask, Equipment, Session, StandAlert } from './types';

const ALL: Right[] = ['pointage', 'prise_poste', 'nettoyage', 'signaler_nc', 'allergenes_lecture', 'releves', 'reception',
  'preparations', 'jeter_lot', 'traiter_nc', 'cloturer_nc', 'tableau_bord', 'heures_equipe', 'export', 'equipements',
  'gestion_equipe', 'admin_documents', 'reglages_gerant'];
const TERRAIN: Right[] = ['pointage', 'prise_poste', 'nettoyage', 'signaler_nc', 'allergenes_lecture', 'releves', 'reception',
  'preparations', 'jeter_lot', 'traiter_nc', 'cloturer_nc', 'tableau_bord'];

export const POSTES: Record<string, Right[]> = {
  'Gérant': ALL,
  'Manager': [...TERRAIN, 'heures_equipe', 'export', 'equipements', 'gestion_equipe', 'admin_documents'],
  'Chef de cuisine': TERRAIN,
  'Aide de cuisine': ['pointage', 'prise_poste', 'nettoyage', 'signaler_nc'],
  'Caisse': ['pointage', 'prise_poste', 'nettoyage', 'signaler_nc', 'allergenes_lecture'],
};

export const DEMO_MEMBERS = [
  { id: 'm1', prenom: 'Orlando', poste: 'Gérant', pin: '2580' },
  { id: 'm2', prenom: 'Vincent', poste: 'Manager', pin: '3691' },
  { id: 'm3', prenom: 'Esteban', poste: 'Chef de cuisine', pin: '4827' },
  { id: 'm4', prenom: 'Lucía', poste: 'Aide de cuisine', pin: '6142' },
  { id: 'm5', prenom: 'Noah', poste: 'Caisse', pin: '5913' },
];

const whoCan = (r: Right) => Object.entries(POSTES).filter(([, rs]) => rs.includes(r)).map(([p]) => p).join(', ');
const ago = (min: number) => new Date(Date.now() - min * 60_000);
const today = () => new Date().toDateString();

export function createDemoApi(): Api {
  const clockedIn = new Set<string>();
  const fit = new Map<string, { day: string; ok: boolean }>();
  const sessions = new Map<string, { memberId: string; last: number }>();
  let fails: number[] = [];
  let lastFridgeReading: Date | null = null;
  const openedAt = new Date();

  const equipments: Equipment[] = [
    { id: 'e1', name: 'Frigo (positif)', type: 'froid_positif', min: 0, max: 4, defaultValue: 3.5 },
    { id: 'e2', name: 'Congélateur', type: 'froid_negatif', min: null, max: -18, defaultValue: -20 },
    { id: 'e3', name: 'Saladette', type: 'froid_positif', min: 2, max: 4, defaultValue: 3 },
    { id: 'e4', name: 'Cuisson à cœur', type: 'cuisson', min: 72, max: null, defaultValue: 75 },
    { id: 'e5', name: 'Maintien au chaud', type: 'maintien_chaud', min: 65, max: null, defaultValue: 68 },
  ];
  const tasks: (Omit<CleaningTask, 'dueAt'> & { interval: number | null })[] = [
    { id: 't1', name: 'Zone caisse et service', product: 'Désinfectant alimentaire', frequency: 'Toutes les 2 h', interval: 120, lastDone: { by: 'Noah', at: ago(127) } },
    { id: 't2', name: 'Sol', product: 'Détergent + désinfectant', frequency: 'Toutes les 2 h', interval: 120, lastDone: { by: 'Lucía', at: ago(110) } },
    { id: 't3', name: 'Poubelles et containers', product: 'Désinfectant détergent', frequency: 'Toutes les 6 h', interval: 360, lastDone: { by: 'Esteban', at: ago(60) } },
    { id: 't4', name: 'Plans de travail inox', product: 'Désinfectant alimentaire', frequency: 'À chaque changement de tâche', interval: null, lastDone: { by: 'Esteban', at: ago(25) } },
    { id: 't5', name: 'Ustensiles et pinces', product: 'Détergent + désinfectant', frequency: 'Après utilisation', interval: null, lastDone: null },
  ];

  const member = (token: string) => {
    const s = sessions.get(token);
    if (!s || Date.now() - s.last > 120_000) throw new Error('Session expirée : retapez votre code');
    s.last = Date.now();
    return DEMO_MEMBERS.find((m) => m.id === s.memberId)!;
  };
  const can = (m: { poste: string }, r: Right) => POSTES[m.poste].includes(r);
  const aptToday = (id: string) => fit.get(id)?.day === today() && fit.get(id)!.ok;
  const due = (t: (typeof tasks)[number]) => (t.interval === null ? null : new Date((t.lastDone?.at ?? openedAt).getTime() + t.interval * 60_000));

  return {
    async openSession(pin) {
      fails = fails.filter((t) => Date.now() - t < 60_000);
      if (fails.length >= 5) throw new Error('Trop de codes faux : réessayez dans 1 minute');
      const m = DEMO_MEMBERS.find((x) => x.pin === pin);
      if (!m) { fails.push(Date.now()); throw new Error('Code incorrect'); }
      fails = [];
      const arrivee = !clockedIn.has(m.id);
      clockedIn.add(m.id);
      const token = crypto.randomUUID();
      sessions.set(token, { memberId: m.id, last: Date.now() });
      const s: Session = { token, memberId: m.id, prenom: m.prenom, poste: m.poste, arrivee, droits: POSTES[m.poste], aptToday: aptToday(m.id) };
      return s;
    },
    async closeSession(token) { sessions.delete(token); },
    async depointer(token) { const m = member(token); clockedIn.delete(m.id); sessions.delete(token); },
    async prisePoste(token, a) { const m = member(token); fit.set(m.id, { day: today(), ok: a.apte && a.tenue && a.bijoux && a.mains }); },
    async equipments() { return equipments; },
    async releve(token, equipmentId, value) {
      const m = member(token);
      if (!can(m, 'releves')) throw new Error('Ce poste n’a pas le droit de saisir des relevés');
      if (!aptToday(m.id)) throw new Error('Prise de poste non conforme ou non faite aujourd’hui');
      const e = equipments.find((x) => x.id === equipmentId)!;
      if (e.id === 'e1') lastFridgeReading = new Date();
      return { status: readingStatus(value, e.min, e.max) };
    },
    async cleaningTasks() { return tasks.map((t) => ({ ...t, dueAt: due(t) })); },
    async nettoyage(token, taskId) {
      const m = member(token);
      if (!can(m, 'nettoyage')) throw new Error('Ce poste n’a pas le droit de valider un nettoyage');
      tasks.find((t) => t.id === taskId)!.lastDone = { by: m.prenom, at: new Date() };
    },
    async alerts(now) {
      const list: StandAlert[] = [];
      for (const t of tasks) {
        const d = due(t);
        if (d && dueAlert(d, now) !== 'ok') list.push({ title: `Nettoyage : ${t.name}`, dueAt: d, alert: dueAlert(d, now), who: whoCan('nettoyage') });
      }
      if (!lastFridgeReading) {
        const d = new Date(openedAt.getTime() + 12 * 60_000);
        if (dueAlert(d, now) !== 'ok') list.push({ title: 'Relevé frigo · ouverture', dueAt: d, alert: dueAlert(d, now), who: whoCan('releves') });
      }
      return list.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    },
  };
}
