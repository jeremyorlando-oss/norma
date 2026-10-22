// Démo autonome : mêmes règles que le serveur, données en mémoire (rien n'est enregistré).
import { dueAlert, isWeakPin, lotCode, readingStatus, useBy, type Right } from '../domain/rules';
import type { DayReport } from '../report/dailyReport';
import { checkEntry, FORGOT_AFTER_H, workedMinutes } from '../domain/hours';
import type { AuditEntry, TimeEntry, EventInfo, EventSummary, AdminDoc, Api, CleaningTask, Dish, Equipment, HotBatch, Lot, Nc, Recipe, Session, StandAlert } from './types';

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

export const DEMO_MEMBERS: { id: string; prenom: string; poste: string; pin: string; lang: 'fr' | 'es' | 'en' }[] = [
  { id: 'm1', prenom: 'Orlando', poste: 'Gérant', pin: '2580', lang: 'fr' },
  { id: 'm2', prenom: 'Vincent', poste: 'Manager', pin: '3691', lang: 'fr' },
  { id: 'm3', prenom: 'Esteban', poste: 'Chef de cuisine', pin: '4827', lang: 'fr' },
  { id: 'm4', prenom: 'Lucía', poste: 'Aide de cuisine', pin: '6142', lang: 'es' },
  { id: 'm5', prenom: 'Noah', poste: 'Caisse', pin: '5913', lang: 'en' },
];

const whoCan = (r: Right) => Object.entries(POSTES).filter(([, rs]) => rs.includes(r)).map(([p]) => p).join(', ');
const ago = (min: number) => new Date(Date.now() - min * 60_000);
const today = () => new Date().toDateString();

