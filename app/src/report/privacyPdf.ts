import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { CONTROLLER, PRIVACY_VERSION, privacyNotice } from '../domain/privacy';

/** Notice imprimable pour le classeur : français, espagnol, anglais (une page chacun). */
export function buildPrivacyPdf(acks: { name: string; at: string }[]): TDocumentDefinitions {
  const content: Content[] = [];
  (['fr', 'es', 'en'] as const).forEach((l, i) => {
    const n = privacyNotice(l, CONTROLLER);
    content.push({ text: n.title, fontSize: 18, bold: true, pageBreak: i ? 'before' : undefined }, { text: n.intro, margin: [0, 6, 0, 8] });
    for (const s of n.sections) {
      content.push({ text: s.title, bold: true, fontSize: 12, margin: [0, 8, 0, 4] });
      if (s.text) content.push({ text: s.text });
      if (s.rows) content.push({ table: { widths: ['*', '*', 110], headerRows: 1, body: [n.cols.map((c) => ({ text: c, bold: true })), ...s.rows] }, layout: 'lightHorizontalLines', fontSize: 9 });
    }
  });
  content.push({ text: 'Lecture confirmée dans NORMA', bold: true, fontSize: 12, pageBreak: 'before', margin: [0, 0, 0, 6] },
    acks.length ? { table: { widths: ['*', 160], body: [[{ text: 'Personne', bold: true }, { text: 'Date et heure', bold: true }], ...acks.map((a) => [a.name, a.at])] }, layout: 'lightHorizontalLines' }
      : { text: 'Aucune confirmation pour l’instant.' });
  return { content, defaultStyle: { fontSize: 10 }, pageMargins: [40, 40, 40, 40],
    footer: (p, c) => ({ text: `NORMA · notice LPD version ${PRIVACY_VERSION} · ${p}/${c}`, fontSize: 8, alignment: 'center', color: '#555' }) };
}
