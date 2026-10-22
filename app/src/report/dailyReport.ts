// Rapport journalier HACCP (D31) : PDF autonome, lisible par un inspecteur sans l'application.
// Indépendant de l'interface : utilisable dans le navigateur et côté serveur (fonction planchée en fin de journée).
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

export interface DayReport {
  company: { name: string; address: string; phone: string; email: string; responsable: string };
  event: string;
  date: Date;
  generatedAt: Date;
  thresholds: { label: string; value: string; source: string }[];
  attendance: { name: string; poste: string; arrival: string; departure: string | null; apte: boolean | null }[];
  readings: { time: string; equipment: string; value: string; status: 'vert' | 'jaune' | 'rouge'; by: string; source: string }[];
  oil: { time: string; fryer: string; moment: string; temp: string; polar: string; aspect: string; actions: string; by: string }[];
  receptions: { time: string; supplier: string; product: string; lot: string; dlc: string; temp: string; result: string; by: string; photo: boolean }[];
  cleaning: { time: string; item: string; product: string; by: string; note: string }[];
  cleaningMissed: { item: string; due: string }[];
  lots: { lot: string; recipe: string; by: string; useBy: string; disposed: string }[];
  ncs: { opened: string; kind: string; description: string; by: string; steps: string[]; status: string }[];
}

const COLORS = { vert: '#1E7A34', jaune: '#000000', rouge: '#D70015' };
const LABEL = { vert: 'Conforme', jaune: 'Conforme (proche limite)', rouge: 'NON CONFORME' };

/** Code de vérification : empreinte SHA-256 des données, imprimée sur chaque page. */
export async function verificationCode(data: DayReport): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

const section = (title: string, intro?: string): Content[] => [
  { text: title, style: 'h2', margin: [0, 14, 0, 4] },
  ...(intro ? [{ text: intro, style: 'small', margin: [0, 0, 0, 4] } as Content] : []),
];

function table(headers: string[], rows: (string | Content)[][], widths: (string | number)[], empty: string): Content {
  if (rows.length === 0) return { text: empty, style: 'small', italics: true };
  return {
    table: { headerRows: 1, keepWithHeaderRows: 1, widths, body: [headers.map((h) => ({ text: h, style: 'th' })), ...rows] },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => '#BBBBBB', fillColor: (r: number) => (r === 0 ? '#EEEEEE' : null),
      paddingTop: () => 3, paddingBottom: () => 3 },
    fontSize: 8.5,
  };
}