export function createDemoApi(): Api {
  const entries: TimeEntry[] = [];
  const active = (id: string) => entries.find((e) => e.memberId === id && !e.end);
  const clockedIn = { has: (id: string) => !!active(id), get: (id: string) => active(id)?.start,
    values: () => entries.filter((e) => !e.end).map((e) => e.start), get size() { return entries.filter((e) => !e.end).length; } };
  const ncs: Nc[] = [];
  const stats = { releves: 0, relevesRouges: 0, nettoyagesFaits: 0, receptions: 0 };
  const hm = (d = new Date()) => d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
  const fmt1 = (v: number) => v.toFixed(1).replace('.', ',').replace('-', '−');
  const log = { readings: [] as DayReport['readings'], oil: [] as DayReport['oil'], receptions: [] as DayReport['receptions'], cleaning: [] as DayReport['cleaning'] };
  const lotDisposedAt = new Map<string, string>();
  const openNc = (kind: string, description: string, by: string) =>
    ncs.unshift({ id: crypto.randomUUID(), kind, description, openedBy: by, openedAt: new Date(), steps: [], closed: false });
  const fit = new Map<string, { day: string; ok: boolean }>();
  const sessions = new Map<string, { memberId: string; last: number; iphone?: boolean }>();
  let fails: number[] = [];
  let lastFridgeReading: Date | null = null;
  const openedAt = new Date();

  const equipments: Equipment[] = [
    { id: 'e1', name: 'Frigo (positif)', type: 'froid_positif', min: 0, max: 4, defaultValue: 3.5 },
    { id: 'e2', name: 'Congélateur', type: 'froid_negatif', min: null, max: -18, defaultValue: -20 },
    { id: 'e3', name: 'Saladette', type: 'froid_positif', min: 2, max: 4, defaultValue: 3 },
    { id: 'e4', name: 'Réchauffe à cœur (saucisses)', type: 'cuisson', min: 72, max: null, defaultValue: 75 },
    { id: 'e5', name: 'Maintien au chaud', type: 'maintien_chaud', min: 65, max: null, defaultValue: 68 },
    { id: 'e6', name: 'Friteuse 1', type: 'friteuse', min: null, max: 175, defaultValue: 170 },
  ];
  const catalog = new Map<string, { product: string; supplier: string }>();
  const trained = new Set<string>(['m1']);
  const trainedAt = new Map<string, { at: Date; score: number }>([['m1', { at: ago(60 * 24 * 20), score: 5 }]]);
  const audit: AuditEntry[] = [];
  const inspectors = new Map<string, { until: Date; by: string }>();
  const insp = (t: string) => { const i = inspectors.get(t); if (!i || i.until < new Date()) throw new Error('Accès inspecteur expiré'); return i; };
  const privacy = new Map<string, Date>([['m1', ago(60 * 24 * 3)]]);   // notice LPD lue
  const checklists = new Map<string, string>();      // mode -> jour fait (montage : id de l'événement)
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d: Date, n: number) => { const x = dayStart(d); x.setDate(x.getDate() + n); return x; };
  const events: EventInfo[] = [
    { id: 'ev1', name: 'Festival (exemple)', place: 'Lausanne', start: addDays(new Date(), -1), end: addDays(new Date(), 1), organizer: 'Association du festival',
      ofcoRef: '', team: ['m1', 'm2', 'm3', 'm4', 'm5'], equipment: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'], notes: 'Électricité 16 A fournie par l’organisateur' },
    { id: 'ev0', name: 'Marché (exemple)', place: 'Morges', start: addDays(new Date(), -40), end: addDays(new Date(), -38), organizer: 'Commune',
      ofcoRef: 'Annoncé', team: ['m1', 'm3', 'm4'], equipment: ['e1', 'e3', 'e4', 'e6'], notes: '' },
  ];
  const pastSummary: Record<string, EventSummary> = { ev0: { jours: 3, releves: 38, relevesRouges: 1, ncOuvertes: 0, ncCloturees: 2, nettoyages: 61,
    receptions: 9, lotsProduits: 14, lotsJetes: 3, heures: 87, personnes: 3, checklistsMontage: true } };
  const current = (now: Date) => events.find((e) => dayStart(now) >= e.start && dayStart(now) <= e.end) ?? null;
  const dayOf = (e: EventInfo, now: Date) => Math.round((dayStart(now).getTime() - e.start.getTime()) / 86_400_000) + 1;
  const length = (e: EventInfo) => Math.round((e.end.getTime() - e.start.getTime()) / 86_400_000) + 1;
  // Exemples d'heures : marché passé (3 jours) et un oubli de dépointage d'hier soir
  const at = (day: Date, h: number, m = 0) => { const x = new Date(day); x.setHours(h, m, 0, 0); return x; };
  for (let k = 0; k < 3; k++) for (const [id, prenom, poste, s0, e0] of [['m1', 'Orlando', 'Gérant', 9, 19], ['m3', 'Esteban', 'Chef de cuisine', 10, 20], ['m4', 'Lucía', 'Aide de cuisine', 11, 18]] as const) {
    const day = addDays(events[1].start, k);
    entries.push({ id: crypto.randomUUID(), memberId: id, prenom, poste, eventId: 'ev0', start: at(day, s0), end: at(day, e0),
      breaks: [{ start: at(day, 15), end: at(day, 15, 45) }], corrections: [] });
  }
  entries.push({ id: crypto.randomUUID(), memberId: 'm2', prenom: 'Vincent', poste: 'Manager', eventId: 'ev1', start: at(addDays(new Date(), -1), 8, 30), end: null,
    breaks: [{ start: at(addDays(new Date(), -1), 14), end: at(addDays(new Date(), -1), 14, 40) }], corrections: [] });
  const hot: HotBatch[] = [];
  let lastReview: Date | null = null;
  const recipes: Recipe[] = [
    { id: 'r1', name: "Sauce Original's", code: 'ORI', shelfDays: 2, allergens: ['oeufs', 'moutarde', 'poisson'] },
    { id: 'r2', name: 'Sauce jalapeños', code: 'JAL', shelfDays: 2, allergens: ['oeufs', 'moutarde'] },
    { id: 'r3', name: 'Guacamole', code: 'GUA', shelfDays: 2, allergens: [] },
    { id: 'r4', name: 'Coleslaw chou rouge', code: 'COL', shelfDays: 2, allergens: [] },
    { id: 'r5', name: 'Purée haricots rouges', code: 'HAR', shelfDays: 2, allergens: [] },
  ];
  const daysAgo = (n: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d; };
  const lots: Omit<Lot, 'status'>[] = [
    ['r4', 3], ['r3', 2], ['r1', 1],
  ].map(([rid, n], i) => {
    const r = recipes.find((x) => x.id === rid)!; const p = daysAgo(n as number);
    return { id: 'l' + i, kind: 'preparation' as const, recipeName: r.name, lotCode: lotCode(r.code, p, 1), producedOn: p, useBy: useBy(p, r.shelfDays), by: 'Esteban', disposed: null };
  });
  const lotStatus = (l: Omit<Lot, 'status'>, now: Date): Lot['status'] => {
    if (l.disposed) return 'jete';
    const t = new Date(now); t.setHours(0, 0, 0, 0);
    return t > l.useBy ? 'a_jeter' : t.getTime() === l.useBy.getTime() ? 'aujourd_hui' : 'a_garder';
  };
  const tasks: (Omit<CleaningTask, 'dueAt'> & { interval: number | null })[] = [
    { id: 't1', name: 'Zone caisse et service', product: 'Désinfectant alimentaire · [dosage étiquette] · gants', frequency: 'Toutes les 2 h', interval: 120, lastDone: { by: 'Noah', at: ago(127) } },
    { id: 't2', name: 'Sol', product: 'Détergent + désinfectant · [dosage étiquette] · gants', frequency: 'Fin de service et dès salissure', interval: 120, lastDone: { by: 'Lucía', at: ago(110) } },
    { id: 't3', name: 'Poubelles et containers', product: 'Désinfectant détergent · gants', frequency: 'Dès ¾ pleines et en fin de service', interval: 360, lastDone: { by: 'Esteban', at: ago(60) } },
    { id: 't4', name: 'Plans de travail inox', product: 'Désinfectant alimentaire · [temps de contact étiquette]', frequency: 'À chaque changement de tâche', interval: null, lastDone: { by: 'Esteban', at: ago(25) } },
    { id: 't5', name: 'Ustensiles et pinces', product: 'Détergent + désinfectant', frequency: 'Après utilisation', interval: null, lastDone: null },
    { id: 't6', name: 'Sonde du thermomètre', product: 'Lingette désinfectante alimentaire', frequency: 'Avant chaque mesure', interval: null, lastDone: null },
    { id: 't7', name: 'Lave-mains', product: 'Détergent · gants', frequency: '1× par jour', interval: null, lastDone: null },
    { id: 't8', name: 'Bacs et contenants', product: 'Détergent + désinfectant', frequency: 'À chaque vidage', interval: null, lastDone: null },
    { id: 't9', name: 'Friteuse (cuve complète)', product: 'Produit spécial friture · gants + lunettes', frequency: 'À chaque changement d’huile ; extérieur chaque soir', interval: null, lastDone: null },
    { id: 't10', name: 'Frigos (intérieur complet)', product: 'Désinfectant alimentaire', frequency: 'Montage, démontage et 1× par semaine ; poignées et joints chaque jour', interval: null, lastDone: null },
    { id: 't11', name: 'Tablette NORMA', product: 'Lingette désinfectante', frequency: 'Début et fin de service', interval: null, lastDone: null },
  ];

  const member = (token: string) => {
    const s = sessions.get(token);
    if (!s || (!s.iphone && Date.now() - s.last > 120_000)) throw new Error('Session expirée : retapez votre code');
    s.last = Date.now();
    return DEMO_MEMBERS.find((m) => m.id === s.memberId)!;
  };
  const extras = new Map<string, Right[]>();          // droits ajoutés à une personne (D23)
  const can = (m: { id?: string; poste: string }, r: Right) => POSTES[m.poste].includes(r) || (!!m.id && !!extras.get(m.id)?.includes(r));
  const rightsOf = (m: { id: string; poste: string }) => [...new Set([...POSTES[m.poste], ...(extras.get(m.id) ?? [])])];
  // Limites officielles : on ne peut que les rendre plus strictes (identique au trigger equipment_threshold)
  const LIMITS: Record<Equipment['type'], { min: number | null; max: number | null; source: string }> = {
    froid_positif: { min: null, max: 5, source: 'Directive OFCO VD 08.04.2019 · BPHR 6.2 : 5 °C max' },
    froid_negatif: { min: null, max: -18, source: 'Directive OFCO VD 08.04.2019 : −18 °C' },
    cuisson: { min: 70, max: null, source: 'BPHR 2.4.4 : 70 °C à cœur, 2 min' },
    maintien_chaud: { min: 65, max: null, source: 'Directive OFCO VD 08.04.2019 · BPHR 2.4.4 : 65 °C min' },
    friteuse: { min: null, max: 175, source: 'BPHR 2.4.4 : 175 °C max' },
  };
  const DEFAULTS: Record<Equipment['type'], { min: number | null; max: number | null; def: number }> = {
    froid_positif: { min: 0, max: 4, def: 3.5 }, froid_negatif: { min: null, max: -18, def: -20 }, cuisson: { min: 72, max: null, def: 75 },
    maintien_chaud: { min: 65, max: null, def: 68 }, friteuse: { min: null, max: 175, def: 170 } };
  const LOCKED: Right[] = ['pointage', 'prise_poste', 'signaler_nc'];   // jamais retirés : sécurité de base
  const newPin = () => { let p: string; do { p = String(Math.floor(Math.random() * 10000)).padStart(4, '0'); } while (isWeakPin(p) || DEMO_MEMBERS.some((x) => x.pin === p)); return p; };
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
      if (arrivee) entries.push({ id: crypto.randomUUID(), memberId: m.id, prenom: m.prenom, poste: m.poste, eventId: current(new Date())?.id ?? null,
        start: new Date(), end: null, breaks: [], corrections: [] });
      const token = crypto.randomUUID();
      sessions.set(token, { memberId: m.id, last: Date.now() });
      const s: Session = { token, memberId: m.id, langue: m.lang, prenom: m.prenom, poste: m.poste, arrivee, droits: rightsOf(m), aptToday: aptToday(m.id), privacyAck: privacy.has(m.id), onBreak: !!active(m.id)?.breaks.some((b) => !b.end), trained: trained.has(m.id) };
      return s;
    },
    async closeSession(token) { sessions.delete(token); },
    async depointer(token) {
      const m = member(token); const e = active(m.id); const now = new Date();
      if (e) { e.breaks.forEach((b) => { if (!b.end) b.end = now; }); e.end = now; }
      sessions.delete(token);
    },
    async startBreak(token) {
      const e = active(member(token).id);
      if (!e) throw new Error('Pas pointé'); if (e.breaks.some((b) => !b.end)) throw new Error('Déjà en pause');
      e.breaks.push({ start: new Date(), end: null });
    },
    async endBreak(token) { const b = active(member(token).id)?.breaks.find((x) => !x.end); if (b) b.end = new Date(); },
    async timeEntries(from, to) {
      return entries.filter((e) => e.start < to && (e.end ?? new Date()) >= from).sort((a, b) => b.start.getTime() - a.start.getTime())
        .map((e) => ({ ...e, breaks: e.breaks.map((b) => ({ ...b })), corrections: [...e.corrections] }));
    },
    async correctEntry(token, id, v, reason) {
      const m = member(token);
      if (!can(m, 'heures_equipe')) throw new Error('Correction des heures non autorisée');
      if (reason.trim().length < 3) throw new Error('Indiquez le motif de la correction');
      const err = checkEntry(v); if (err) throw new Error(err);
      const e = entries.find((x) => x.id === id)!;
      const f = (d: Date | null) => (d ? d.toLocaleString('fr-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'en service');
      const what: string[] = [];
      if (e.start.getTime() !== v.start.getTime()) what.push(`arrivée ${f(e.start)} → ${f(v.start)}`);
      if ((e.end?.getTime() ?? 0) !== (v.end?.getTime() ?? 0)) what.push(`départ ${f(e.end)} → ${f(v.end)}`);
      if (JSON.stringify(e.breaks) !== JSON.stringify(v.breaks)) what.push(`pauses ${e.breaks.length} → ${v.breaks.length}`);
      if (!what.length) return;
      e.corrections.push({ at: new Date(), by: m.prenom, what: what.join(' ; '), reason: reason.trim() });
      Object.assign(e, { start: v.start, end: v.end, breaks: v.breaks });
    },
    async hoursAlerts(now) {
      return entries.filter((e) => !e.end && now.getTime() - e.start.getTime() > FORGOT_AFTER_H * 3_600_000)
        .map((e) => ({ entryId: e.id, prenom: e.prenom, since: e.start, hours: Math.floor((now.getTime() - e.start.getTime()) / 3_600_000) }));
    },
    async prisePoste(token, a) { const m = member(token); fit.set(m.id, { day: today(), ok: a.apte && a.tenue && a.bijoux && a.mains }); },
    async equipments() { return equipments; },
    async releve(token, equipmentId, value) {
      const m = member(token);
      if (!can(m, 'releves')) throw new Error('Ce poste n’a pas le droit de saisir des relevés');
      if (!aptToday(m.id)) throw new Error('Prise de poste non conforme ou non faite aujourd’hui');
      const e = equipments.find((x) => x.id === equipmentId)!;
      if (e.id === 'e1') lastFridgeReading = new Date();
      const status = readingStatus(value, e.min, e.max);
      stats.releves++;
      log.readings.push({ time: hm(), equipment: e.name, value: fmt1(value) + ' °C', status, by: m.prenom, source: sessions.get(token)!.iphone ? 'iPhone ' + m.poste : 'Tablette' });
      if (status === 'rouge') { stats.relevesRouges++; openNc('Température', `${e.name} : ${value.toFixed(1).replace('.', ',')} °C hors seuil`, m.prenom); }
      return { status };
    },
    async cleaningTasks() { return tasks.map((t) => ({ ...t, dueAt: due(t) })); },
    async nettoyage(token, taskId) {
      const m = member(token);
      if (!can(m, 'nettoyage')) throw new Error('Ce poste n’a pas le droit de valider un nettoyage');
      tasks.find((t) => t.id === taskId)!.lastDone = { by: m.prenom, at: new Date() };
      stats.nettoyagesFaits++;
      const t = tasks.find((x) => x.id === taskId)!;
      log.cleaning.push({ time: hm(), item: t.name, product: t.product, by: m.prenom, note: '' });
    },
    async huile(token, i) {
      const m = member(token);
      if (!can(m, 'releves')) throw new Error('Ce poste n’a pas le droit de contrôler l’huile');
      if (!aptToday(m.id)) throw new Error('Prise de poste non conforme ou non faite aujourd’hui');
      const mustChange = (i.polar !== null && i.polar >= 25) || i.defects.length > 0;
      log.oil.push({ time: hm(), fryer: equipments.find((x) => x.id === i.equipmentId)!.name, moment: i.moment.charAt(0).toUpperCase() + i.moment.slice(1),
        temp: i.temperature === null ? '—' : i.temperature + ' °C', polar: i.polar === null ? '—' : fmt1(i.polar) + ' %',
        aspect: i.defects.length ? i.defects.join(', ') : 'Normal', actions: [i.filtered && 'Filtrée', i.changed && 'Changée', mustChange && !i.changed && 'À changer'].filter(Boolean).join(' · ') || '—', by: m.prenom });
      if (mustChange && !i.changed && i.moment !== 'soir') openNc('Huile', 'Huile dégradée non changée (' + i.defects.join(', ') + ')', m.prenom);
      return { mustChange };
    },
    async reception(token, i) {
      const m = member(token);
      if (!can(m, 'reception')) throw new Error('Ce poste n’a pas le droit de réceptionner');
      if (i.accepted && !i.checks.every(Boolean)) throw new Error('Acceptation impossible : un contrôle est à NON');
      if (i.accepted && new Date(i.dlc) < daysAgo(0)) throw new Error('Acceptation impossible : DLC dépassée');
      if (i.barcode && !catalog.has(i.barcode)) catalog.set(i.barcode, { product: i.product, supplier: i.supplier });
      stats.receptions++;
      log.receptions.push({ time: hm(), supplier: i.supplier + (i.ownTransport ? ' (transport propre)' : ''), product: i.product, lot: i.lot, dlc: new Date(i.dlc).toLocaleDateString('fr-CH'), temp: fmt1(i.temperature) + ' °C',
        result: i.accepted ? 'Acceptée' : 'Refusée : ' + i.refusalReason, by: m.prenom, photo: i.photo });
      if (!i.accepted) openNc('Réception', `${i.product} refusé : ${i.refusalReason}`, m.prenom);
    },
    async scanBarcode(token, code) { member(token); return catalog.get(code) ?? null; },
    async suppliers() { return [...new Set(['Carnadis Sàrl', 'Prodega', 'Aligro', 'Transgourmet', ...[...catalog.values()].map((c) => c.supplier)])]; },
    async recipes() { return recipes; },
    async lots(now) { return lots.map((l) => ({ ...l, status: lotStatus(l, now) })); },
    async preparation(token, recipeId) {
      const m = member(token);
      if (!can(m, 'preparations')) throw new Error('Ce poste n’a pas le droit de produire une préparation');
      if (!aptToday(m.id)) throw new Error('Prise de poste non conforme ou non faite aujourd’hui');
      const r = recipes.find((x) => x.id === recipeId)!; const p = daysAgo(0);
      const seq = lots.filter((l) => l.lotCode.startsWith(lotCode(r.code, p, 0).slice(0, -1))).length + 1;
      const l = { id: crypto.randomUUID(), kind: 'preparation' as const, recipeName: r.name, lotCode: lotCode(r.code, p, seq), producedOn: p, useBy: useBy(p, r.shelfDays), by: m.prenom, disposed: null };
      lots.push(l);
      return { ...l, status: lotStatus(l, new Date()) };
    },
    async jeterLot(token, lotId) {
      const m = member(token);
      if (!can(m, 'jeter_lot')) throw new Error('Ce poste n’a pas le droit de jeter un lot');
      const l = lots.find((x) => x.id === lotId)!;
      if (l.disposed) throw new Error('Lot déjà jeté');
      l.disposed = { by: m.prenom, at: new Date() };
      lotDisposedAt.set(l.id, `Jeté ${hm()} · ${m.prenom}`);
    },
    async dishes() {
      // Exemple à valider avec les étiquettes réelles des produits (D-phase 1, points 3-4)
      const ing: Record<string, string[]> = {
        'Pain hot-dog': ['gluten'], 'Saucisse volaille': [], 'Ketchup': [], 'Moutarde': ['moutarde'], 'Oignons frits': ['gluten'],
        'Guacamole': [], 'Tomate': [], 'Fromage': ['lait'], "Sauce Original's": ['oeufs', 'moutarde', 'poisson'],
        'Sauce jalapeños': ['oeufs', 'moutarde'], 'Purée haricots rouges': [], 'Crispcheese': ['lait', 'gluten'],
        'Chou rouge': [], 'Frites': [], 'Ciboulette': [],
      };
      const d = (name: string, list: string[]): Dish => ({ name, ingredients: list, allergens: [...new Set(list.flatMap((i) => ing[i] ?? []))],
        meatOrigin: list.includes('Saucisse volaille') ? 'Volaille : [pays de production · mode d’élevage, selon Carnadis]' : null });
      return [
        d('Completo Classic', ['Pain hot-dog', 'Saucisse volaille', 'Ketchup', 'Moutarde', 'Oignons frits']),
        d('Completo Original', ['Pain hot-dog', 'Saucisse volaille', 'Guacamole', 'Tomate', 'Fromage', "Sauce Original's", 'Ciboulette']),
        d('Completo Spicy', ['Pain hot-dog', 'Saucisse volaille', 'Purée haricots rouges', 'Tomate', 'Crispcheese', 'Sauce jalapeños']),
        d('Completo Royal', ['Pain hot-dog', 'Saucisse volaille', 'Guacamole', 'Tomate', 'Chou rouge', 'Oignons frits']),
        d('Salchipapa', ['Frites', 'Saucisse volaille', "Sauce Original's", 'Sauce jalapeños', 'Ciboulette']),
      ];
    },
    async signaler(token, kind, description) {
      const m = member(token);
      if (!can(m, 'signaler_nc')) throw new Error('Ce poste ne peut pas signaler');
      const labels: Record<string, string> = { corps_etranger: 'Corps étranger', allergie: 'Réaction allergique', intoxication: 'Plainte / suspicion d’intoxication', coupure_courant: 'Coupure de courant', nuisibles: 'Nuisibles', materiel: 'Matériel', hygiene: 'Hygiène', autre: 'Autre' };
      openNc(labels[kind], description, m.prenom);
    },
    async directionLogin(memberId) {
      const m = DEMO_MEMBERS.find((x) => x.id === memberId)!;
      if (!['Gérant', 'Manager'].includes(m.poste)) throw new Error('Espace Direction réservé au Gérant et au Manager');
      const token = crypto.randomUUID();
      sessions.set(token, { memberId: m.id, last: Date.now(), iphone: true });   // pas d'expiration courte sur l'iPhone (Face ID)
      return { token, memberId: m.id, langue: 'fr', prenom: m.prenom, poste: m.poste, arrivee: false, droits: rightsOf(m), aptToday: aptToday(m.id), privacyAck: true, onBreak: false, trained: true };
    },
    async nonconformities() { return ncs.map((n) => ({ ...n, steps: [...n.steps] })); },
    async ncStep(token, ncId, step, content) {
      const m = member(token);
      const n = ncs.find((x) => x.id === ncId)!;
      if (n.closed) throw new Error('Non-conformité déjà clôturée');
      if (step === 'cloture') {
        if (!can(m, 'cloturer_nc')) throw new Error('Clôture non autorisée pour ce poste');
        if (!n.steps.some((s) => s.step === 'action_corrective') || !n.steps.some((s) => s.step === 'verification'))
          throw new Error('Clôture impossible : action corrective et vérification requises');
        n.closed = true;
      } else if (step !== 'mesure_immediate' && !can(m, 'traiter_nc')) throw new Error('Traitement non autorisé pour ce poste');
      n.steps.push({ step, content, by: m.prenom, at: new Date() });
    },
    async team() {
      return DEMO_MEMBERS.map((m) => ({ id: m.id, prenom: m.prenom, poste: m.poste, clockedIn: clockedIn.has(m.id), since: clockedIn.get(m.id) ?? null,
        aptToday: fit.get(m.id)?.day === today() ? fit.get(m.id)!.ok : null }));
    },
    async addMember(token, prenom, poste) {
      const m = member(token);
      if (!can(m, 'gestion_equipe')) throw new Error('Gestion de l’équipe non autorisée');
      if (poste === 'Gérant' || (poste === 'Manager' && m.poste !== 'Gérant')) throw new Error('Seul le Gérant peut nommer un Manager');
      const pin = newPin();
      DEMO_MEMBERS.push({ id: crypto.randomUUID(), prenom, poste, pin, lang: 'fr' });
      return pin;
    },
    async resetPin(token, memberId) {
      const m = member(token);
      if (!can(m, 'gestion_equipe')) throw new Error('Gestion de l’équipe non autorisée');
      const t = DEMO_MEMBERS.find((x) => x.id === memberId)!;
      if (t.poste === 'Gérant' && m.poste !== 'Gérant') throw new Error('Le code du Gérant ne peut pas être modifié par le Manager');
      t.pin = newPin();
      return t.pin;
    },
    async openInspector(token) {
      const m = member(token);
      if (!can(m, 'export')) throw new Error('Mode inspecteur réservé au Gérant et au Manager');
      const t = crypto.randomUUID(), until = new Date(Date.now() + 2 * 3_600_000);
      inspectors.set(t, { until, by: m.prenom });
      audit.unshift({ at: new Date(), who: m.prenom, action: 'Accès inspecteur ouvert (lecture seule, 2 h)' });
      return { token: t, until, openedBy: m.prenom };
    },
    async closeInspector(t) {
      const i = inspectors.get(t); if (!i) return;
      inspectors.delete(t); audit.unshift({ at: new Date(), who: i.by, action: 'Accès inspecteur fermé' });
    },
    async inspectorDay(t, day) {
      insp(t);
      audit.unshift({ at: new Date(), who: 'Inspecteur', action: `Registres du ${day.toLocaleDateString('fr-CH')} consultés` });
      const r = await this.dayReport(day);
      if (day.toDateString() === new Date().toDateString()) return r;
      return { ...r, readings: [], oil: [], receptions: [], cleaning: [], cleaningMissed: [], lots: [], ncs: [] };   // démo : seul le jour courant a des registres
    },
    async inspectorInfo(t) {
      insp(t);
      const r = await this.dayReport(new Date());
      return { thresholds: r.thresholds, documents: await this.documents(), haccpReview: lastReview,
        trainings: DEMO_MEMBERS.filter((m) => trainedAt.has(m.id)).map((m) => ({ name: `${m.prenom} (${m.poste})`, at: trainedAt.get(m.id)!.at.toLocaleDateString('fr-CH'), score: trainedAt.get(m.id)!.score })),
        events: events.map((e) => ({ name: e.name, place: e.place, dates: `${e.start.toLocaleDateString('fr-CH')} → ${e.end.toLocaleDateString('fr-CH')}`, ofco: e.ofcoRef || 'non renseignée' })) };
    },
    async auditLog() { return audit.map((a) => ({ ...a })); },
    async dayReport(now) {
      const steps: Record<string, string> = { mesure_immediate: 'Mesure immédiate', evaluation_risque: 'Évaluation du risque', action_corrective: 'Action corrective', verification: 'Vérification', cloture: 'Clôture' };
      return {
        company: { name: "ORIGINAL'S COMPLETOS", address: 'Bussigny, Suisse', phone: '078 352 12 02', email: 'info@originalscompletos.ch', responsable: 'Orlando Quispe Oscco' },
        event: (() => { const e = current(now); return e ? `${e.name} · ${e.place} · jour ${dayOf(e, now)}/${length(e)}` : 'Hors événement'; })(), date: now, generatedAt: now,
        thresholds: [
          { label: 'Froid positif', value: '0 à 4 °C', source: 'Règle interne (VD : 5 °C max)' },
          { label: 'Congélateur', value: '≤ −18 °C', source: 'Directive OFCO VD 08.04.2019' },
          { label: 'Maintien au chaud', value: '≥ 65 °C, 3 h max', source: 'Directive OFCO VD 08.04.2019 · BPHR 2.4.4' },
          { label: 'Réchauffe à cœur', value: '≥ 72 °C, 2 min', source: 'Règle interne (BPHR 2.4.4 : 70 °C, 2 min)' },
          { label: 'Huile', value: '≤ 175 °C / < 25 %', source: 'Règle interne (BPHR 2.4.4 : 175 °C, 27 %)' },
          { label: 'Préparations maison', value: 'J+2, ≤ 4 °C', source: 'BPHR 6.3.1 (production + 2 jours)' },
        ],
        attendance: entries.filter((e) => e.start.toDateString() === now.toDateString() || (!e.end && now.toDateString() === new Date().toDateString())).map((e) => ({ name: e.prenom, poste: e.poste, arrival: hm(e.start),
          departure: e.end ? hm(e.end) : null, pauses: e.breaks.map((b) => `${hm(b.start)}–${b.end ? hm(b.end) : '…'}`).join(', '),
          apte: fit.get(e.memberId)?.day === today() ? fit.get(e.memberId)!.ok : null })),
        readings: log.readings, oil: log.oil, receptions: log.receptions, cleaning: log.cleaning,
        cleaningMissed: tasks.filter((t) => { const d = due(t); return d && d < now; }).map((t) => ({ item: t.name, due: hm(due(t)!) })),
        lots: lots.map((l) => ({ lot: l.lotCode, recipe: l.recipeName, by: l.by, useBy: l.useBy.toLocaleDateString('fr-CH'), disposed: lotDisposedAt.get(l.id) ?? (l.disposed ? 'Jeté' : '—') })),
        ncs: ncs.map((n) => ({ opened: hm(n.openedAt), kind: n.kind, description: n.description, by: n.openedBy, status: n.closed ? 'Clôturée' : 'OUVERTE',
          steps: n.steps.map((s) => `${hm(s.at)} ${steps[s.step]} : ${s.content} (${s.by})`) })),
      };
    },
    async officialLimits() { return LIMITS; },
    async saveEquipment(token, input) {
      const m = member(token);
      if (!can(m, 'equipements')) throw new Error('Gestion du matériel non autorisée');
      if (!input.name.trim()) throw new Error('Nom obligatoire');
      const old = input.id ? equipments.find((x) => x.id === input.id) : undefined;
      const d = DEFAULTS[input.type];
      let { min, max } = input;
      const changed = old ? old.min !== min || old.max !== max || old.type !== input.type : min !== d.min || max !== d.max;
      if (changed && !can(m, 'reglages_gerant')) throw new Error('Seul le Gérant peut modifier les seuils');
      const l = LIMITS[input.type];
      if (l.max !== null && (max === null || max > l.max)) throw new Error(`Seuil max moins strict que la limite officielle (${l.source})`);
      if (l.min !== null && (min === null || min < l.min)) throw new Error(`Seuil min moins strict que la limite officielle (${l.source})`);
      if (min !== null && max !== null && min >= max) throw new Error('Le minimum doit être inférieur au maximum');
      const def = min !== null && max !== null ? (min + max) / 2 : min !== null ? min + 3 : max! - 2;
      if (old) Object.assign(old, { name: input.name.trim(), type: input.type, min, max, defaultValue: def });
      else {
        const id = crypto.randomUUID();
        equipments.push({ id, name: input.name.trim(), type: input.type, min, max, defaultValue: def });
        tasks.push({ id: 't-' + id, name: input.name.trim(), product: '[à définir]', frequency: 'À définir dans le plan', interval: null, lastDone: null });
      }
    },
    async deleteEquipment(token, id) {
      const m = member(token);
      if (!can(m, 'equipements')) throw new Error('Gestion du matériel non autorisée');
      equipments.splice(equipments.findIndex((x) => x.id === id), 1);   // serveur : archivé, les relevés restent
    },
    async saveCleaningTask(token, t) {
      const m = member(token);
      if (!can(m, 'reglages_gerant')) throw new Error('Seul le Gérant peut modifier le plan de nettoyage');
      if (!t.name.trim() || !t.frequency.trim()) throw new Error('Zone et fréquence obligatoires');
      const old = t.id ? tasks.find((x) => x.id === t.id) : undefined;
      const v = { name: t.name.trim(), product: t.product.trim(), frequency: t.frequency.trim(), interval: t.interval };
      if (old) Object.assign(old, v); else tasks.push({ id: crypto.randomUUID(), ...v, lastDone: null });
    },
    async deleteCleaningTask(token, id) {
      const m = member(token);
      if (!can(m, 'reglages_gerant')) throw new Error('Seul le Gérant peut modifier le plan de nettoyage');
      tasks.splice(tasks.findIndex((x) => x.id === id), 1);
    },
    async postes() { return Object.fromEntries(Object.entries(POSTES).map(([k, v]) => [k, [...v]])); },
    async setPosteRights(token, poste, rights) {
      const m = member(token);
      if (!can(m, 'reglages_gerant')) throw new Error('Seul le Gérant peut modifier les droits');
      if (poste === 'Gérant') throw new Error('Les droits du Gérant ne se modifient pas');
      POSTES[poste] = [...new Set([...LOCKED, ...rights.filter((r) => r !== 'reglages_gerant')])];
    },
    async extraRights() { return Object.fromEntries(extras); },
    async setExtraRights(token, memberId, rights) {
      const m = member(token);
      if (!can(m, 'reglages_gerant')) throw new Error('Seul le Gérant peut modifier les droits');
      extras.set(memberId, rights.filter((r) => r !== 'reglages_gerant'));
    },
    async ackPrivacy(token) { const m = member(token); privacy.set(m.id, new Date()); },
    async privacyAcks() { return DEMO_MEMBERS.filter((m) => privacy.has(m.id)).map((m) => ({ name: `${m.prenom} (${m.poste})`, at: privacy.get(m.id)!.toLocaleString('fr-CH') })); },
    async events() { return [...events].sort((a, b) => b.start.getTime() - a.start.getTime()).map((e) => ({ ...e })); },
    async currentEvent(now) { const e = current(now); return e ? { ...e } : null; },
    async saveEvent(token, input) {
      const m = member(token);
      if (!can(m, 'gestion_equipe')) throw new Error('Gestion des événements non autorisée');
      if (!input.name.trim()) throw new Error('Nom de l’événement obligatoire');
      if (input.end < input.start) throw new Error('La date de fin est avant la date de début');
      const e = { ...input, id: input.id ?? crypto.randomUUID(), start: dayStart(input.start), end: dayStart(input.end) };
      const i = events.findIndex((x) => x.id === e.id);
      if (i >= 0) events[i] = e; else events.push(e);
    },
    async deleteEvent(token, id) {
      const m = member(token);
      if (!can(m, 'reglages_gerant')) throw new Error('Seul le Gérant peut supprimer un événement');
      if (pastSummary[id] || current(new Date())?.id === id) throw new Error('Événement avec des enregistrements : suppression impossible');
      events.splice(events.findIndex((x) => x.id === id), 1);
    },
    async eventSummary(id, now) {
      if (pastSummary[id]) return pastSummary[id];
      const e = events.find((x) => x.id === id)!;
      if (current(now)?.id !== id) return { jours: length(e), releves: 0, relevesRouges: 0, ncOuvertes: 0, ncCloturees: 0, nettoyages: 0, receptions: 0, lotsProduits: 0, lotsJetes: 0, heures: 0, personnes: 0, checklistsMontage: false };
      const evE = entries.filter((x) => x.eventId === id);
      const h = evE.reduce((s, x) => s + workedMinutes(x, now) / 60, 0);
      return { jours: length(e), releves: stats.releves, relevesRouges: stats.relevesRouges, ncOuvertes: ncs.filter((n) => !n.closed).length, ncCloturees: ncs.filter((n) => n.closed).length,
        nettoyages: stats.nettoyagesFaits, receptions: stats.receptions, lotsProduits: lots.length, lotsJetes: lots.filter((l) => l.disposed).length,
        heures: Math.round(h * 10) / 10, personnes: new Set(evE.map((x) => x.memberId)).size, checklistsMontage: checklists.get('montage') === id };
    },
    async checklistDone(mode) { return checklists.get(mode) === (mode === 'montage' ? current(new Date())?.id ?? today() : today()); },
    async saveChecklist(token, mode, answers, labels) {
      const m = member(token);
      const no = Object.entries(answers).filter(([, v]) => !v);
      no.forEach(([k]) => openNc('Checklist ' + mode, labels[k] + ' : NON', m.prenom));
      checklists.set(mode, mode === 'montage' ? current(new Date())?.id ?? today() : today());
      return no.length;
    },
    async saveTraining(token, score) {
      const m = member(token);
      if (score < 4) throw new Error('Moins de 4 bonnes réponses sur 5 : relisez le briefing et recommencez');
      trained.add(m.id); trainedAt.set(m.id, { at: new Date(), score });
    },
    async hotBatches() { return hot.map((h) => ({ ...h })); },
    async startHot(token, product) {
      const m = member(token);
      if (!can(m, 'releves') && !can(m, 'preparations')) throw new Error('Ce poste ne gère pas le maintien au chaud');
      hot.unshift({ id: crypto.randomUUID(), product, startedAt: new Date(), by: m.prenom, ended: null });
    },
    async endHot(token, id, how) {
      const m = member(token);
      const h = hot.find((x) => x.id === id)!;
      if (h.ended) throw new Error('Déjà terminé');
      if (how === 'vendu' && Date.now() - h.startedAt.getTime() > 3 * 3600_000) throw new Error('Plus de 3 h au chaud : élimination obligatoire');
      h.ended = { at: new Date(), how, by: m.prenom };
    },
    async openProduct(token, name, days) {
      const m = member(token);
      if (!can(m, 'preparations')) throw new Error('Ce poste n’a pas le droit d’étiqueter un produit');
      const p = daysAgo(0);
      const l = { id: crypto.randomUUID(), kind: 'ouvert' as const, recipeName: name + ' (entamé)', lotCode: 'Ouvert le ' + p.toLocaleDateString('fr-CH'),
        producedOn: p, useBy: useBy(p, days), by: m.prenom, disposed: null };
      lots.push(l);
      return { ...l, status: lotStatus(l, new Date()) };
    },
    async documents(): Promise<AdminDoc[]> {
      return [
        { id: 'ofco', name: 'Annonce à l’OFCO (art. 20 ODAlOUs)', status: 'manquant', detail: 'À faire avant le prochain événement' },
        { id: 'adresse', name: 'Attestation d’adresse en Suisse', status: 'ok', detail: 'À présenter sur le stand' },
        { id: 'rc', name: 'Extrait du registre du commerce', status: 'ok', detail: 'PDF déposé' },
        { id: 'haccp', name: 'Plan HACCP', status: 'a_jour', detail: 'Mettre à jour selon l’audit de conformité' },
        { id: 'bphr', name: 'Guide BPHR (imprimé dans le classeur)', status: 'ok', detail: 'Référence des seuils' },
        { id: 'affiche', name: 'Affichette « allergènes sur demande »', status: 'ok', detail: 'Imprimée par l’entreprise (D41)' },
        { id: 'entretien', name: 'Entretien des équipements (rapports de service)', status: 'a_jour', detail: 'Noter chaque entretien ou réparation' },
      ];
    },
    async haccpReview(token) { if (token) { member(token); lastReview = new Date(); } return lastReview; },
    async dayStats(now) {
      const late = tasks.filter((t) => { const d = due(t); return d && dueAlert(d, now) === 'rouge'; }).length;
      const aJeter = lots.filter((l) => lotStatus(l, now) === 'a_jeter').length;
      return { ...stats, nettoyagesEnRetard: late, lotsAJeter: aJeter };
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
      for (const h of hot.filter((x) => !x.ended)) {
        const d = new Date(h.startedAt.getTime() + 3 * 3600_000);
        if (dueAlert(d, now) !== 'ok') list.push({ title: `Maintien au chaud : ${h.product}`, dueAt: d, alert: dueAlert(d, now), who: whoCan('releves') });
      }
      if (checklists.get('ouverture') !== today()) {
        const d = new Date(openedAt.getTime() + 20 * 60_000);
        if (dueAlert(d, now) !== 'ok') list.push({ title: 'Checklist d’ouverture', dueAt: d, alert: dueAlert(d, now), who: whoCan('releves') });
      }
      return list.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    },
  };
}
