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

const C = { green: '#1E7A34', greenBg: '#E3F2E7', red: '#C40012', redBg: '#FCE4E7', yellowBg: '#FFF1B8', band: '#1F2933', grey: '#555555', zebra: '#F6F7F9' };
type Row = (string | Content)[];

/** Code de vérification : empreinte SHA-256 des données, imprimée sur chaque page. */
export async function verificationCode(data: DayReport): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

/** Pastille de résultat : texte + fond coloré (lisible aussi en noir et blanc grâce au mot). */
const badge = (kind: 'ok' | 'warn' | 'bad', text: string): Content => ({
  text: ` ${text} `, bold: kind !== 'ok', color: kind === 'bad' ? '#FFFFFF' : kind === 'warn' ? '#000000' : C.green,
  fillColor: kind === 'bad' ? C.red : kind === 'warn' ? C.yellowBg : C.greenBg,
});

/** Bandeau de section : titre + résumé chiffré à droite (ex. « 6 relevés · 1 écart »). */
const sectionBand = (n: number, title: string, summary: string, bad: boolean | 'warn'): Content => ({
  // @ts-expect-error pdfmake accepte « id » sur tout nœud (utilisé par pageBreakBefore)
  id: `band-${n}`,
  table: { widths: ['*', 'auto'], body: [[
    { text: `${n}. ${title}`, bold: true, fontSize: 12, color: bad === 'warn' ? '#000000' : '#FFFFFF', margin: [6, 4, 0, 4] },
    { text: summary, fontSize: 10, bold: !!bad, color: bad === 'warn' ? '#000000' : '#FFFFFF', alignment: 'right', margin: [0, 5, 6, 4] }]] },
  layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => (bad === 'warn' ? '#FFD60A' : bad ? C.red : C.band) },
  margin: [0, 16, 0, 6],
});

/** Tableau aéré : lignes alternées, ligne entière teintée en rouge si écart. */
function table(headers: string[], rows: Row[], widths: (string | number)[], empty: string, badRows: boolean[] = []): Content {
  if (rows.length === 0) return { text: empty, italics: true, color: C.grey, margin: [6, 0, 0, 0] };
  return {
    table: { headerRows: 1, keepWithHeaderRows: 1, dontBreakRows: true, widths, body: [headers.map((h) => ({ text: h.toUpperCase(), fontSize: 7.5, bold: true, color: C.grey })), ...rows] },
    layout: {
      hLineWidth: (i: number) => (i === 1 ? 1 : 0), vLineWidth: () => 0, hLineColor: () => '#999999',
      fillColor: (r: number) => (r === 0 ? null : badRows[r - 1] ? C.redBg : r % 2 === 0 ? C.zebra : null),
      paddingTop: () => 5, paddingBottom: () => 5, paddingLeft: () => 6, paddingRight: () => 6,
    },
    fontSize: 9.5,
  };
}

