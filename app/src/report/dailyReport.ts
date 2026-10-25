// Rapport journalier HACCP (D31) : PDF autonome, lisible par un inspecteur sans l'application.
// Indépendant de l'interface : utilisable dans le navigateur et côté serveur (fonction planchée en fin de journée).
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

/** Date du jour local (AAAA-MM-JJ), sans décalage UTC */
export const localIso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

export interface DayReport {
  company: { name: string; address: string; phone: string; email: string; responsable: string };
  event: string;
  date: Date;
  generatedAt: Date;
  thresholds: { label: string; value: string; source: string }[];
  attendance: { name: string; poste: string; arrival: string; departure: string | null; pauses?: string; apte: boolean | null }[];
  readings: { time: string; equipment: string; value: string; status: 'vert' | 'jaune' | 'rouge'; by: string; source: string }[];
  oil: { time: string; fryer: string; moment: string; temp: string; polar: string; aspect: string; actions: string; by: string }[];
  receptions: { time: string; supplier: string; product: string; lot: string; dlc: string; temp: string; result: string; by: string; photo: boolean }[];
  cleaning: { time: string; item: string; product: string; by: string; note: string }[];
  cleaningMissed: { item: string; due: string }[];
  lots: { lot: string; recipe: string; by: string; useBy: string; disposed: string }[];
  ncs: { opened: string; kind: string; description: string; by: string; steps: string[]; status: string }[];
}

const C = { green: '#1E7A34', greenBg: '#E3F2E7', red: '#9B1C2C', redSoft: '#F3CDD2', redBg: '#FBEBED', yellowBg: '#FFF1B8', grey: '#555555', zebra: '#F6F7F9',
  bandOk: '#D3EBDA', bandOkText: '#14532D', bandWarn: '#FFE58F', bandBad: '#F3CDD2', bandBadText: '#7A1020' };
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
  text: ` ${text} `, bold: kind !== 'ok', color: kind === 'bad' ? C.bandBadText : kind === 'warn' ? '#000000' : C.green,
  fillColor: kind === 'bad' ? C.redSoft : kind === 'warn' ? C.yellowBg : C.greenBg,
});

/** Bandeau de section : titre + résumé chiffré à droite (ex. « 6 relevés · 1 écart »). */
const sectionBand = (n: number, title: string, summary: string, bad: boolean | 'warn'): Content => ({
  // @ts-expect-error pdfmake accepte « id » sur tout nœud (utilisé par pageBreakBefore)
  id: `band-${n}`,
  table: { widths: ['*', 'auto'], body: [[
    { text: `${n}. ${title}`, bold: true, fontSize: 10.5, color: bad === 'warn' ? '#000000' : bad ? C.bandBadText : C.bandOkText, margin: [6, 2, 0, 2] },
    { text: summary, fontSize: 10, bold: !!bad, color: bad === 'warn' ? '#000000' : bad ? C.bandBadText : C.bandOkText, alignment: 'right', margin: [0, 3, 6, 2] }]] },
  layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => (bad === 'warn' ? C.bandWarn : bad ? C.bandBad : C.bandOk) },
  margin: [0, 9, 0, 3],
});

/** Tableau aéré : lignes alternées, ligne entière teintée en rouge si écart. */
function table(headers: string[], rows: Row[], widths: (string | number)[], empty: string, badRows: boolean[] = []): Content {
  if (rows.length === 0) return { text: empty, italics: true, color: C.grey, margin: [6, 0, 0, 0] };
  return {
    table: { headerRows: 1, keepWithHeaderRows: 1, dontBreakRows: true, widths, body: [headers.map((h) => ({ text: h.toUpperCase(), fontSize: 7, bold: true, color: C.grey })), ...rows] },
    layout: {
      hLineWidth: (i: number) => (i === 1 ? 1 : 0), vLineWidth: () => 0, hLineColor: () => '#999999',
      fillColor: (r: number) => (r === 0 ? null : badRows[r - 1] ? C.redBg : r % 2 === 0 ? C.zebra : null),
      paddingTop: () => 2.5, paddingBottom: () => 2.5, paddingLeft: () => 5, paddingRight: () => 5,
    },
    fontSize: 8.8,
  };
}

/** Chiffres du jour (synthèse, bandeau, score) : partagés par le PDF et l'e-mail du matin. */
export function reportSummary(d: DayReport) {
  const rRed = d.readings.filter((r) => r.status === 'rouge').length;
  const oilBad = d.oil.filter((o) => o.aspect !== 'Normal' || (o.moment !== 'Soir' && /changer/i.test(o.actions))).length;
  const oilWarn = d.oil.filter((o) => o.moment === 'Soir' && /changer/i.test(o.actions)).length;
  const recBad = d.receptions.filter((r) => r.result !== 'Acceptée').length;
  const notApte = d.attendance.filter((a) => a.apte !== true).length;
  const ncOpen = d.ncs.filter((n) => n.status !== 'Clôturée').length;
  const lotsOut = d.lots.filter((l) => l.disposed !== '—').length;
  const ecarts = rRed + oilBad + recBad + d.cleaningMissed.length + notApte;
  // Score interne (indicatif) : part des contrôles conformes, moins 10 points par non-conformité restée ouverte
  const totalControls = d.readings.length + d.oil.length + d.receptions.length + d.cleaning.length + d.cleaningMissed.length + d.attendance.length;
  const score = Math.max(0, Math.round(totalControls ? (100 * (totalControls - ecarts)) / totalControls : 100) - 10 * ncOpen);
  return { rRed, oilBad, oilWarn, recBad, notApte, ncOpen, lotsOut, ecarts, score };
}

