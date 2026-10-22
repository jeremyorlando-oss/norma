import type { Alert, Right, Status } from '../domain/rules';
import type { DayReport } from '../report/dailyReport';

export interface Session {
  token: string;
  memberId: string;
  langue: 'fr' | 'es' | 'en';
  prenom: string;
  poste: string;
  arrivee: boolean;      // true = arrivée pointée par ce code
  droits: Right[];
  aptToday: boolean;     // prise de poste conforme faite aujourd'hui
  privacyAck: boolean;
  onBreak: boolean;     // pause en cours (OLT 1 art. 73 al. 1 let. e)  // notice LPD lue (version en cours)
  trained: boolean;      // formation / briefing validé (quiz réussi)
}

export interface Equipment {
  id: string;
  name: string;
  type: 'froid_positif' | 'froid_negatif' | 'cuisson' | 'maintien_chaud' | 'friteuse';
  min: number | null;
  max: number | null;
  defaultValue: number;
}

export interface CleaningTask {
  id: string;
  name: string;
  product: string;
  frequency: string;           // libellé lisible
  dueAt: Date | null;          // null = pas d'échéance horaire (ex. changement de tâche)
  lastDone: { by: string; at: Date } | null;
  interval?: number | null;    // minutes entre deux passages (réglages)
}

export interface StandAlert {
  title: string;
  dueAt: Date;
  alert: Alert;
  who: string;                 // postes autorisés à régulariser
}

export interface OilInput {
  equipmentId: string; moment: 'matin' | 'service' | 'soir'; temperature: number | null; polar: number | null;
  defects: string[]; filtered: boolean; changed: boolean;
}
export interface ReceptionInput {
  supplier: string; product: string; lot: string; dlc: string; temperature: number;
  checks: [boolean, boolean, boolean, boolean]; accepted: boolean; refusalReason: string | null;
  photo: boolean; photoData?: string; autofilled: boolean; barcode: string | null; ownTransport: boolean;
}
export interface Recipe { id: string; name: string; code: string; shelfDays: number; allergens: string[] }
export interface Lot { id: string; kind: 'preparation' | 'ouvert'; recipeName: string; lotCode: string; producedOn: Date; useBy: Date; by: string;
  status: 'a_garder' | 'aujourd_hui' | 'a_jeter' | 'jete'; disposed: { by: string; at: Date } | null }

export interface Dish { name: string; ingredients: string[]; allergens: string[]; meatOrigin: string | null }
export type NcKind = 'corps_etranger' | 'allergie' | 'intoxication' | 'coupure_courant' | 'nuisibles' | 'materiel' | 'hygiene' | 'autre';
export interface HotBatch { id: string; product: string; startedAt: Date; by: string; ended: { at: Date; how: 'vendu' | 'jete'; by: string } | null }
export interface AdminDoc { id: string; name: string; status: 'ok' | 'manquant' | 'a_jour'; detail: string }

export interface NcStep { step: 'mesure_immediate' | 'evaluation_risque' | 'action_corrective' | 'verification' | 'cloture'; content: string; by: string; at: Date }
export interface Nc { id: string; kind: string; description: string; openedBy: string; openedAt: Date; steps: NcStep[]; closed: boolean }
export interface Member { id: string; prenom: string; poste: string; clockedIn: boolean; since: Date | null; aptToday: boolean | null }
export interface DayStats { releves: number; relevesRouges: number; nettoyagesFaits: number; nettoyagesEnRetard: number; lotsAJeter: number; receptions: number }

/** Événement (stand sur une manifestation) : en-tête du rapport, checklist de montage, bilan. */
export interface EventInfo { id: string; name: string; place: string; start: Date; end: Date; organizer: string; ofcoRef: string; team: string[]; equipment: string[]; notes: string }
export type EventInput = Omit<EventInfo, 'id'> & { id?: string };
export interface EventSummary { jours: number; releves: number; relevesRouges: number; ncOuvertes: number; ncCloturees: number; nettoyages: number;
  receptions: number; lotsProduits: number; lotsJetes: number; heures: number; personnes: number; checklistsMontage: boolean }

export type EquipmentType = Equipment['type'];
export interface OfficialLimit { min: number | null; max: number | null; source: string }
export type EquipmentInput = Omit<Equipment, 'id' | 'defaultValue'> & { id?: string };
export interface CleaningTaskInput { id?: string; name: string; product: string; frequency: string; interval: number | null }

/** Pointage : une ligne par service ; les corrections gardent l'ancienne valeur, qui, quand et pourquoi. */
export interface TimeEntry { id: string; memberId: string; prenom: string; poste: string; eventId: string | null; start: Date; end: Date | null;
  breaks: { start: Date; end: Date | null }[]; corrections: { at: Date; by: string; what: string; reason: string }[] }
export interface HoursAlert { entryId: string; prenom: string; since: Date; hours: number }

/** Mode inspecteur : accès lecture seule, limité dans le temps, journalisé. */
export interface InspectorAccess { token: string; until: Date; openedBy: string }
export interface InspectorInfo { thresholds: DayReport['thresholds']; documents: AdminDoc[]; trainings: { name: string; at: string; score: number }[];
  haccpReview: Date | null; events: { name: string; place: string; dates: string; ofco: string }[] }