export function buildDailyReport(d: DayReport, code: string): TDocumentDefinitions {
  const day = d.date.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

  // Chiffres du jour pour la synthèse et les bandeaux
  const rRed = d.readings.filter((r) => r.status === 'rouge').length;
  const oilBad = d.oil.filter((o) => o.aspect !== 'Normal' || (o.moment !== 'Soir' && /changer/i.test(o.actions))).length;
  const oilWarn = d.oil.filter((o) => o.moment === 'Soir' && /changer/i.test(o.actions)).length;
  const recBad = d.receptions.filter((r) => r.result !== 'Acceptée').length;
  const notApte = d.attendance.filter((a) => a.apte !== true).length;
  const ncOpen = d.ncs.filter((n) => n.status !== 'Clôturée').length;
  const lotsOut = d.lots.filter((l) => l.disposed !== '—').length;
  const ecarts = rRed + oilBad + recBad + d.cleaningMissed.length + notApte;

  const synth: [string, string, 'ok' | 'warn' | 'bad', string][] = [
    ['Présence et prise de poste', plural(d.attendance.length, 'personne'), notApte ? 'bad' : 'ok', notApte ? `${notApte} non apte / non faite` : 'Tous aptes'],
    ['Températures', plural(d.readings.length, 'relevé'), rRed ? 'bad' : 'ok', rRed ? plural(rRed, 'écart') : 'Conforme'],
    ['Huile de friture', plural(d.oil.length, 'contrôle'), oilBad ? 'bad' : oilWarn ? 'warn' : 'ok', oilBad ? plural(oilBad, 'écart') : oilWarn ? 'Changement prévu demain' : 'Conforme'],
    ['Réceptions', plural(d.receptions.length, 'livraison'), recBad ? 'bad' : 'ok', recBad ? plural(recBad, 'refus') : 'Conforme'],
    ['Nettoyage', plural(d.cleaning.length, 'tâche') + ' faite' + (d.cleaning.length > 1 ? 's' : ''), d.cleaningMissed.length ? 'bad' : 'ok', d.cleaningMissed.length ? plural(d.cleaningMissed.length, 'retard') : 'À jour'],
    ['Préparations et lots', plural(d.lots.length, 'lot'), 'ok', lotsOut ? `${lotsOut} éliminé${lotsOut > 1 ? 's' : ''}` : 'Conforme'],
    ['Non-conformités', plural(d.ncs.length, 'incident'), ncOpen ? 'bad' : 'ok', ncOpen ? plural(ncOpen, 'ouverte') : d.ncs.length ? 'Toutes clôturées' : 'Aucune'],
  ];
  const verdict = ncOpen ? { t: `${plural(ncOpen, 'non-conformité')} encore ouverte${ncOpen > 1 ? 's' : ''}`, c: C.red, bg: C.redBg }
    : ecarts ? { t: `Journée maîtrisée : ${plural(ecarts, 'écart')} détecté${ecarts > 1 ? 's' : ''} et traité${ecarts > 1 ? 's' : ''}`, c: '#000000', bg: C.yellowBg }
    : { t: 'Journée conforme : aucun écart', c: C.green, bg: C.greenBg };

  const thr = (label: string) => d.thresholds.find((t) => t.label.toLowerCase().startsWith(label.toLowerCase()))?.value ?? '';

  return {
    pageSize: 'A4',
    pageMargins: [40, 56, 40, 50],
    // Un bandeau de section ne reste jamais seul en bas de page
    pageBreakBefore: (node, following) => typeof node.id === 'string' && node.id.startsWith('band-') && following.length < 2,
    info: { title: `Rapport HACCP ${d.date.toISOString().slice(0, 10)}`, author: d.company.name },
    header: (page) => (page === 1 ? null : { text: `${d.company.name}  ·  Rapport HACCP du ${d.date.toLocaleDateString('fr-CH')}  ·  ${d.event}`, fontSize: 8, color: C.grey, margin: [40, 26, 40, 0] }),
    footer: (page, pages) => ({
      columns: [{ text: `Code de vérification ${code}`, fontSize: 8, color: C.grey }, { text: `Page ${page} / ${pages}`, fontSize: 8, color: C.grey, alignment: 'right' }],
      margin: [40, 18, 40, 0],
    }),
    content: [
      // ---------- Page 1 : en-tête + synthèse lisible en 10 secondes
      { columns: [
        { stack: [{ text: 'RAPPORT JOURNALIER HACCP', fontSize: 9, bold: true, color: C.grey, characterSpacing: 1 },
          { text: d.company.name, fontSize: 20, bold: true }, { text: d.event, fontSize: 11 }] },
        { stack: [{ text: cap(day), fontSize: 13, bold: true, alignment: 'right' },
          { text: `Responsable HACCP : ${d.company.responsable}`, fontSize: 9, alignment: 'right', color: C.grey },
          { text: `${d.company.address} · ${d.company.phone}`, fontSize: 9, alignment: 'right', color: C.grey }] },
      ] },
      { table: { widths: ['*'], body: [[{ text: verdict.t, fontSize: 14, bold: true, color: verdict.c, margin: [10, 9, 10, 9] }]] },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => verdict.bg }, margin: [0, 16, 0, 10] },
      { text: 'SYNTHÈSE DU JOUR', fontSize: 9, bold: true, color: C.grey, characterSpacing: 1, margin: [0, 0, 0, 4] },
      table(['Contrôle', 'Volume', 'Résultat'], synth.map(([a, b, k, t]) => [{ text: a, bold: true }, b, badge(k, t)]), ['*', 120, 150], ''),
      { text: 'Le détail de chaque contrôle suit, dans l’ordre du classeur. Les lignes sur fond rouge sont des écarts ; leur action corrective figure au point 7. Seuils et mode de lecture : dernière page.',
        fontSize: 9, color: C.grey, margin: [0, 8, 0, 0] },

      // ---------- Détail
      sectionBand(1, 'Présence et prise de poste', notApte ? `${notApte} non apte / non faite` : 'Tous aptes', !!notApte),
      table(['Personne', 'Poste', 'Arrivée', 'Départ', 'Prise de poste'], d.attendance.map((a) =>
        [{ text: a.name, bold: true }, a.poste, a.arrival, a.departure ?? 'en service', a.apte === null ? badge('bad', 'Non faite') : a.apte ? badge('ok', 'Apte') : badge('bad', 'Non apte')]),
        ['*', '*', 50, 60, 80], 'Aucun pointage.', d.attendance.map((a) => a.apte !== true)),

      sectionBand(2, 'Températures', `${plural(d.readings.length, 'relevé')}${rRed ? ' · ' + plural(rRed, 'écart') : ''}`, !!rRed),
      table(['Heure', 'Équipement', 'Valeur', 'Résultat', 'Par'], d.readings.map((r) =>
        [r.time, { text: r.equipment, bold: true }, { text: r.value, bold: true }, r.status === 'rouge' ? badge('bad', 'ÉCART') : r.status === 'jaune' ? badge('warn', 'Limite') : badge('ok', 'OK'), `${r.by}${r.source !== 'Tablette' ? ' (' + r.source + ')' : ''}`]),
        [38, '*', 60, 55, 110], 'Aucun relevé.', d.readings.map((r) => r.status === 'rouge')),

      sectionBand(3, 'Huile de friture', `${plural(d.oil.length, 'contrôle')}${oilBad ? ' · ' + plural(oilBad, 'écart') : oilWarn ? ' · changement prévu' : ''}`, oilBad ? true : oilWarn ? 'warn' : false),
      table(['Heure', 'Friteuse', 'Moment', 'Temp.', 'Polaires', 'Aspect', 'Suite donnée', 'Par'], d.oil.map((o) =>
        [o.time, o.fryer, o.moment, o.temp, o.polar, o.aspect === 'Normal' ? 'Normal' : { text: o.aspect, bold: true, color: C.red }, o.actions, o.by]),
        [32, 55, 38, 36, 40, '*', 75, 45], 'Aucun contrôle d’huile.', d.oil.map((o) => o.aspect !== 'Normal')),

      sectionBand(4, 'Réception des marchandises', `${plural(d.receptions.length, 'livraison')}${recBad ? ' · ' + plural(recBad, 'refus') : ''}`, !!recBad),
      table(['Heure', 'Produit / fournisseur', 'Lot', 'DLC', 'Temp.', 'Décision'], d.receptions.map((r) =>
        [r.time, { stack: [{ text: r.product, bold: true }, { text: `${r.supplier} · ${r.by}${r.photo ? ' · bon photographié' : ''}`, fontSize: 8, color: C.grey }] },
          r.lot, r.dlc, r.temp, r.result === 'Acceptée' ? badge('ok', 'Acceptée') : badge('bad', r.result)]),
        [32, '*', 60, 50, 40, 80], 'Aucune réception.', d.receptions.map((r) => r.result !== 'Acceptée')),

      sectionBand(5, 'Nettoyage et désinfection', `${plural(d.cleaning.length, 'tâche')}${d.cleaningMissed.length ? ' · ' + plural(d.cleaningMissed.length, 'retard') : ''}`, d.cleaningMissed.length > 0),
      table(['Heure', 'Zone / équipement', 'Produit', 'Par'],
        [...d.cleaningMissed.map((m): Row => [{ text: m.due, bold: true }, { text: m.item, bold: true }, badge('bad', 'NON FAIT À L’HEURE'), '—']),
          ...d.cleaning.map((c): Row => [c.time, { text: c.item, bold: true }, c.product, c.by])],
        [38, '*', '*', 70], 'Aucun nettoyage enregistré.', [...d.cleaningMissed.map(() => true), ...d.cleaning.map(() => false)]),

      sectionBand(6, 'Préparations et lots', `${plural(d.lots.length, 'lot')} · conservation ${thr('Préparations')}`, false),
      table(['Lot', 'Préparation', 'Par', 'Limite', 'Élimination'], d.lots.map((l) =>
        [{ text: l.lot, bold: true }, l.recipe, l.by, l.useBy, l.disposed]), [85, '*', 55, 65, 100], 'Aucune préparation.'),

      sectionBand(7, 'Non-conformités et actions correctives', ncOpen ? plural(ncOpen, 'ouverte') : d.ncs.length ? 'Toutes clôturées' : 'Aucune', !!ncOpen),
      ...(d.ncs.length === 0 ? [{ text: 'Aucune non-conformité ce jour.', italics: true, color: C.grey, margin: [6, 0, 0, 0] } as Content] : d.ncs.map((n): Content => ({
        table: { widths: ['*'], body: [[{ stack: [
          { columns: [{ text: `${n.opened}  ·  ${n.kind}`, bold: true, fontSize: 10 }, { ...(badge(n.status === 'Clôturée' ? 'ok' : 'bad', n.status) as object), alignment: 'right', fontSize: 9 } as Content] },
          { text: n.description, fontSize: 10, margin: [0, 3, 0, 4] },
          { ol: n.steps.length ? n.steps : ['Aucune action enregistrée'], fontSize: 9, color: '#222222' },
          { text: `Signalé par ${n.by}`, fontSize: 8, color: C.grey, margin: [0, 4, 0, 0] },
        ], margin: [8, 6, 8, 6] }]] },
        layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 3 : 0), vLineColor: () => (n.status === 'Clôturée' ? C.green : C.red), fillColor: () => C.zebra },
        margin: [0, 0, 0, 8], unbreakable: true,
      }))),

      { text: 'Visa du responsable', fontSize: 11, bold: true, margin: [0, 18, 0, 8] },
      { table: { widths: ['*', '*', '*'], body: [[
        { text: 'Nom', fontSize: 8, color: C.grey, margin: [0, 0, 0, 22] }, { text: 'Date', fontSize: 8, color: C.grey }, { text: 'Signature', fontSize: 8, color: C.grey }]] },
        layout: { hLineWidth: (i: number) => (i === 1 ? 0.8 : 0), vLineWidth: () => 0 } },

      // ---------- Annexe : lecture et seuils
      { text: 'Annexe · Comment lire ce rapport', fontSize: 13, bold: true, pageBreak: 'before', margin: [0, 0, 0, 8] },
      { ul: [
        'Le rapport reprend tous les contrôles enregistrés ce jour dans l’application NORMA, dans l’ordre du classeur HACCP du stand.',
        'Chaque ligne indique l’heure, la valeur et la personne qui a fait le contrôle. « (iPhone …) » signale une saisie de dépannage depuis le téléphone du Gérant ou du Manager.',
        'Les lignes sur fond rouge sont des écarts ; l’action corrective correspondante est détaillée au point 7.',
        'Les enregistrements ne peuvent être ni modifiés ni supprimés ; une correction apparaît comme une nouvelle ligne.',
        'L’état de santé du personnel est enregistré uniquement comme « apte » ou « non apte », sans aucun symptôme.',
        'Le code de vérification en bas de page correspond aux données du jour : un document modifié après coup ne correspond plus au code conservé dans l’application.',
        'L’application aide à l’autocontrôle ; elle ne remplace pas la responsabilité de l’exploitant.',
      ], fontSize: 10, lineHeight: 1.3, margin: [0, 0, 0, 14] },
      { text: 'Seuils appliqués et sources', fontSize: 13, bold: true, margin: [0, 0, 0, 8] },
      table(['Contrôle', 'Seuil', 'Source'], d.thresholds.map((t) => [{ text: t.label, bold: true }, t.value, t.source]), ['*', 90, '*'], '—'),
      { text: '« Règle interne » : seuil plus strict que l’exigence officielle, ou fixé par l’entreprise en l’absence de valeur officielle.', fontSize: 9, color: C.grey, margin: [0, 6, 0, 0] },
    ],
    defaultStyle: { fontSize: 10, lineHeight: 1.15 },
  };
}
