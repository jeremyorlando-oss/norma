import type { Alert, Right, Status } from '../domain/rules';
import type { DayReport } from '../report/dailyReport';

export interface Session {
  token: string;
  memberId: string;
  prenom: string;
  poste: string;
  arrivee: boolean;      // true = arrivée pointée par ce code
  droits: Right[];
  aptToday: boolean;     // prise de poste conforme faite aujourd'hui
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
  photo: boolean; autofilled: boolean; barcode: string | null;
}
export interface Recipe { id: string; name: string; code: string; shelfDays: number; allergens: string[] }
export interface Lot { id: string; recipeName: string; lotCode: string; producedOn: Date; useBy: Date; by: string;
  status: 'a_garder' | 'aujourd_hui' | 'a_jeter' | 'jete'; disposed: { by: string; at: Date } | null }

export interface Dish { name: string; ingredients: string[]; allergens: string[] }
export type NcKind = 'corps_etranger' | 'allergie' | 'coupure_courant' | 'hygiene' | 'autre';

export interface NcStep { step: 'mesure_immediate' | 'evaluation_risque' | 'action_corrective' | 'verification' | 'cloture'; content: string; by: string; at: Date }
export interface Nc { id: string; kind: string; description: string; openedBy: string; openedAt: Date; steps: NcStep[]; closed: boolean }
export interface Member { id: string; prenom: string; poste: string; clockedIn: boolean; since: Date | null; aptToday: boolean | null }
export interface DayStats { releves: number; relevesRouges: number; nettoyagesFaits: number; nettoyagesEnRetard: number; lotsAJeter: number; receptions: number }

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
  readLabelPhoto(token: string): Promise<{ supplier: string; product: string; lot: string; dlc: string }>;
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
}
