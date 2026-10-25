// Style commun aux documents RH d'Original's Completos (contrat, fiche de salaire) : reproduit le contrat papier du Gérant.
// Police Carlito (SIL OFL, métriques de Calibri), filigrane du logo, titres rouges soulignés, pied de page.
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

export const EMPLOYEUR = {
  nom: 'Orlando Quispe Oscco',
  raison: 'ORLANDO Quispe Oscco, Cuisine Événementielle',
  adresse: 'Rue Saint-Germain 36, 1030 Bussigny',
  ide: 'CHE-273.472.459',
  lieu: 'Bussigny',
  pied: "ORIGINAL'S COMPLETOS · Bussigny, Suisse · 078 352 12 02 · info@originalscompletos.ch",
};

let HT = 5, HB = 7.4;
export const tune = (t: number, b: number) => { HT = t; HB = b; };
export const C = { accent: '#B5424A', text: '#222222', grey: '#555555', rule: '#DDDDDD', label: '#F2E4E4', cell: '#FAFAFA' };
export const dmy = (s: string) => s.split('-').reverse().join('.');
export const longDate = (d: Date) => `${d.getDate()} ${d.toLocaleDateString('fr-CH', { month: 'long' })} ${d.getFullYear()}`;
export const chf = (n: number) => (Number.isInteger(n) ? `${n}.-` : n.toFixed(2));
/** « en qualité d'employé polyvalent » / « en qualité de chef de cuisine » */
export const qualite = (f: string) => (/^[aeéèêiouyhœ]/i.test(f) ? `d'${f}` : `de ${f}`);


export const H = (n: string): Content[] => [
  { text: n, fontSize: 12, bold: true, color: C.accent, lineHeight: 1, margin: [0, HT, 0, 2] },
  { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 495.6, y2: 0, lineWidth: 0.8, lineColor: C.accent }], margin: [0, 0, 0, HB] },
];
/** Mots avec trait d'union (ci-dessus, hôtellerie-restauration) : jamais coupés ni espacés par la justification. */
export const nb = (t: unknown): unknown => typeof t === 'string'
  ? t.split(/(\S*\p{L}-\p{L}\S*)/u).filter(Boolean).map((x) => (/\p{L}-\p{L}/u.test(x) ? { text: x, noWrap: true } : x))
  : Array.isArray(t) ? t.flatMap((x) => (typeof x === 'string' ? (nb(x) as unknown[]) : [x])) : t;
export const P = (text: Content | string): Content => ({ text: nb(text), margin: [0, 0, 0, 8] } as Content);
const CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1.5 5.5 L4 8 L8.8 2" fill="none" stroke="#B5424A" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const LI = (text: string): Content => ({ columns: [{ svg: CHECK, width: 8, margin: [0, 3, 0, 0] }, { text: nb(text) as string, width: '*' }], columnGap: 7, margin: [18, 0, 0, 8] });


/** Cadre de page commun : marges, police, filigrane, pied de page. */
export function page(title: string, watermark: string, content: Content[]): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    pageMargins: [50, 47, 49.7, 62],
    info: { title, author: EMPLOYEUR.nom },
    defaultStyle: { font: 'Carlito', fontSize: 10.5, lineHeight: 1.25, color: C.text, alignment: 'justify', characterSpacing: -0.08 },
    background: () => ({ image: watermark, width: 375, height: 339, absolutePosition: { x: 110.15, y: 251.4 } }),
    footer: (pg, pages) => ({ stack: [
      { canvas: [{ type: 'line', x1: 50, y1: 0, x2: 545.6, y2: 0, lineWidth: 0.5, lineColor: C.rule }] },
      { text: [`${EMPLOYEUR.pied} — page `, { text: `${pg} / ${pages}`, fontSize: 11 }], fontSize: 9, color: '#777777', alignment: 'center', margin: [0, 8, 0, 0] },
    ], margin: [0, 7.5, 0, 0] }),
    content,
  };
}

/** En-tête : titre, sous-titre italique, filet rouge. */
export const header = (title: string, subtitle: string): Content[] => [
  { text: title, fontSize: 17, bold: true, alignment: 'center', lineHeight: 1, margin: [0, 0, 0, 3.9] },
  { text: subtitle, italics: true, color: C.grey, alignment: 'center', margin: [0, 0, 0, 13] },
  { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 495.6, y2: 0, lineWidth: 1.2, lineColor: C.accent }], margin: [0, 0, 0, 13] },
];

/** Tableau « Employeur / Employé(e) » en tête de document. */
export const parties = (employe: Content): Content => ({ table: { widths: [112, '*'], body: [
  [{ text: 'Employeur', bold: true, fillColor: C.label, lineHeight: 1, margin: [4, 10.4, 4, 0] },
   { text: `${EMPLOYEUR.nom} — ${EMPLOYEUR.raison}, ${EMPLOYEUR.adresse} (IDE ${EMPLOYEUR.ide})`, fillColor: C.cell, alignment: 'left', lineHeight: 1, margin: [4, 3.4, 4, 3.4] }],
  [{ text: 'Employé(e)', bold: true, fillColor: C.label, lineHeight: 1, margin: [4, 10.4, 4, 0] },
   { text: employe, fillColor: C.cell, alignment: 'left', lineHeight: 1, margin: [4, 3.4, 4, 3.4] } as Content],
] }, layout: { hLineColor: () => C.rule, vLineColor: () => C.rule, hLineWidth: () => 0.6, vLineWidth: () => 0.6 }, margin: [7, 0, 7, 0] });
