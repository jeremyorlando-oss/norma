// Calcul de la fiche de salaire mensuelle (salaire horaire « tout compris » du contrat CDD d'Original's Completos).
// Sources :
//  - AVS/AI/APG 5,3 % et AC 1,1 % (part salarié), AC jusqu'à 148 200 CHF/an : taux 2026 (Swissmem, Assurances sociales 2026).
//  - Cotisations AVS dès le 1er janvier qui suit les 17 ans (LAVS art. 3 al. 2 let. a) ; retraités : franchise 1 400 CHF/mois, pas d'AC.
//  - Salaires de minime importance : jusqu'à 2 500 CHF/an par employeur, cotisations seulement à la demande de la personne
//    (OFAS, FAQ AVS) ; au-delà, cotisations dues sur tout le salaire.
//  - Vacances : 4 semaines (8,33 %), 5 semaines jusqu'à 20 ans (10,64 %) (CO art. 329a al. 1) ; indemnité à indiquer à part
//    sur chaque décompte quand elle est comprise dans le salaire horaire (jurisprudence du Tribunal fédéral).
//  - 13e salaire : 8,33 % (1/12). Jours fériés, accident non professionnel (AANP), perte de gain maladie (IJM), LPP :
//    taux de l'entreprise ou de ses assurances, saisis par le Gérant dans les réglages.
// Arrondis : montants au 5 centimes près, comme sur un décompte suisse.

export interface PayrollSettings {
  vacPct: number; vacYoungPct: number; holidaysPct: number; thirteenthPct: number;
  avsPct: number; acPct: number; acCeilingYear: number; aanpPct: number | null; ijmPct: number; lppPct: number;
  minorEarningsYear: number; retireeFranchiseMonth: number;
}
export const DEFAULT_SETTINGS: PayrollSettings = {
  vacPct: 8.33, vacYoungPct: 10.64, holidaysPct: 0, thirteenthPct: 8.33,
  avsPct: 5.3, acPct: 1.1, acCeilingYear: 148200, aanpPct: null, ijmPct: 0, lppPct: 0,
  minorEarningsYear: 2500, retireeFranchiseMonth: 1400,
};

export interface PayInput {
  month: string;              // AAAA-MM
  minutes: number;            // heures pointées du mois (pauses déduites)
  hourlyRate: number;         // taux horaire brut « tout compris » (contrat)
  birthDate: string | null;   // AAAA-MM-JJ
  permit: string;             // '', CH, B, C, L, G…
  sourceTaxPct: number | null;
  avsOnRequest: boolean;      // la personne demande les cotisations même sous 2 500 CHF/an
  ytdGross: number;           // salaire brut déjà versé cette année (fiches précédentes)
  ytdAvsBase: number;         // part déjà soumise à l'AVS cette année
  ytdAcBase: number;
}
export interface PayLine { label: string; base?: string; amount: number; note?: string }
export interface PayResult {
  hours: number; earnings: PayLine[]; gross: number; deductions: PayLine[]; totalDeductions: number; net: number;
  avsBase: number; acBase: number; notes: string[]; errors: string[];
}

export const round5 = (x: number) => Math.round(x * 20) / 20;
const r2 = (x: number) => Math.round(x * 100) / 100;
export const fmtChf = (x: number) => x.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Âge révolu au dernier jour du mois. */
export function ageAt(birthDate: string, month: string) {
  const [y, m] = month.split('-').map(Number);
  const end = new Date(y, m, 0);
  const b = new Date(birthDate);
  let a = end.getFullYear() - b.getFullYear();
  if (end.getMonth() < b.getMonth() || (end.getMonth() === b.getMonth() && end.getDate() < b.getDate())) a--;
  return a;
}

