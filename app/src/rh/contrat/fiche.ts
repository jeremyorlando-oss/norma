// Fiche de salaire mensuelle (décompte CO art. 323b) : même visuel que le contrat (police, filigrane, titres, pied de page).
import type { Content, TableCell } from 'pdfmake/interfaces';
import { fmtChf, type PayResult } from '../paie';
import { C, dmy, H, header, page, parties } from './style';

export interface FicheData {
  month: string;                         // AAAA-MM
  prenoms: string; nom: string; birthDate: string; street: string; npa: string; city: string; avs: string;
  fonction: string; contractStart: string; contractEnd: string; hourlyRate: number;
  iban: string; ibanHolder: string; payDate: string;   // AAAA-MM-JJ
  r: PayResult;
}

const monthLabel = (m: string) => { const [y, mm] = m.split('-').map(Number); return new Date(y, mm - 1, 1).toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' }); };
const lastDay = (m: string) => { const [y, mm] = m.split('-').map(Number); return `${m}-${String(new Date(y, mm, 0).getDate()).padStart(2, '0')}`; };
const grid = { hLineColor: () => C.rule, vLineColor: () => C.rule, hLineWidth: () => 0.6, vLineWidth: () => 0 };
const amountRow = (label: string, base: string, amount: string, bold = false): TableCell[] => [
  { text: label, bold, alignment: 'left' }, { text: base, color: '#555555', alignment: 'left' }, { text: amount, bold, alignment: 'right' }];

export function buildFiche(d: FicheData, watermark: string) {
  const b = (t: string) => ({ text: t, bold: true });
  const nom = `${d.prenoms} ${d.nom}`.trim();
  const r = d.r;
  const table = (rows: TableCell[][], total: TableCell[]): Content => ({
    table: { widths: ['*', 160, 80], headerRows: 1, body: [
      [{ text: 'Désignation', bold: true, fillColor: C.label }, { text: 'Base', bold: true, fillColor: C.label }, { text: 'CHF', bold: true, fillColor: C.label, alignment: 'right' }],
      ...rows, total.map((c) => ({ ...(c as object), fillColor: C.cell }) as TableCell)] },
    layout: { ...grid, paddingTop: () => 4, paddingBottom: () => 4 }, lineHeight: 1, margin: [0, 0, 0, 8] } as Content);
  return page(`Fiche de salaire ${monthLabel(d.month)} · ${nom}`, watermark, [
    ...header('DÉCOMPTE DE SALAIRE', `${monthLabel(d.month).replace(/^./, (c) => c.toUpperCase())} — Original's Completos, Cuisine Événementielle`),
    parties([b(nom), ' — né le ', b(dmy(d.birthDate)), ' — ', b(`${d.street}, ${d.npa} ${d.city}`), ' — n° AVS ', b(d.avs)]),
    { text: '', margin: [0, 0, 0, 6] },
    ...H('1. Période et contrat'),
    { table: { widths: [150, '*'], body: [
      ['Période', `${dmy(`${d.month}-01`)} – ${dmy(lastDay(d.month))}`],
      ['Fonction', d.fonction],
      ['Contrat', `Durée déterminée du ${dmy(d.contractStart)} au ${dmy(d.contractEnd)}`],
      ['Taux horaire brut', `CHF ${fmtChf(d.hourlyRate)} (vacances, jours fériés et 13e salaire compris)`],
      ['Heures travaillées', `${fmtChf(r.hours)} h (pointage NORMA, pauses déduites)`],
    ].map(([a, v]) => [{ text: a, bold: true, fillColor: C.label }, { text: v, fillColor: C.cell, alignment: 'left' }]) },
      layout: { ...grid, vLineWidth: () => 0.6, paddingTop: () => 3, paddingBottom: () => 3 }, lineHeight: 1, margin: [0, 0, 0, 8] } as Content,
    ...H('2. Salaire brut'),
    table(r.earnings.map((l) => amountRow(l.label, l.base ?? '', fmtChf(l.amount))), amountRow('Salaire brut', '', fmtChf(r.gross), true)),
    ...H('3. Déductions'),
    r.deductions.length
      ? table(r.deductions.map((l) => amountRow(l.label, l.base ?? '', `− ${fmtChf(l.amount)}`)), amountRow('Total des déductions', '', `− ${fmtChf(r.totalDeductions)}`, true))
      : { text: 'Aucune déduction ce mois-ci.', italics: true, margin: [0, 0, 0, 8] },
    ...H('4. Salaire net'),
    { table: { widths: ['*', 120], body: [[{ text: 'Salaire net versé', bold: true, fontSize: 12, fillColor: C.label }, { text: `CHF ${fmtChf(r.net)}`, bold: true, fontSize: 12, alignment: 'right', fillColor: C.label }]] },
      layout: { ...grid, vLineWidth: () => 0.6, paddingTop: () => 6, paddingBottom: () => 6 }, lineHeight: 1, margin: [0, 0, 0, 8] } as Content,
    { text: [`Versé le ${dmy(d.payDate)} sur le compte `, b(d.iban ? d.iban.replace(/(.{4})/g, '$1 ').trim() : '(IBAN à communiquer)'), d.ibanHolder ? ` (${d.ibanHolder})` : '', '.'], margin: [0, 0, 0, 8] },
    ...(r.notes.length ? [{ ul: r.notes, fontSize: 9, color: '#555555', margin: [0, 0, 0, 8] } as Content] : []),
    { text: 'Décompte de salaire remis conformément à l’art. 323b CO. Toute erreur doit être signalée sans délai à l’employeur.', fontSize: 9, color: '#555555' },
  ]);
}
