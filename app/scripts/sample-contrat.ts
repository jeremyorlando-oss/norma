// Génère un contrat CDD d'exemple avec le modèle : npx tsx scripts/sample-contrat.ts sortie.pdf [--app]
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildCdd } from '../src/rh/contrat/cdd';

const require = createRequire(import.meta.url);
const pdfMake = require('pdfmake/build/pdfmake.js');
const dir = new URL('../src/rh/contrat/', import.meta.url);
const b64 = (f: string) => readFileSync(new URL(f, dir)).toString('base64');
pdfMake.vfs = Object.fromEntries(['Regular', 'Bold', 'Italic', 'BoldItalic'].map((s) => [`Carlito-${s}.ttf`, b64(`Carlito-${s}.ttf`)]));
pdfMake.fonts = { Carlito: { normal: 'Carlito-Regular.ttf', bold: 'Carlito-Bold.ttf', italics: 'Carlito-Italic.ttf', bolditalics: 'Carlito-BoldItalic.ttf' } };
const wm = 'data:image/png;base64,' + b64('watermark.png');
const doc = buildCdd({ prenoms: 'Esteban', nom: 'Quispe Oscco', birthDate: '2004-12-23', street: 'Rue Saint-Germain 36', npa: '1030', city: 'Bussigny',
  avs: '756.3499.8581.85', fonction: 'employé polyvalent', start: '2026-08-20', end: '2026-08-23', salaireHoraire: 23,
  signedOn: new Date(2026, 7, 15), electronique: process.argv.includes('--app') }, wm);
pdfMake.createPdf(doc).getBuffer((buf: Uint8Array) => { writeFileSync(process.argv[2] ?? 'contrat.pdf', buf); console.log('PDF écrit'); });

// Fiche de salaire d'exemple (même visuel) : 3e argument = chemin du PDF
if (process.argv[3]) {
  const { buildFiche } = await import('../src/rh/contrat/fiche');
  const { computePayslip, DEFAULT_SETTINGS } = await import('../src/rh/paie');
  const r = computePayslip({ month: '2026-08', minutes: 31 * 60 + 30, hourlyRate: 23, birthDate: '2004-12-23', permit: 'CH', sourceTaxPct: null,
    avsOnRequest: false, ytdGross: 2100, ytdAvsBase: 0, ytdAcBase: 0 }, { ...DEFAULT_SETTINGS, aanpPct: 1.2 });
  const fiche = buildFiche({ month: '2026-08', prenoms: 'Esteban', nom: 'Quispe Oscco', birthDate: '2004-12-23', street: 'Rue Saint-Germain 36', npa: '1030',
    city: 'Bussigny', avs: '756.3499.8581.85', fonction: 'employé polyvalent', contractStart: '2026-08-20', contractEnd: '2026-08-23', hourlyRate: 23,
    iban: 'CH9300762011623852957', ibanHolder: 'Esteban Quispe Oscco', payDate: '2026-08-30', r }, wm);
  pdfMake.createPdf(fiche).getBuffer((buf: Uint8Array) => { writeFileSync(process.argv[3], buf); console.log('Fiche écrite'); });
}
