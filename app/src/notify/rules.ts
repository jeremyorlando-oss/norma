// Notifications iPhone (actives à la mise en ligne) : quel événement, qui le reçoit (selon les droits), urgence.
import type { Right } from '../domain/rules';

export type NotifyEvent = 'temperature_hors_seuil' | 'incident' | 'coupure_courant' | 'oubli_depointage' | 'nettoyage_retard_30' | 'rapport_soir';
export const NOTIFY_RULES: Record<NotifyEvent, { right: Right; title: string; urgent: boolean }> = {
  temperature_hors_seuil: { right: 'traiter_nc', title: 'Température hors seuil', urgent: true },
  incident: { right: 'traiter_nc', title: 'Nouvel incident signalé', urgent: true },
  coupure_courant: { right: 'traiter_nc', title: 'Coupure de courant sur le stand', urgent: true },
  oubli_depointage: { right: 'heures_equipe', title: 'Oubli de dépointage ?', urgent: false },
  nettoyage_retard_30: { right: 'tableau_bord', title: 'Nettoyage en retard de plus de 30 min', urgent: false },
  rapport_soir: { right: 'export', title: 'Rapport HACCP du jour disponible', urgent: false },
};

/** Destinataires : personnes ayant un iPhone Direction (Gérant, Manager) et le droit concerné. */
export function recipients(ev: NotifyEvent, people: { id: string; poste: string; rights: Right[] }[]): string[] {
  return people.filter((p) => (p.poste === 'Gérant' || p.poste === 'Manager') && p.rights.includes(NOTIFY_RULES[ev].right)).map((p) => p.id);
}