export function computePayslip(i: PayInput, s: PayrollSettings): PayResult {
  const notes: string[] = [], errors: string[] = [];
  const hours = r2(i.minutes / 60);
  const year = Number(i.month.slice(0, 4));
  const age = i.birthDate ? ageAt(i.birthDate, i.month) : null;
  if (age === null) errors.push('Date de naissance manquante (fiche de la personne)');
  const young = age !== null && age < 20;
  const v = (young ? s.vacYoungPct : s.vacPct) / 100, f = s.holidaysPct / 100, t = s.thirteenthPct / 100;

  // Salaire horaire « tout compris » = base × (1 + vacances + jours fériés) × (1 + 13e)
  const gross = round5(hours * i.hourlyRate);
  const base = i.hourlyRate / ((1 + v + f) * (1 + t));
  const baseAmt = round5(hours * base), vacAmt = round5(hours * base * v), ferAmt = round5(hours * base * f);
  const thirteenth = r2(gross - baseAmt - vacAmt - ferAmt);
  const earnings: PayLine[] = [
    { label: 'Salaire de base', base: `${fmtChf(hours)} h × CHF ${fmtChf(base)}`, amount: baseAmt },
    { label: `Indemnité de vacances ${(v * 100).toFixed(2).replace('.', ',')} %`, base: young ? '5 semaines (moins de 20 ans)' : '4 semaines', amount: vacAmt },
    ...(f > 0 ? [{ label: `Indemnité jours fériés ${(f * 100).toFixed(2).replace('.', ',')} %`, amount: ferAmt }] : []),
    { label: `13e salaire ${(t * 100).toFixed(2).replace('.', ',')} %`, amount: thirteenth },
  ];

  // AVS / AI / APG et AC
  let avsBase = 0, acBase = 0;
  const subject = age !== null && year >= Number(i.birthDate!.slice(0, 4)) + 18;
  const retired = age !== null && age >= 65;
  if (!subject) notes.push('Pas de cotisations AVS/AC : cotisations dès le 1er janvier qui suit les 17 ans (LAVS art. 3).');
  else if (!i.avsOnRequest && i.ytdGross + gross <= s.minorEarningsYear) {
    notes.push(`Salaire annuel jusqu'ici ≤ CHF ${s.minorEarningsYear} : pas de cotisations AVS/AC sauf demande de la personne (salaire de minime importance).`);
  } else {
    // dépassement du seuil : cotisations dues sur tout le salaire de l'année (rattrapage des mois précédents)
    const catchUp = !i.avsOnRequest && i.ytdAvsBase === 0 && i.ytdGross > 0 ? i.ytdGross : 0;
    if (catchUp) notes.push(`Seuil de CHF ${s.minorEarningsYear} dépassé : cotisations aussi sur les CHF ${fmtChf(catchUp)} déjà versés cette année.`);
    avsBase = Math.max(0, gross + catchUp - (retired ? s.retireeFranchiseMonth : 0));
    if (retired) notes.push(`Retraité(e) : franchise de CHF ${s.retireeFranchiseMonth} par mois, pas d'assurance chômage.`);
    if (!retired) {
      const room = Math.max(0, s.acCeilingYear - i.ytdAcBase);
      acBase = Math.min(gross + catchUp, room);
    }
  }
  const deductions: PayLine[] = [];
  if (avsBase > 0) deductions.push({ label: `AVS / AI / APG ${String(s.avsPct).replace('.', ',')} %`, base: `sur CHF ${fmtChf(avsBase)}`, amount: round5(avsBase * s.avsPct / 100) });
  if (acBase > 0) deductions.push({ label: `Assurance chômage (AC) ${String(s.acPct).replace('.', ',')} %`, base: `sur CHF ${fmtChf(acBase)}`, amount: round5(acBase * s.acPct / 100) });
  if (s.aanpPct === null) errors.push('Taux d’assurance accident non professionnelle (AANP) à saisir dans Réglages › Salaires (selon ton assureur)');
  else if (s.aanpPct > 0) deductions.push({ label: `Accident non professionnel (AANP) ${String(s.aanpPct).replace('.', ',')} %`, base: `sur CHF ${fmtChf(gross)}`, amount: round5(gross * s.aanpPct / 100) });
  if (s.ijmPct > 0) deductions.push({ label: `Perte de gain maladie (IJM) ${String(s.ijmPct).replace('.', ',')} %`, base: `sur CHF ${fmtChf(gross)}`, amount: round5(gross * s.ijmPct / 100) });
  if (s.lppPct > 0) deductions.push({ label: `Prévoyance professionnelle (LPP) ${String(s.lppPct).replace('.', ',')} %`, base: `sur CHF ${fmtChf(gross)}`, amount: round5(gross * s.lppPct / 100) });
  const taxed = i.permit !== '' && i.permit !== 'CH' && i.permit !== 'C';
  if (taxed) {
    if (i.sourceTaxPct === null) errors.push(`Permis ${i.permit} : taux d'impôt à la source à saisir (barème du canton de Vaud)`);
    else deductions.push({ label: `Impôt à la source ${String(i.sourceTaxPct).replace('.', ',')} %`, base: `sur CHF ${fmtChf(gross)}`, amount: round5(gross * i.sourceTaxPct / 100) });
  }
  if (!i.permit) errors.push('Permis de séjour / nationalité manquant (fiche de la personne)');
  const totalDeductions = r2(deductions.reduce((n, d) => n + d.amount, 0));
  return { hours, earnings, gross, deductions, totalDeductions, net: r2(gross - totalDeductions), avsBase, acBase, notes, errors };
}
