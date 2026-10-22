// Règles métier partagées par l'interface. Elles reproduisent celles du serveur (migrations SQL),
// qui reste l'autorité : l'interface les applique pour l'affichage immédiat et le mode hors ligne.

export type Status = 'vert' | 'jaune' | 'rouge';
export type Alert = 'ok' | 'jaune' | 'rouge';

export type Right =
  | 'pointage' | 'prise_poste' | 'nettoyage' | 'signaler_nc' | 'allergenes_lecture'
  | 'releves' | 'reception' | 'preparations' | 'jeter_lot' | 'traiter_nc' | 'cloturer_nc'
  | 'tableau_bord' | 'heures_equipe' | 'export' | 'equipements' | 'gestion_equipe'
  | 'admin_documents' | 'reglages_gerant';

/** Statut d'un relevé : identique à reading_status() côté serveur. */
export function readingStatus(v: number, min: number | null, max: number | null, margin = 0.5): Status {
  const e = 1e-9;
  if ((min !== null && v < min - e) || (max !== null && v > max + e)) return 'rouge';
  if ((min !== null && v < min + margin - e) || (max !== null && v > max - margin + e)) return 'jaune';
  return 'vert';
}

/** Alerte d'une tâche à échéance : jaune 15 min avant, rouge après (D34). */
export function dueAlert(dueAt: Date, now: Date): Alert {
  const ms = dueAt.getTime() - now.getTime();
  if (ms < 0) return 'rouge';
  if (ms <= 15 * 60_000) return 'jaune';
  return 'ok';
}

/** Alerte la plus grave d'une liste (rouge > jaune > ok) : couleur de l'écran de pointage. */
export function worstAlert(list: Alert[]): Alert {
  return list.includes('rouge') ? 'rouge' : list.includes('jaune') ? 'jaune' : 'ok';
}

/** Code de lot CODE-JJMMAA-n (D17) et date limite J+n (D7). */
export function lotCode(code: string, producedOn: Date, seq: number): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${code}-${p(producedOn.getDate())}${p(producedOn.getMonth() + 1)}${p(producedOn.getFullYear() % 100)}-${seq}`;
}
export function useBy(producedOn: Date, shelfDays: number): Date {
  const d = new Date(producedOn);
  d.setDate(d.getDate() + shelfDays);
  return d;
}

/** Codes trop faciles refusés (identique à set_member_pin). */
export function isWeakPin(pin: string): boolean {
  return !/^\d{4}$/.test(pin) || /^(\d)\1{3}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin);
}

export function formatTemp(t: number): string {
  return t.toFixed(1).replace('.', ',').replace('-', '−') + ' °C';
}

export function formatDelay(dueAt: Date, now: Date): string {
  const min = Math.round((dueAt.getTime() - now.getTime()) / 60_000);
  return min < 0 ? `En retard de ${-min} min` : `À faire dans ${min} min`;
}

/** Version traduisible de formatDelay : [texte, variables]. */
export function formatDelayParts(dueAt: Date, now: Date): [string, { n: number }] {
  const min = Math.round((dueAt.getTime() - now.getTime()) / 60_000);
  return min < 0 ? ['En retard de {n} min', { n: -min }] : ['À faire dans {n} min', { n: min }];
}