export function buildDailyReport(d: DayReport, code: string): TDocumentDefinitions {
  const day = d.date.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const red = (s: string, bad: boolean): Content => ({ text: s, color: bad ? COLORS.rouge : '#000', bold: bad });
  const ncOpen = d.ncs.filter((n) => n.status !== 'Clôturée').length;

  return {
    pageSize: 'A4',
    pageMargins: [36, 54, 36, 48],
    info: { title: `Rapport HACCP ${d.date.toISOString().slice(0, 10)}`, author: d.company.name },
    header: (page) => (page === 1 ? null : { text: `${d.company.name} · Rapport HACCP du ${d.date.toLocaleDateString('fr-CH')} · ${d.event}`, style: 'small', margin: [36, 24, 36, 0] }),
    footer: (page, pages) => ({
      columns: [{ text: `Code de vérification ${code}`, style: 'small' }, { text: `Page ${page}/${pages}`, style: 'small', alignment: 'right' }],
      margin: [36, 16, 36, 0],
    }),
    content: [
      { text: 'RAPPORT JOURNALIER D’AUTOCONTRÔLE HACCP', style: 'h1' },
      { text: `${d.company.name} · ${d.event}`, fontSize: 12, bold: true },
      { text: day.charAt(0).toUpperCase() + day.slice(1), fontSize: 12, margin: [0, 0, 0, 8] },
      {
        columns: [
          { stack: [d.company.address, `Tél. ${d.company.phone} · ${d.company.email}`, `Responsable HACCP : ${d.company.responsable}`], style: 'small' },
          { stack: [`Généré automatiquement le ${d.generatedAt.toLocaleString('fr-CH')}`, `Non-conformités ouvertes en fin de journée : ${ncOpen}`], style: 'small', alignment: 'right' },
        ],
      },
      ...section('Comment lire ce rapport'),
      {
        ul: [
          'Ce rapport reprend tous les contrôles enregistrés ce jour dans l’application NORMA, dans l’ordre du classeur HACCP du stand.',
          'Chaque ligne indique l’heure, la valeur relevée et la personne qui a fait le contrôle. Les écarts sont en rouge, avec l’action corrective.',
          'Les enregistrements ne peuvent pas être modifiés ni supprimés dans l’application ; une correction apparaît comme une nouvelle ligne.',
          'Le code de vérification en bas de page correspond aux données du jour : un document modifié après coup ne correspond plus au code conservé.',
          'Les seuils marqués « règle interne » sont plus stricts que l’exigence officielle ou comblent l’absence de valeur officielle.',
          'L’application aide à l’autocontrôle ; elle ne remplace pas la responsabilité de l’exploitant.',
        ], style: 'small',
      },
      ...section('Seuils appliqués et sources'),
      table(['Contrôle', 'Seuil', 'Source'], d.thresholds.map((t) => [t.label, t.value, t.source]), ['*', 80, '*'], '—'),

      ...section('1. Présence et prise de poste', 'État de santé enregistré uniquement comme apte / non apte (aucun symptôme).'),
      table(['Personne', 'Poste', 'Arrivée', 'Départ', 'Prise de poste'], d.attendance.map((a) =>
        [a.name, a.poste, a.arrival, a.departure ?? '— (en service)', a.apte === null ? red('Non faite', true) : a.apte ? 'Apte' : red('Non apte', true)]), ['*', '*', 50, 70, 70], 'Aucun pointage.'),

      ...section('2. Températures'),
      table(['Heure', 'Équipement', 'Valeur', 'Résultat', 'Par', 'Saisie'], d.readings.map((r) =>
        [r.time, r.equipment, r.value, { text: LABEL[r.status], color: COLORS[r.status], bold: r.status === 'rouge' }, r.by, r.source]), [36, '*', 50, 90, 60, 50], 'Aucun relevé.'),

      ...section('3. Huile de friture'),
      table(['Heure', 'Friteuse', 'Moment', 'Temp.', 'Polaires', 'Aspect', 'Actions', 'Par'], d.oil.map((o) =>
        [o.time, o.fryer, o.moment, o.temp, o.polar, red(o.aspect, o.aspect !== 'Normal'), o.actions, o.by]), [32, 50, 40, 34, 40, '*', '*', 45], 'Aucun contrôle d’huile.'),

      ...section('4. Réception des marchandises'),
      table(['Heure', 'Fournisseur', 'Produit', 'Lot', 'DLC', 'Temp.', 'Décision', 'Par'], d.receptions.map((r) =>
        [r.time, r.supplier, r.product, r.lot, r.dlc, r.temp, red(r.result, r.result !== 'Acceptée'), r.by + (r.photo ? ' (photo)' : '')]), [30, 60, '*', 50, 46, 34, 60, 40], 'Aucune réception.'),

      ...section('5. Nettoyage et désinfection'),
      table(['Heure', 'Zone / équipement', 'Produit', 'Par', 'Remarque'], d.cleaning.map((c) => [c.time, c.item, c.product, c.by, c.note]), [36, '*', '*', 60, 80], 'Aucun nettoyage enregistré.'),
      ...(d.cleaningMissed.length ? [{ text: 'Tâches non faites à l’heure prévue :', style: 'small', bold: true, color: COLORS.rouge, margin: [0, 4, 0, 2] } as Content,
        table(['Zone / équipement', 'Échéance'], d.cleaningMissed.map((m) => [m.item, m.due]), ['*', 80], '')] : []),

      ...section('6. Préparations et lots', 'Durée de conservation interne : jour de production + 2 jours, à 4 °C maximum.'),
      table(['Lot', 'Préparation', 'Produit par', 'À utiliser jusqu’au', 'Élimination'], d.lots.map((l) => [l.lot, l.recipe, l.by, l.useBy, l.disposed]), [80, '*', 60, 80, 90], 'Aucune préparation.'),

      ...section('7. Non-conformités et actions correctives'),
      ...(d.ncs.length === 0 ? [{ text: 'Aucune non-conformité.', style: 'small', italics: true } as Content] : d.ncs.map((n): Content => ({
        stack: [
          { text: `${n.opened} · ${n.kind} · ${n.status}`, bold: true, fontSize: 9, color: n.status === 'Clôturée' ? '#000' : COLORS.rouge },
          { text: `${n.description} (signalé par ${n.by})`, fontSize: 9 },
          { ul: n.steps.length ? n.steps : ['Aucune action enregistrée'], fontSize: 8.5 },
        ], margin: [0, 2, 0, 6], unbreakable: true,
      }))),

      { text: 'Visa du responsable', style: 'h2', margin: [0, 20, 0, 6], pageBreak: undefined },
      { table: { widths: ['*', '*'], body: [['Nom :', 'Signature :'], [{ text: ' ', margin: [0, 18] }, ' ']] }, layout: 'noBorders', fontSize: 9 },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 0.5 }] },
    ],
    styles: {
      h1: { fontSize: 15, bold: true, margin: [0, 0, 0, 4] },
      h2: { fontSize: 11, bold: true },
      th: { bold: true, fontSize: 8.5 },
      small: { fontSize: 8, color: '#333333' },
    },
    defaultStyle: { fontSize: 9 },
  };
}
