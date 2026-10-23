// Génère un rapport journalier d'exemple (données fictives) : npx tsx scripts/sample-report.ts sortie.pdf
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildDailyReport, verificationCode, type DayReport } from '../src/report/dailyReport';

const require = createRequire(import.meta.url);
const pdfMake = require('pdfmake/build/pdfmake.js');
const vfs = require('pdfmake/build/vfs_fonts.js');
pdfMake.vfs = vfs.pdfMake ? vfs.pdfMake.vfs : vfs;

const data: DayReport = {
  company: { name: "ORIGINAL'S COMPLETOS", address: 'Bussigny, Suisse', phone: '078 352 12 02', email: 'info@originalscompletos.ch', responsable: 'Orlando Quispe Oscco' },
  event: '[Nom de l’événement] · exemple', date: new Date(2026, 9, 22), generatedAt: new Date(2026, 9, 22, 23, 15),
  thresholds: [
    { label: 'Froid positif (frigo, saladette)', value: '0 à 4 °C', source: 'Règle interne (VD : 5 °C max, directive OFCO 08.04.2019)' },
    { label: 'Congélateur', value: '≤ −18 °C', source: 'Directive OFCO VD 08.04.2019' },
    { label: 'Maintien au chaud', value: '≥ 65 °C, 3 h max', source: 'Directive OFCO VD 08.04.2019 · BPHR 2.4.4' },
    { label: 'Réchauffe à cœur', value: '≥ 72 °C, 2 min', source: 'Règle interne (BPHR 2.4.4 : 70 °C, 2 min)' },
    { label: 'Huile : température / polaires', value: '≤ 175 °C / < 25 %', source: 'Règle interne (BPHR 2.4.4 : 175 °C, 27 %)' },
    { label: 'Préparations maison', value: 'J+2, ≤ 4 °C', source: 'BPHR 6.3.1 (production + 2 jours)' },
  ],
  attendance: [
    { name: 'Esteban Q.', poste: 'Chef de cuisine', arrival: '10:02', departure: '22:48', apte: true },
    { name: 'Noah', poste: 'Caisse', arrival: '10:30', departure: '22:51', apte: true },
    { name: 'Lucía', poste: 'Aide de cuisine', arrival: '11:00', departure: null, apte: false },
  ],
  readings: [
    { time: '10:10', equipment: 'Frigo (positif)', value: '3,2 °C', status: 'vert', by: 'Esteban', source: 'Tablette' },
    { time: '10:11', equipment: 'Congélateur', value: '−19,5 °C', status: 'vert', by: 'Esteban', source: 'Tablette' },
    { time: '12:40', equipment: 'Cuisson à cœur', value: '76,0 °C', status: 'vert', by: 'Esteban', source: 'Tablette' },
    { time: '18:05', equipment: 'Frigo (positif)', value: '7,2 °C', status: 'rouge', by: 'Esteban', source: 'Tablette' },
    { time: '18:40', equipment: 'Frigo (positif)', value: '3,8 °C', status: 'jaune', by: 'Orlando', source: 'iPhone Gérant' },
    { time: '22:40', equipment: 'Frigo (positif)', value: '3,0 °C', status: 'vert', by: 'Esteban', source: 'Tablette' },
  ],
  oil: [
    { time: '10:20', fryer: 'Friteuse 1', moment: 'Matin', temp: '170 °C', polar: '—', aspect: 'Normal', actions: '—', by: 'Esteban' },
    { time: '22:30', fryer: 'Friteuse 1', moment: 'Soir', temp: '—', polar: '26 %', aspect: 'Normal', actions: 'Filtrée · à changer demain', by: 'Esteban' },
  ],
  receptions: [
    { time: '09:45', supplier: 'Carnadis Sàrl', product: 'Saucisse volaille', lot: 'L2610-77', dlc: '28.10.26', temp: '2,8 °C', result: 'Acceptée', by: 'Esteban', photo: true },
    { time: '09:50', supplier: 'Prodega', product: 'Mayonnaise 5 kg', lot: 'M4421', dlc: '15.01.27', temp: '—', result: 'Acceptée', by: 'Esteban', photo: true },
  ],
  cleaning: [
    { time: '12:15', item: 'Ustensiles et pinces', product: 'Détergent + désinfectant', by: 'Esteban', note: '' },
    { time: '14:00', item: 'Sol', product: 'Détergent + désinfectant', by: 'Lucía', note: '' },
    { time: '16:10', item: 'Zone caisse et service', product: 'Désinfectant alimentaire', by: 'Noah', note: '' },
    { time: '22:45', item: 'Grill à saucisses', product: 'Dégraissant + désinfectant', by: 'Esteban', note: '' },
  ],
  cleaningMissed: [{ item: 'Zone caisse et service', due: '18:10' }],
  lots: [
    { lot: 'JAL-221026-1', recipe: 'Sauce jalapeños', by: 'Esteban', useBy: '24.10.2026', disposed: '—' },
    { lot: 'COL-191026-1', recipe: 'Coleslaw chou rouge', by: 'Esteban', useBy: '21.10.2026', disposed: 'Jeté 10:05 · Esteban' },
  ],
  ncs: [{ opened: '18:05', kind: 'Température', description: 'Frigo (positif) : 7,2 °C hors seuil', by: 'Esteban', status: 'Clôturée',
    steps: ['18:06 Mesure immédiate : produits isolés, porte mal fermée après livraison (Esteban)', '18:40 Vérification : 3,8 °C (Orlando)',
      '18:42 Action corrective : joint contrôlé, consigne de fermeture rappelée (Orlando)', '18:45 Clôture (Orlando)'] }],
};

