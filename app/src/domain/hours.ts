// Heures de travail : durée = (fin ou maintenant) − début − pauses (OLT 1 art. 73 al. 1 let. c et e).

export interface Span { start: Date; end: Date | null }
export const FORGOT_AFTER_H = 10;   // règle interne : alerte « oubli de dépointage ? » après 10 h pointé

const ms = (s: Span, now: Date) => Math.max(0, (s.end ?? now).getTime() - s.start.getTime());

/** Minutes travaillées, pauses déduites. */
export function workedMinutes(e: Span & { breaks: Span[] }, now: Date): number {
  const pauses = e.breaks.reduce((t, b) => t + ms(b, now), 0);
  return Math.round(Math.max(0, ms(e, now) - pauses) / 60_000);
}
export function breakMinutes(e: { breaks: Span[] }, now: Date): number {
  return Math.round(e.breaks.reduce((t, b) => t + ms(b, now), 0) / 60_000);
}
export const fmtMin = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;

/** Une correction doit rester cohérente : fin après début, pauses à l'intérieur du service. */
export function checkEntry(e: Span & { breaks: Span[] }): string | null {
  if (e.end && e.end <= e.start) return 'Le départ doit être après l’arrivée';
  for (const b of e.breaks) {
    if (b.start < e.start || (e.end && b.start > e.end)) return 'Une pause est en dehors du service';
    if (b.end && b.end <= b.start) return 'Une pause finit avant de commencer';
    if (b.end && e.end && b.end > e.end) return 'Une pause est en dehors du service';
  }
  return null;
}
