import type { Alert, Right, Status } from '../domain/rules';

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
}
