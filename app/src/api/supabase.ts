// Branchement Supabase : chaque méthode appelle une fonction RPC du schéma « norma » (migrations 001 à 005).
// Le serveur reste l'autorité : droits, seuils, horodatage, registres en ajout seul.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Right, Status } from '../domain/rules';
import { CONTROLLER, PRIVACY_VERSION } from '../domain/privacy';
import { currentSubscription, subscribePush } from '../notify/push';
import { readingStatus } from '../domain/rules';
import { sha256Hex, signatureCertificate, type HrDoc } from '../rh/rh';
import { kvDel, kvGet, kvSet, type QueueItem } from '../offline/store';
import { enqueue, flush, initSync, isNetworkError, looksOffline, markOffline, markOnline, OfflineError, syncState } from '../offline/sync';
import type { DayReport } from '../report/dailyReport';
import type { Api, CleaningTask, Equipment, EquipmentType, EventInfo, EventSummary, HoursAlert, HotBatch, Lot, Member, Nc,
  OfficialLimit, Session, MemberAccount, MemberDoc, MemberProfile, ReportSettings, StandAlert, TimeEntry, AdminDoc, Dish, Recipe, DayStats, Outage, AuditEntry, InspectorInfo } from './types';

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
  /** Appel réseau ; une coupure ou un délai dépassé devient OfflineError. */
  async function net<T = J>(fn: string, args: J = {}): Promise<T> {
    let r;
    try { r = await db.rpc(fn, args); } catch (e) { markOffline(); throw new OfflineError((e as Error).message); }
    if (r.error) {
      if (!r.status || isNetworkError(r.error.message)) { markOffline(); throw new OfflineError(r.error.message); }
      throw new Error(r.error.message);
    }
    markOnline();
    return r.data as T;
  }

  // ---------------------------------------------------------------- mode hors ligne (tablette)
  // Lectures : dernière réponse gardée sur la tablette. Saisies : file d'attente rejouée avec l'heure réelle (migration 007).
  const READS = new Set(['rpc_lire_materiel', 'rpc_lire_nettoyage', 'rpc_alertes', 'rpc_fournisseurs', 'rpc_recettes', 'rpc_lots', 'rpc_plats',
    'rpc_checklist_faite', 'rpc_bacs_chauds', 'rpc_coupure', 'rpc_documents', 'rpc_evenement_courant', 'rpc_limites', 'my_company']);
  const WRITES = new Set(['rpc_depointer', 'rpc_prise_de_poste', 'rpc_notice_lue', 'rpc_formation', 'rpc_pause', 'rpc_releve2', 'rpc_nettoyage2',
    'rpc_huile', 'rpc_reception', 'rpc_jeter', 'rpc_signaler2', 'rpc_checklist', 'rpc_chaud_debut', 'rpc_chaud_fin', 'rpc_courant_retabli', 'rpc_nc_etape']);
  const OFFLINE_TOKEN = 'hors-ligne-';
  const tokMember = new Map<string, { id: string; who: string }>();
  const isOfflineTok = (t: unknown) => typeof t === 'string' && t.startsWith(OFFLINE_TOKEN);
  const cacheKey = (fn: string, args: J) => 'r:' + fn + ':' + JSON.stringify(Object.fromEntries(Object.entries(args).filter(([k]) => k !== 'p_now' && k !== 'p_day')));

  async function sendItem(i: QueueItem) {
    const args = { ...i.args };
    if (i.photo && i.photoArg) {
      const company = await kvGet<string>(cacheKey('my_company', {}));
      const path = `${company}/${i.clientAt.slice(0, 10)}/${i.id}.jpg`;
      try {
        const { error } = await sb.storage.from('bons-livraison').upload(path, i.photo, { contentType: 'image/jpeg', upsert: true });
        if (error && !/exists/i.test(error.message)) throw new (isNetworkError(error.message) ? OfflineError : Error)('Photo du bon : ' + error.message);
      } catch (e) { if (e instanceof OfflineError || isNetworkError((e as Error).message)) throw new OfflineError((e as Error).message); throw e; }
      args[i.photoArg] = path;
    }
    await net('rpc_rejouer', { p_id: i.id, p_member: i.memberId, p_fn: i.fn, p_args: args, p_client_at: i.clientAt });
  }
  const kick = () => { flush(sendItem).catch(() => undefined); };
  if (typeof window !== 'undefined' && 'indexedDB' in window) initSync(sendItem);

  async function rpc<T = J>(fn: string, args: J = {}): Promise<T> {
    if (READS.has(fn)) {
      const key = cacheKey(fn, args);
      try { const r = await net<T>(fn, args); kvSet(key, r); return r; }
      catch (e) { if (e instanceof OfflineError) { const c = await kvGet<T>(key); if (c !== undefined) return c; } throw e; }
    }
    const m = tokMember.get(args.p_token);
    if (m && WRITES.has(fn)) {
      if (!isOfflineTok(args.p_token) && !looksOffline() && syncState().pending === 0) {
        try { return await net<T>(fn, args); } catch (e) { if (!(e instanceof OfflineError)) throw e; }
      }
      const { p_token: _t, ...rest } = args;   // eslint-disable-line @typescript-eslint/no-unused-vars
      await enqueue({ memberId: m.id, who: m.who, fn, args: rest }); kick();
      return undefined as T;
    }
    if (isOfflineTok(args.p_token)) throw new Error('Réseau nécessaire pour cette action : réessayez dès que le réseau revient.');
    try { return await net<T>(fn, args); }
    catch (e) { if (e instanceof OfflineError) throw new Error('Pas de réseau : cette action sera possible dès le retour du réseau.'); throw e; }
  }

  // Codes connus de la tablette : empreinte du code (jamais le code lui-même) → profil, pour ouvrir une session sans réseau
  type Profile = Omit<Session, 'token' | 'arrivee' | 'onBreak' | 'aptToday'> & { aptDay: string | null };
  const todayIso = () => iso(new Date());
  async function pinHash(pin: string) {
    let salt = await kvGet<string>('salt');
    if (!salt) { salt = crypto.randomUUID(); await kvSet('salt', salt); }
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
    return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  async function rememberLogin(pin: string, s: Session) {
    const pins = (await kvGet<Record<string, Profile>>('pins')) ?? {};
    for (const [k, v] of Object.entries(pins)) if (v.memberId === s.memberId) delete pins[k];
    const { token: _a, arrivee: _b, onBreak: _c, aptToday, ...rest } = s;   // eslint-disable-line @typescript-eslint/no-unused-vars
    pins[await pinHash(pin)] = { ...rest, aptDay: aptToday ? todayIso() : null };
    await kvSet('pins', pins);
  }
  async function patchProfile(token: string, patch: Partial<Profile>) {
    const m = tokMember.get(token); if (!m) return;
    const pins = (await kvGet<Record<string, Profile>>('pins')) ?? {};
    for (const v of Object.values(pins)) if (v.memberId === m.id) Object.assign(v, patch);
    await kvSet('pins', pins);
  }
  let badTries = 0, lockedUntil = 0;
  async function offlineLogin(pin: string): Promise<Session> {
    if (Date.now() < lockedUntil) throw new Error('Trop d’essais : patientez une minute.');
    const p = ((await kvGet<Record<string, Profile>>('pins')) ?? {})[await pinHash(pin)];
    if (!p) {
      if (++badTries >= 5) { badTries = 0; lockedUntil = Date.now() + 60_000; }
      throw new Error('Pas de réseau : code inconnu sur cette tablette (une première connexion avec réseau est nécessaire).');
    }
    badTries = 0;
    const { aptDay, ...rest } = p;
    return { ...rest, token: OFFLINE_TOKEN + crypto.randomUUID(), arrivee: false, onBreak: false, aptToday: aptDay === todayIso() };
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
    async openSession(pin) {
      if (syncState().pending > 0 && !looksOffline()) await flush(sendItem).catch(() => undefined);
      if (syncState().pending === 0 && !looksOffline()) {
        try {
          const s = session(await net('rpc_ouvrir', { p_pin: pin }));
          tokMember.set(s.token, { id: s.memberId, who: s.prenom }); await rememberLogin(pin, s);
          return s;
        } catch (e) { if (!(e instanceof OfflineError)) throw e; }
      }
      const s = await offlineLogin(pin);
      tokMember.set(s.token, { id: s.memberId, who: s.prenom });
      await enqueue({ memberId: s.memberId, who: s.prenom, fn: 'session', args: {} }); kick();
      return s;
    },
    async closeSession(token) { if (tok(token) && !isOfflineTok(token)) await net('rpc_fermer_session', { p_token: token }).catch(() => undefined); tokMember.delete(token); },
    async depointer(token) { await rpc('rpc_depointer', { p_token: tok(token) }); },
    async prisePoste(token, a) {
      await rpc('rpc_prise_de_poste', { p_token: tok(token), p_apte: a.apte, p_tenue: a.tenue, p_bijoux: a.bijoux, p_mains: a.mains });
      await patchProfile(token, { aptDay: a.apte && a.tenue && a.bijoux && a.mains ? todayIso() : null });
    },
    async ackPrivacy(token) { await rpc('rpc_notice_lue', { p_token: tok(token), p_version: PRIVACY_VERSION }); await patchProfile(token, { privacyAck: true }); },
    async saveTraining(token, score) {
      if (score < 5) throw new Error('Toutes les réponses doivent être justes (5 sur 5) : relisez le briefing et recommencez');
      const ok = (await rpc<boolean | undefined>('rpc_formation', { p_token: tok(token), p_score: score })) ?? true;
      await patchProfile(token, { trained: true });
      if (!ok) throw new Error('Toutes les réponses doivent être justes (5 sur 5) : relisez le briefing et recommencez');
    },
    async startBreak(token) { await rpc('rpc_pause', { p_token: tok(token), p_debut: true }); },
    async endBreak(token) { await rpc('rpc_pause', { p_token: tok(token), p_debut: false }); },

    // ---------------------------------------------------------------- contrôles
    async equipments() { return rpc<Equipment[]>('rpc_lire_materiel'); },
    async releve(token, equipmentId, value, actions) {
      const st = await rpc<Status | undefined>('rpc_releve2', { p_token: tok(token), p_equipment: equipmentId, p_value: value, p_actions: actions ?? [] });
      if (st) return { status: st };
      const eq = (await this.equipments()).find((e) => e.id === equipmentId);   // hors ligne : même calcul que l'écran
      return { status: eq ? readingStatus(value, eq.min, eq.max) : 'vert' };
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
      if (!r) return { mustChange: (i.polar ?? 0) >= 25 || (i.defects?.length ?? 0) > 0 };   // hors ligne : règle du serveur (002)
      return { mustChange: !!r[0]?.must_change };
    },
    async reception(token, i) {
      let photo: string | null = null;
      const m = tokMember.get(token);
      const offline = isOfflineTok(token) || looksOffline() || syncState().pending > 0;
      if (m && offline) {   // hors ligne : la photo part avec la saisie dès le retour du réseau
        const blob = i.photoData ? await (await fetch(i.photoData)).blob() : undefined;
        await enqueue({ memberId: m.id, who: m.who, fn: 'rpc_reception', photo: blob, photoArg: blob ? 'p_photo' : undefined,
          args: { p_supplier: i.supplier + (i.ownTransport ? ' (transport propre)' : ''), p_product: i.product, p_lot: i.lot, p_dlc: i.dlc,
            p_temperature: i.temperature, p_packaging: i.checks[0], p_aspect: i.checks[1], p_order: i.checks[2], p_cold: i.checks[3],
            p_accepted: i.accepted, p_refusal: i.refusalReason, p_photo: null, p_autofilled: i.autofilled, p_barcode: i.barcode } });
        kick(); return;
      }
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
    async signaler(token, kind, description) {
      const r = await rpc('rpc_signaler2', { p_token: tok(token), p_kind: kind, p_description: description });
      if (r === undefined && kind === 'coupure_courant') await kvSet('coupure', { start: new Date().toISOString(), by: tokMember.get(token)?.who ?? '' });
    },
    async checklistDone(mode) { return rpc<boolean>('rpc_checklist_faite', { p_mode: mode }); },
    async saveChecklist(token, mode, answers, labels) {
      const n = await rpc<number | undefined>('rpc_checklist', { p_token: tok(token), p_mode: mode, p_answers: answers, p_labels: labels });
      if (n === undefined) await kvSet(cacheKey('rpc_checklist_faite', { p_mode: mode }), true);
      return n ?? Object.values(answers).filter((v) => !v).length;
    },
    async hotBatches() {
      return (await rpc<J[]>('rpc_bacs_chauds')).map((h): HotBatch => ({ id: h.id, product: h.product, startedAt: new Date(h.startedAt), by: h.by,
        ended: h.ended ? { at: new Date(h.ended.at), how: h.ended.how, by: h.ended.by } : null }));
    },
    async startHot(token, product) { await rpc('rpc_chaud_debut', { p_token: tok(token), p_product: product }); },
    async endHot(token, id, how) { await rpc('rpc_chaud_fin', { p_token: tok(token), p_batch: id, p_how: how }); },
    async outage() {
      const local = await kvGet<{ start: string; by: string }>('coupure');   // coupure signalée sans réseau, pas encore synchronisée
      const o = await rpc<J | null>('rpc_coupure').catch(() => null);
      if (o) { if (local && !syncState().pending) kvDel('coupure'); return { start: new Date(o.start), end: d(o.end), by: o.by } as Outage; }
      return local ? { start: new Date(local.start), end: null, by: local.by } : null;
    },
    async endOutage(token) { await kvDel('coupure'); await rpc('rpc_courant_retabli', { p_token: tok(token) }); },

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
    async addMember(_token, prenom, poste, nom = '', lang = 'fr') { return rpc<string>('rpc_ajouter_membre', { p_prenom: prenom, p_nom: nom, p_poste: poste, p_lang: lang }); },
    async resetPin(_token, memberId) { return rpc<string>('rpc_nouveau_code', { p_member: memberId }); },
    async accounts() {
      return (await rpc<J[]>('rpc_comptes')).map((j): MemberAccount => ({ memberId: j.memberId, langue: j.langue, compte: j.compte,
        invitationJusqua: d(j.invitationJusqua), documents: j.documents }));
    },
    async inviteMember(memberId) { return rpc<string>('rpc_inviter', { p_member: memberId }); },
    async revokeAccess(memberId) { await rpc('rpc_retirer_acces', { p_member: memberId }); },
    async memberDocs(memberId) {
      return (await rpc<J[]>('rpc_documents_membre', { p_member: memberId })).map((j): MemberDoc => ({ ...(j as MemberDoc), at: new Date(j.at) }));
    },
    async memberProfile(memberId) { return rpc('rpc_profil_membre', { p_member: memberId }) as Promise<MemberProfile>; },
    async rhList(memberId) { return rpc<HrDoc[]>('rpc_rh_membre', { p_member: memberId }); },
    async rhUpload(memberId, kind, title, period, file, sign) {
      if (file.type !== 'application/pdf') throw new Error('Déposez un fichier PDF');
      const company = await rpc<string>('my_company');
      const path = `${company}/${memberId}/${kind}/${crypto.randomUUID()}.pdf`;
      const hash = await sha256Hex(file);
      const { error } = await sb.storage.from('documents-rh').upload(path, file, { contentType: 'application/pdf' });
      if (error) throw new Error('Envoi impossible : ' + error.message);
      try { await rpc('rpc_rh_ajouter', { p_member: memberId, p_kind: kind, p_title: title, p_period: period, p_path: path, p_sha256: hash, p_sign: sign }); }
      catch (e) { await sb.storage.from('documents-rh').remove([path]); throw e; }
    },
    async rhDelete(doc) {
      await rpc('rpc_rh_supprimer', { p_id: doc.id });
      await sb.storage.from('documents-rh').remove([doc.path]);
    },
    async rhUrl(path) {
      const { data, error } = await sb.storage.from('documents-rh').createSignedUrl(path, 300);
      if (error || !data) throw new Error('Document introuvable');
      return data.signedUrl;
    },
    async rhCertificate(doc, who) {
      let img: string | null = null;
      if (doc.signaturePath) {
        const { data } = await sb.storage.from('documents-rh').download(doc.signaturePath);
        if (data) img = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result as string); r.readAsDataURL(data); });
      }
      await signatureCertificate(doc, who, CONTROLLER.name, img);
    },
    async docUrl(path) {
      const { data, error } = await sb.storage.from('documents-employes').createSignedUrl(path, 120);
      if (error || !data) throw new Error('Document introuvable');
      return data.signedUrl;
    },
    async deleteDoc(doc) {
      const { error } = await sb.storage.from('documents-employes').remove([doc.path]);
      if (error) throw new Error(error.message);
      await rpc('rpc_document_supprimer', { p_id: doc.id });
    },
    async reportSettings() {
      const j = await rpc('rpc_rapports_envoyes');
      return { hour: j.hour, sent: (j.sent as J[]).map((x) => ({ day: day(x.day), at: new Date(x.at), to: x.to })) } as ReportSettings;
    },
    async setReportHour(hour) { await rpc('rpc_heure_rapport', { p_hour: hour }); },
    async pushEnabled() { return !!(await currentSubscription()) && rpc<boolean>('rpc_push_actif'); },
    async pushSubscribe() {
      const key = await rpc<string | null>('rpc_push_cle');
      if (!key) throw new Error('Le serveur prépare les notifications : réessayez dans une minute.');
      const s = await subscribePush(key);
      await rpc('rpc_push_abonner', { p_endpoint: s.endpoint, p_p256dh: s.p256dh, p_auth: s.auth });
    },
    async pushUnsubscribe() {
      const sub = await currentSubscription();
      if (sub) { await rpc('rpc_push_desabonner', { p_endpoint: sub.endpoint }); await sub.unsubscribe(); }
    },
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
