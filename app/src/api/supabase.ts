// Branchement Supabase : chaque méthode appelle une fonction RPC du schéma « norma » (migrations 001 à 005).
// Le serveur reste l'autorité : droits, seuils, horodatage, registres en ajout seul.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Right, Status } from '../domain/rules';
import { PRIVACY_VERSION } from '../domain/privacy';
import type { DayReport } from '../report/dailyReport';
import type { Api, CleaningTask, Equipment, EquipmentType, EventInfo, EventSummary, HoursAlert, HotBatch, Lot, Member, Nc,
  OfficialLimit, Session, StandAlert, TimeEntry, AdminDoc, Dish, Recipe, DayStats, Outage, AuditEntry, InspectorInfo } from './types';

/** Jeton des actions faites depuis l'iPhone (Gérant / Manager) : le serveur identifie la personne par son compte. */
export const IPHONE_TOKEN = 'iphone';
const tok = (t: string) => (t === IPHONE_TOKEN ? null : t);

const d = (s: string | null | undefined) => (s ? new Date(s) : null);
/** Date sans heure (AAAA-MM-JJ) → minuit local */
const day = (s: string) => { const [y, m, dd] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, dd); };
/** Jour local → AAAA-MM-JJ */
export const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

type J = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any

export function createSupabaseApi(sb: SupabaseClient): Api {
  const db = sb.schema('norma');
  async function rpc<T = J>(fn: string, args: J = {}): Promise<T> {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  }

  const session = (j: J): Session => ({ token: j.token ?? IPHONE_TOKEN, memberId: j.memberId, langue: j.langue, prenom: j.prenom, poste: j.poste,
    arrivee: j.arrivee, droits: j.droits as Right[], aptToday: j.aptToday, privacyAck: j.privacyAck, onBreak: j.onBreak, trained: j.trained });
  const lot = (j: J): Lot => ({ id: j.id, kind: j.kind, recipeName: j.recipeName, lotCode: j.lotCode, producedOn: day(j.producedOn), useBy: day(j.useBy),
    by: j.by, status: j.status, disposed: j.disposed ? { by: j.disposed.by, at: new Date(j.disposed.at) } : null });
  const nc = (j: J): Nc => ({ id: j.id, kind: j.kind, description: j.description, openedBy: j.openedBy, openedAt: new Date(j.openedAt),
    steps: (j.steps as J[]).map((s) => ({ step: s.step, content: s.content, by: s.by, at: new Date(s.at) })), closed: j.closed });
  const event = (j: J): EventInfo => ({ id: j.id, name: j.name, place: j.place, start: day(j.start), end: day(j.end), organizer: j.organizer,
    ofcoRef: j.ofcoRef, notes: j.notes, team: j.team, equipment: j.equipment });
  const report = (j: J): DayReport => ({ ...(j as DayReport), date: day(j.date), generatedAt: new Date(j.generatedAt) });

  return {
    // ---------------------------------------------------------------- sessions du stand
    async openSession(pin) { return session(await rpc('rpc_ouvrir', { p_pin: pin })); },
    async closeSession(token) { if (tok(token)) await rpc('rpc_fermer_session', { p_token: token }); },
    async depointer(token) { await rpc('rpc_depointer', { p_token: tok(token) }); },
    async prisePoste(token, a) { await rpc('rpc_prise_de_poste', { p_token: tok(token), p_apte: a.apte, p_tenue: a.tenue, p_bijoux: a.bijoux, p_mains: a.mains }); },
    async ackPrivacy(token) { await rpc('rpc_notice_lue', { p_token: tok(token), p_version: PRIVACY_VERSION }); },
    async saveTraining(token, score) {
      const ok = await rpc<boolean>('rpc_formation', { p_token: tok(token), p_score: score });
      if (!ok) throw new Error('Toutes les réponses doivent être justes (5 sur 5) : relisez le briefing et recommencez');
    },
    async startBreak(token) { await rpc('rpc_pause', { p_token: tok(token), p_debut: true }); },
    async endBreak(token) { await rpc('rpc_pause', { p_token: tok(token), p_debut: false }); },

    // ---------------------------------------------------------------- contrôles
    async equipments() { return rpc<Equipment[]>('rpc_lire_materiel'); },
    async releve(token, equipmentId, value, actions) {
      return { status: await rpc<Status>('rpc_releve2', { p_token: tok(token), p_equipment: equipmentId, p_value: value, p_actions: actions ?? [] }) };
    },
    async cleaningTasks(now) {
      return (await rpc<J[]>('rpc_lire_nettoyage', { p_now: now.toISOString() })).map((t): CleaningTask => ({ id: t.id, name: t.name, product: t.product,
        frequency: t.frequency, interval: t.interval, dueAt: d(t.dueAt), lastDone: t.lastDone ? { by: t.lastDone.by, at: new Date(t.lastDone.at) } : null }));
    },
    async nettoyage(token, taskId) { await rpc('rpc_nettoyage2', { p_token: tok(token), p_item: taskId }); },
    async alerts(now) {
      return (await rpc<J[]>('rpc_alertes', { p_now: now.toISOString() })).map((a): StandAlert => ({ title: a.title, dueAt: new Date(a.dueAt), alert: a.alert, who: a.who }));
    },
    async huile(token, i) {
      const r = await rpc<J[]>('rpc_huile', { p_token: tok(token), p_equipment: i.equipmentId, p_moment: i.moment, p_temperature: i.temperature,
        p_polar: i.polar, p_defects: i.defects, p_filtered: i.filtered, p_changed: i.changed });
      return { mustChange: !!r[0]?.must_change };
    },
    async reception(token, i) {
      let photo: string | null = null;
      if (i.photoData) {
        const me = await rpc<string>('my_company');
        const blob = await (await fetch(i.photoData)).blob();
        const path = `${me}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.jpg`;
        const { error } = await sb.storage.from('bons-livraison').upload(path, blob, { contentType: 'image/jpeg' });
        if (error) throw new Error('Photo du bon non enregistrée : ' + error.message);
        photo = path;
      }
      await rpc('rpc_reception', { p_token: tok(token), p_supplier: i.supplier + (i.ownTransport ? ' (transport propre)' : ''), p_product: i.product,
        p_lot: i.lot, p_dlc: i.dlc, p_temperature: i.temperature, p_packaging: i.checks[0], p_aspect: i.checks[1], p_order: i.checks[2], p_cold: i.checks[3],
        p_accepted: i.accepted, p_refusal: i.refusalReason, p_photo: photo, p_autofilled: i.autofilled, p_barcode: i.barcode });
    },
    async scanBarcode(token, code) {
      const r = await rpc<J[]>('rpc_produit_scanne', { p_token: tok(token), p_barcode: code });
      return r[0] ? { product: r[0].name, supplier: r[0].supplier } : null;
    },
    async suppliers() { return rpc<string[]>('rpc_fournisseurs'); },
    async recipes() { return rpc<Recipe[]>('rpc_recettes'); },
    async lots(now) { return (await rpc<J[]>('rpc_lots', { p_now: now.toISOString() })).map(lot); },
    async preparation(token, recipeId) {
      const r = await rpc<J[]>('rpc_preparation', { p_token: tok(token), p_recipe: recipeId });
      const all = await this.lots(new Date());
      return all.find((l) => l.lotCode === r[0].lot_code)!;
    },
    async jeterLot(token, lotId) { await rpc('rpc_jeter', { p_token: tok(token), p_id: lotId }); },
    async openProduct(token, name, days) { return lot(await rpc('rpc_produit_entame', { p_token: tok(token), p_name: name, p_days: days })); },
    async dishes() { return rpc<Dish[]>('rpc_plats'); },
    async signaler(token, kind, description) { await rpc('rpc_signaler2', { p_token: tok(token), p_kind: kind, p_description: description }); },
    async checklistDone(mode) { return rpc<boolean>('rpc_checklist_faite', { p_mode: mode }); },
    async saveChecklist(token, mode, answers, labels) {
      return rpc<number>('rpc_checklist', { p_token: tok(token), p_mode: mode, p_answers: answers, p_labels: labels });
    },
    async hotBatches() {
      return (await rpc<J[]>('rpc_bacs_chauds')).map((h): HotBatch => ({ id: h.id, product: h.product, startedAt: new Date(h.startedAt), by: h.by,
        ended: h.ended ? { at: new Date(h.ended.at), how: h.ended.how, by: h.ended.by } : null }));
    },
    async startHot(token, product) { await rpc('rpc_chaud_debut', { p_token: tok(token), p_product: product }); },
    async endHot(token, id, how) { await rpc('rpc_chaud_fin', { p_token: tok(token), p_batch: id, p_how: how }); },
    async outage() { const o = await rpc<J | null>('rpc_coupure'); return o ? ({ start: new Date(o.start), end: d(o.end), by: o.by } as Outage) : null; },
    async endOutage(token) { await rpc('rpc_courant_retabli', { p_token: tok(token) }); },

    // ---------------------------------------------------------------- Direction (iPhone)
    async directionLogin() {
      const me = await rpc<J>('rpc_moi');
      if (me.kind !== 'direction') throw new Error('Espace Direction réservé au Gérant et au Manager');
      return session(me.session);
    },
    async nonconformities() { return (await rpc<J[]>('rpc_incidents')).map(nc); },
    async ncStep(token, ncId, step, content) { await rpc('rpc_nc_etape', { p_token: tok(token), p_nc: ncId, p_step: step, p_content: content }); },
    async team() {
      return (await rpc<J[]>('rpc_equipe')).map((m): Member => ({ id: m.id, prenom: m.prenom, poste: m.poste, clockedIn: m.clockedIn, since: d(m.since), aptToday: m.aptToday }));
    },
    async addMember(_token, prenom, poste) { return rpc<string>('rpc_ajouter_membre', { p_prenom: prenom, p_nom: '', p_poste: poste, p_lang: 'fr' }); },
    async resetPin(_token, memberId) { return rpc<string>('rpc_nouveau_code', { p_member: memberId }); },
    async dayStats(now) { return rpc<DayStats>('rpc_stats_jour', { p_now: now.toISOString() }); },
    async dayReport(now) { return report(await rpc('rpc_rapport_jour', { p_day: iso(now) })); },
    async documents() { return rpc<AdminDoc[]>('rpc_documents'); },
    async haccpReview(token) {
      const r = token ? await rpc<string>('rpc_revue_haccp') : await rpc<string | null>('rpc_derniere_revue');
      return d(r);
    },
    async officialLimits() { return rpc<Record<EquipmentType, OfficialLimit>>('rpc_limites'); },
    async saveEquipment(_token, e) { await rpc('rpc_materiel', { p_id: e.id ?? null, p_name: e.name, p_type: e.type, p_min: e.min, p_max: e.max }); },
    async deleteEquipment(_token, id) { await rpc('rpc_materiel_retirer', { p_id: id }); },
    async saveCleaningTask(_token, t) {
      await rpc('rpc_tache_nettoyage', { p_id: t.id ?? null, p_name: t.name, p_product: t.product, p_label: t.frequency, p_interval: t.interval });
    },
    async deleteCleaningTask(_token, id) { await rpc('rpc_tache_retirer', { p_id: id }); },
    async postes() { return rpc<Record<string, Right[]>>('rpc_postes'); },
    async setPosteRights(_token, poste, rights) { await rpc('rpc_droits_poste', { p_poste: poste, p_rights: rights }); },
    async extraRights() { return rpc<Record<string, Right[]>>('rpc_droits_individuels'); },
    async setExtraRights(_token, memberId, rights) { await rpc('rpc_droits_membre', { p_member: memberId, p_rights: rights }); },
    async timeEntries(from, to) {
      return (await rpc<J[]>('rpc_heures', { p_from: from.toISOString(), p_to: to.toISOString() })).map((e): TimeEntry => ({
        id: e.id, memberId: e.memberId, prenom: e.prenom, poste: e.poste, eventId: e.eventId, start: new Date(e.start), end: d(e.end),
        breaks: (e.breaks as J[]).map((b) => ({ start: new Date(b.start), end: d(b.end) })),
        corrections: (e.corrections as J[]).map((c) => ({ at: new Date(c.at), by: c.by, what: c.what, reason: c.reason })) }));
    },
    async correctEntry(_token, id, v, reason) {
      await rpc('rpc_correction_heures', { p_arrivee: id, p_start: v.start.toISOString(), p_end: v.end?.toISOString() ?? null,
        p_breaks: v.breaks.map((b) => ({ start: b.start.toISOString(), end: b.end?.toISOString() ?? null })), p_reason: reason });
    },
    async hoursAlerts(now) {
      return (await rpc<J[]>('rpc_alertes_heures', { p_now: now.toISOString() })).map((a): HoursAlert => ({ entryId: a.entryId, prenom: a.prenom, since: new Date(a.since), hours: a.hours }));
    },
    async privacyAcks() { return rpc<{ name: string; at: string }[]>('rpc_lectures_notice'); },
    async openInspector() { const j = await rpc<J>('rpc_inspecteur_ouvrir'); return { token: j.token, until: new Date(j.until), openedBy: j.openedBy }; },
    async closeInspector(t) { await rpc('rpc_inspecteur_fermer', { p_token: t }); },
    async inspectorDay(t, dd) { return report(await rpc('rpc_inspecteur_jour', { p_token: t, p_day: iso(dd) })); },
    async inspectorInfo(t) { const j = await rpc<J>('rpc_inspecteur_info', { p_token: t }); return { ...(j as InspectorInfo), haccpReview: d(j.haccpReview) }; },
    async auditLog() { return (await rpc<J[]>('rpc_journal')).map((a): AuditEntry => ({ at: new Date(a.at), who: a.who, action: a.action })); },
    async events() { return (await rpc<J[]>('rpc_evenements')).map(event); },
    async currentEvent(now) { const e = await rpc<J | null>('rpc_evenement_courant', { p_day: iso(now) }); return e ? event(e) : null; },
    async saveEvent(_token, e) {
      await rpc('rpc_evenement', { p_id: e.id ?? null, p_name: e.name, p_place: e.place, p_start: iso(e.start), p_end: iso(e.end), p_organizer: e.organizer,
        p_ofco: e.ofcoRef, p_notes: e.notes, p_team: e.team, p_equipment: e.equipment });
    },
    async deleteEvent(_token, id) { await rpc('rpc_evenement_supprimer', { p_id: id }); },
    async eventSummary(id, now) { return rpc<EventSummary>('rpc_bilan_evenement', { p_id: id, p_now: now.toISOString() }); },
  };
}