export interface AuditEntry { at: Date; who: string; action: string }

/** Coupure de courant en cours ou récente (chaîne du froid : 30 min max d'interruption, BPHR). */
export interface Outage { start: Date; end: Date | null; by: string }

/** Contrat commun : implémenté par la démo (mémoire) et par Supabase (fonctions RPC du serveur). */
export interface Api {
  openSession(pin: string): Promise<Session>;
  closeSession(token: string): Promise<void>;
  depointer(token: string): Promise<void>;
  prisePoste(token: string, a: { apte: boolean; tenue: boolean; bijoux: boolean; mains: boolean }): Promise<void>;
  equipments(): Promise<Equipment[]>;
  releve(token: string, equipmentId: string, value: number, correctiveActions?: string[]): Promise<{ status: Status }>;
  cleaningTasks(now: Date): Promise<CleaningTask[]>;
  nettoyage(token: string, taskId: string): Promise<void>;
  alerts(now: Date): Promise<StandAlert[]>;
  huile(token: string, input: OilInput): Promise<{ mustChange: boolean }>;
  reception(token: string, input: ReceptionInput): Promise<void>;
  scanBarcode(token: string, code: string): Promise<{ product: string; supplier: string } | null>;
  suppliers(): Promise<string[]>;
  recipes(): Promise<Recipe[]>;
  lots(now: Date): Promise<Lot[]>;
  preparation(token: string, recipeId: string): Promise<Lot>;
  jeterLot(token: string, lotId: string): Promise<void>;
  dishes(): Promise<Dish[]>;
  signaler(token: string, kind: NcKind, description: string): Promise<void>;
  // Espace Direction (iPhone) : token = session Direction
  directionLogin(memberId: string): Promise<Session>;
  nonconformities(): Promise<Nc[]>;
  ncStep(token: string, ncId: string, step: NcStep['step'], content: string): Promise<void>;
  team(): Promise<Member[]>;
  addMember(token: string, prenom: string, poste: string): Promise<string>;   // renvoie le code, affiché une seule fois
  resetPin(token: string, memberId: string): Promise<string>;
  dayStats(now: Date): Promise<DayStats>;
  dayReport(now: Date): Promise<DayReport>;
  // Audit v1 : checklists, formation, maintien au chaud, produits entamés, documents
  checklistDone(mode: 'montage' | 'ouverture' | 'fermeture'): Promise<boolean>;
  saveChecklist(token: string, mode: 'montage' | 'ouverture' | 'fermeture', answers: Record<string, boolean>, labels: Record<string, string>): Promise<number>;
  saveTraining(token: string, score: number): Promise<void>;
  hotBatches(): Promise<HotBatch[]>;
  startHot(token: string, product: string): Promise<void>;
  endHot(token: string, id: string, how: 'vendu' | 'jete'): Promise<void>;
  openProduct(token: string, name: string, daysAfterOpening: number): Promise<Lot>;
  documents(): Promise<AdminDoc[]>;
  haccpReview(token: string | null): Promise<Date | null>;     // null = lecture ; token = enregistrer une revue
  // Réglages (D16, D22, D23) : le serveur reste l'autorité sur les droits et les limites officielles
  officialLimits(): Promise<Record<EquipmentType, OfficialLimit>>;
  saveEquipment(token: string, e: EquipmentInput): Promise<void>;
  deleteEquipment(token: string, id: string): Promise<void>;
  saveCleaningTask(token: string, t: CleaningTaskInput): Promise<void>;
  deleteCleaningTask(token: string, id: string): Promise<void>;
  postes(): Promise<Record<string, Right[]>>;
  setPosteRights(token: string, poste: string, rights: Right[]): Promise<void>;
  extraRights(): Promise<Record<string, Right[]>>;
  setExtraRights(token: string, memberId: string, rights: Right[]): Promise<void>;
  ackPrivacy(token: string): Promise<void>;
  startBreak(token: string): Promise<void>;
  endBreak(token: string): Promise<void>;
  timeEntries(from: Date, to: Date): Promise<TimeEntry[]>;
  correctEntry(token: string, id: string, v: { start: Date; end: Date | null; breaks: { start: Date; end: Date | null }[] }, reason: string): Promise<void>;
  hoursAlerts(now: Date): Promise<HoursAlert[]>;
  privacyAcks(): Promise<{ name: string; at: string }[]>;
  openInspector(token: string): Promise<InspectorAccess>;
  closeInspector(inspToken: string): Promise<void>;
  inspectorDay(inspToken: string, day: Date): Promise<DayReport>;
  inspectorInfo(inspToken: string): Promise<InspectorInfo>;
  auditLog(): Promise<AuditEntry[]>;
  outage(): Promise<Outage | null>;
  endOutage(token: string): Promise<void>;
  // Événements
  events(): Promise<EventInfo[]>;
  currentEvent(now: Date): Promise<EventInfo | null>;
  saveEvent(token: string, e: EventInput): Promise<void>;
  deleteEvent(token: string, id: string): Promise<void>;
  eventSummary(id: string, now: Date): Promise<EventSummary>;
}