/** Phrase du bandeau : « Journée conforme », « Journée maîtrisée : n écarts… » ou « n non-conformités encore ouvertes ». */
export function verdictText(d: DayReport) {
  const { ncOpen, ecarts } = reportSummary(d);
  const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;
  return ncOpen ? `${plural(ncOpen, 'non-conformité')} encore ouverte${ncOpen > 1 ? 's' : ''}`
    : ecarts ? `Journée maîtrisée : ${plural(ecarts, 'écart')} détecté${ecarts > 1 ? 's' : ''} et traité${ecarts > 1 ? 's' : ''}`
    : 'Journée conforme : aucun écart';
}

export function buildDailyReport(d: DayReport, code: string): TDocumentDefinitions {
  const day = d.date.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

  const { rRed, oilBad, oilWarn, recBad, notApte, ncOpen, lotsOut, ecarts, score } = reportSummary(d);

  const synth: [string, string, 'ok' | 'warn' | 'bad', string][] = [
    ['Présence et prise de poste', plural(d.attendance.length, 'personne'), notApte ? 'bad' : 'ok', notApte ? `${notApte} non apte / non faite` : 'Tous aptes'],
    ['Températures', plural(d.readings.length, 'relevé'), rRed ? 'bad' : 'ok', rRed ? plural(rRed, 'écart') : 'Conforme'],
    ['Huile de friture', plural(d.oil.length, 'contrôle'), oilBad ? 'bad' : oilWarn ? 'warn' : 'ok', oilBad ? plural(oilBad, 'écart') : oilWarn ? 'Changement prévu demain' : 'Conforme'],
    ['Réceptions', plural(d.receptions.length, 'livraison'), recBad ? 'bad' : 'ok', recBad ? plural(recBad, 'refus') : 'Conforme'],
    ['Nettoyage', plural(d.cleaning.length, 'tâche') + ' faite' + (d.cleaning.length > 1 ? 's' : ''), d.cleaningMissed.length ? 'bad' : 'ok', d.cleaningMissed.length ? plural(d.cleaningMissed.length, 'retard') : 'À jour'],
    ['Préparations et lots', plural(d.lots.length, 'lot'), 'ok', lotsOut ? `${lotsOut} éliminé${lotsOut > 1 ? 's' : ''}` : 'Conforme'],
    ['Non-conformités', plural(d.ncs.length, 'incident'), ncOpen ? 'bad' : 'ok', ncOpen ? plural(ncOpen, 'ouverte') : d.ncs.length ? 'Toutes clôturées' : 'Aucune'],
  ];
  const verdict = { t: verdictText(d), ...(ncOpen ? { c: C.bandBadText, bg: C.redBg } : ecarts ? { c: '#000000', bg: C.yellowBg } : { c: C.green, bg: C.greenBg }) };

  const thr = (label: string) => d.thresholds.find((t) => t.label.toLowerCase().startsWith(label.toLowerCase()))?.value ?? '';

  return {
    pageSize: 'A4',
    pageMargins: [34, 44, 34, 40],
    // Un bandeau de section ne reste jamais seul en bas de page
    pageBreakBefore: (node) => typeof node.id === 'string' && node.id.startsWith('band-') && node.startPosition.top > 841.89 - 40 - 110,
    info: { title: `Rapport HACCP ${localIso(d.date)}`, author: d.company.name },
    header: (page) => (page === 1 ? null : { text: `${d.company.name}  ·  Rapport HACCP du ${d.date.toLocaleDateString('fr-CH')}  ·  ${d.event}`, fontSize: 8, color: C.grey, margin: [34, 20, 34, 0] }),
    footer: (page, pages) => ({
      columns: [{ text: `Code de vérification ${code}`, fontSize: 8, color: C.grey }, { text: `Page ${page} / ${pages}`, fontSize: 8, color: C.grey, alignment: 'right' }],
      margin: [34, 14, 34, 0],
    }),
    content: [
      // ---------- Page 1 : en-tête + synthèse lisible en 10 secondes
      { columns: [
        { stack: [{ text: 'RAPPORT JOURNALIER HACCP', fontSize: 9, bold: true, color: C.grey, characterSpacing: 1 },
          { text: d.company.name, fontSize: 17, bold: true }, { text: d.event, fontSize: 11 }] },
        { stack: [{ text: cap(day), fontSize: 13, bold: true, alignment: 'right' },
          { text: `Responsable HACCP : ${d.company.responsable}`, fontSize: 9, alignment: 'right', color: C.grey },
          { text: `${d.company.address} · ${d.company.phone}`, fontSize: 9, alignment: 'right', color: C.grey }] },
      ] },
      { table: { widths: ['*', 'auto'], body: [[
        { text: verdict.t, fontSize: 12.5, bold: true, color: verdict.c, margin: [10, 9, 10, 6] },
        { stack: [{ text: [{ text: String(score), fontSize: 20, bold: true }, { text: ' / 100', fontSize: 11 }], color: verdict.c, alignment: 'right' },
          { text: 'score du jour', fontSize: 8, color: C.grey, alignment: 'right' }], margin: [10, 3, 10, 3] }]] },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => verdict.bg }, margin: [0, 10, 0, 6] },
      { text: 'SYNTHÈSE DU JOUR', fontSize: 9, bold: true, color: C.grey, characterSpacing: 1, margin: [0, 0, 0, 4] },
      table(['Contrôle', 'Volume', 'Résultat'], synth.map(([a, b, k, t]) => [{ text: a, bold: true }, b, badge(k, t)]), ['*', 120, 150], ''),
      { text: 'Le détail de chaque contrôle suit, dans l’ordre du classeur. Les lignes sur fond rouge sont des écarts ; leur action corrective figure au point 7. Seuils et mode de lecture : en fin de rapport.',
        fontSize: 8, color: C.grey, margin: [0, 4, 0, 0] },

      // ---------- Détail
      sectionBand(1, 'Présence et prise de poste', notApte ? `${notApte} non apte / non faite` : 'Tous aptes', !!notApte),
      table(['Personne', 'Poste', 'Arrivée', 'Départ', 'Pauses', 'Prise de poste'], d.attendance.map((a) =>
        [{ text: a.name, bold: true }, a.poste, a.arrival, a.departure ?? 'en service', a.pauses || '—', a.apte === null ? badge('bad', 'Non faite') : a.apte ? badge('ok', 'Apte') : badge('bad', 'Non apte')]),
        ['*', 70, 42, 50, '*', 72], 'Aucun pointage.', d.attendance.map((a) => a.apte !== true)),

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
          { text: n.description, fontSize: 9, margin: [0, 2, 0, 2] },
          { ol: n.steps.length ? n.steps : ['Aucune action enregistrée'], fontSize: 8.5, color: '#222222' },
          { text: `Signalé par ${n.by}`, fontSize: 8, color: C.grey, margin: [0, 4, 0, 0] },
        ], margin: [8, 4, 8, 4] }]] },
        layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 3 : 0), vLineColor: () => (n.status === 'Clôturée' ? C.green : '#D9707D'), fillColor: () => C.zebra },
        margin: [0, 0, 0, 5], unbreakable: true,
      }))),

      { columns: [
        { width: '*', stack: [
          { text: 'Comment lire ce rapport', fontSize: 9, bold: true, margin: [0, 0, 0, 2] },
          { ul: [
            'Tous les contrôles du jour, dans l’ordre du classeur HACCP ; heure, valeur et auteur pour chaque ligne.',
            'Fond rouge = écart (action corrective au point 7) ; jaune = à surveiller ; « (iPhone …) » = saisie de dépannage.',
            'Enregistrements non modifiables : une correction apparaît comme une nouvelle ligne. Santé : apte / non apte uniquement.',
            'Code de vérification : correspond aux données du jour ; un document modifié ne correspond plus au code conservé.',
            'Score du jour : indicateur interne sans valeur réglementaire (% de contrôles conformes, −10 par non-conformité ouverte).',
            'L’application aide à l’autocontrôle ; elle ne remplace pas la responsabilité de l’exploitant.',
          ], fontSize: 7.3, color: '#333333' },
        ] },
        { width: 230, stack: [
          { text: 'Seuils appliqués et sources', fontSize: 9, bold: true, margin: [0, 0, 0, 2] },
          { table: { widths: ['*', 'auto'], body: d.thresholds.map((t) => [{ text: [{ text: t.label, bold: true }, { text: ` · ${t.source}`, color: C.grey }], fontSize: 7 }, { text: t.value, fontSize: 7.3, bold: true }]) },
            layout: { hLineWidth: () => 0.3, vLineWidth: () => 0, hLineColor: () => '#CCCCCC', paddingTop: () => 1.5, paddingBottom: () => 1.5 } },
        ] },
      ], columnGap: 14, margin: [0, 12, 0, 0], unbreakable: true },
      { columns: [
        { text: 'Visa du responsable', fontSize: 9, bold: true, width: 110, margin: [0, 10, 0, 0] },
        { table: { widths: ['*', 90, '*'], body: [[{ text: 'Nom', fontSize: 7, color: C.grey, margin: [0, 0, 0, 14] }, { text: 'Date', fontSize: 7, color: C.grey }, { text: 'Signature', fontSize: 7, color: C.grey }]] },
          layout: { hLineWidth: (i: number) => (i === 1 ? 0.8 : 0), vLineWidth: () => 0 } },
      ], margin: [0, 8, 0, 0], unbreakable: true },
    ],
    defaultStyle: { fontSize: 9, lineHeight: 1.1 },
  };
}