// --conforme : une journée sans écart (exemple pour les présentations)
if (process.argv.includes('--conforme')) {
  data.event = 'Festival (exemple) · Lausanne · jour 2/3';
  data.attendance = [
    { name: 'Esteban Q.', poste: 'Chef de cuisine', arrival: '10:02', departure: '22:48', pauses: '15:00–15:40', apte: true },
    { name: 'Noah', poste: 'Caisse', arrival: '10:30', departure: '22:51', pauses: '15:45–16:20', apte: true },
    { name: 'Lucía', poste: 'Aide de cuisine', arrival: '11:00', departure: '22:30', pauses: '16:30–17:00', apte: true },
  ];
  data.readings = [
    { time: '10:10', equipment: 'Frigo (positif)', value: '3,2 °C', status: 'vert', by: 'Esteban', source: 'Tablette' },
    { time: '10:11', equipment: 'Congélateur', value: '−19,5 °C', status: 'vert', by: 'Esteban', source: 'Tablette' },
    { time: '10:12', equipment: 'Saladette', value: '2,9 °C', status: 'vert', by: 'Esteban', source: 'Tablette' },
    { time: '12:40', equipment: 'Réchauffe à cœur', value: '76,0 °C', status: 'vert', by: 'Esteban', source: 'Tablette' },
    { time: '14:30', equipment: 'Maintien au chaud', value: '68,5 °C', status: 'vert', by: 'Esteban', source: 'Tablette' },
    { time: '18:05', equipment: 'Frigo (positif)', value: '3,4 °C', status: 'vert', by: 'Esteban', source: 'Tablette' },
    { time: '19:20', equipment: 'Réchauffe à cœur', value: '75,5 °C', status: 'vert', by: 'Esteban', source: 'Tablette' },
    { time: '22:40', equipment: 'Frigo (positif)', value: '3,0 °C', status: 'vert', by: 'Esteban', source: 'Tablette' },
  ];
  data.oil = [
    { time: '10:20', fryer: 'Friteuse 1', moment: 'Matin', temp: '170 °C', polar: '—', aspect: 'Normal', actions: '—', by: 'Esteban' },
    { time: '17:30', fryer: 'Friteuse 1', moment: 'Service', temp: '172 °C', polar: '—', aspect: 'Normal', actions: '—', by: 'Esteban' },
    { time: '22:30', fryer: 'Friteuse 1', moment: 'Soir', temp: '—', polar: '17 %', aspect: 'Normal', actions: 'Filtrée', by: 'Esteban' },
  ];
  data.cleaning = [
    { time: '10:00', item: 'Plans de travail inox', product: 'Désinfectant alimentaire', by: 'Esteban', note: '' },
    { time: '12:15', item: 'Ustensiles et pinces', product: 'Détergent + désinfectant', by: 'Esteban', note: '' },
    { time: '12:30', item: 'Zone caisse et service', product: 'Désinfectant alimentaire', by: 'Noah', note: '' },
    { time: '14:00', item: 'Sol', product: 'Détergent + désinfectant', by: 'Lucía', note: '' },
    { time: '14:30', item: 'Zone caisse et service', product: 'Désinfectant alimentaire', by: 'Noah', note: '' },
    { time: '16:25', item: 'Zone caisse et service', product: 'Désinfectant alimentaire', by: 'Noah', note: '' },
    { time: '18:20', item: 'Zone caisse et service', product: 'Désinfectant alimentaire', by: 'Noah', note: '' },
    { time: '20:15', item: 'Zone caisse et service', product: 'Désinfectant alimentaire', by: 'Noah', note: '' },
    { time: '22:40', item: 'Sol', product: 'Détergent + désinfectant', by: 'Lucía', note: '' },
    { time: '22:45', item: 'Friteuse (extérieur)', product: 'Produit spécial friture', by: 'Esteban', note: '' },
  ];
  data.cleaningMissed = [];
  data.lots = [
    { lot: 'ORI-221026-1', recipe: "Sauce Original's", by: 'Esteban', useBy: '24.10.2026', disposed: '—' },
    { lot: 'JAL-221026-1', recipe: 'Sauce jalapeños', by: 'Esteban', useBy: '24.10.2026', disposed: '—' },
    { lot: 'GUA-221026-1', recipe: 'Guacamole', by: 'Esteban', useBy: '24.10.2026', disposed: '—' },
  ];
  data.ncs = [];
}
const out = process.argv.find((a, i) => i > 1 && !a.startsWith('--')) ?? 'rapport-exemple.pdf';
const code = await verificationCode(data);
pdfMake.createPdf(buildDailyReport(data, code)).getBuffer((buf: Uint8Array) => { writeFileSync(out, buf); console.log('PDF écrit :', out, 'code', code); });
