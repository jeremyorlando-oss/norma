// Contrats et fiches de salaire (V1.2) : types, libellés, empreinte des fichiers, attestation de signature (PDF).
export type HrKind = 'contrat' | 'avenant' | 'fiche_salaire' | 'certificat_salaire' | 'attestation' | 'autre';
export const HR_KINDS: HrKind[] = ['contrat', 'avenant', 'fiche_salaire', 'certificat_salaire', 'attestation', 'autre'];
export const HR_LABEL: Record<HrKind, string> = { contrat: 'Contrat de travail', avenant: 'Avenant au contrat', fiche_salaire: 'Fiche de salaire',
  certificat_salaire: 'Certificat de salaire (annuel)', attestation: 'Attestation', autre: 'Autre document' };
export const signable = (k: HrKind) => k === 'contrat' || k === 'avenant';

export interface HrDoc { id: string; memberId: string; kind: HrKind; title: string; period: string | null; path: string; sha256: string;
  requiresSignature: boolean; uploadedAt: string; seenAt: string | null; signedAt: string | null; signedName: string | null;
  signaturePath: string | null; signedDevice: string | null }

export async function sha256Hex(data: Blob | ArrayBuffer) {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data;
  const h = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Titre proposé : « Salaire octobre 2026 », « Certificat de salaire 2026 »… */
export function defaultTitle(kind: HrKind, month: string) {
  if (kind === 'fiche_salaire' && month) {
    const [y, m] = month.split('-').map(Number);
    return 'Salaire ' + new Date(y, m - 1, 1).toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' });
  }
  if (kind === 'certificat_salaire' && month) return 'Certificat de salaire ' + month.slice(0, 4);
  return HR_LABEL[kind];
}

const dt = (s: string | null) => (s ? new Date(s).toLocaleString('fr-CH', { dateStyle: 'long', timeStyle: 'medium' }) : '—');

/** Attestation de signature électronique simple (à joindre au contrat dans le dossier du personnel). */
export async function signatureCertificate(d: HrDoc, who: string, company: string, signatureDataUrl: string | null) {
  const pdfMake = (await import('pdfmake/build/pdfmake')).default;
  const vfsSource = (await import('pdfmake/build/vfs_fonts.js?raw')).default;
  const holder: { pdfMake?: { vfs?: Record<string, string> } } = {};
  new Function(vfsSource).call(holder);
  (pdfMake as unknown as { vfs: unknown }).vfs = holder.pdfMake?.vfs;
  const row = (a: string, b: string) => [{ text: a, bold: true }, b];
  pdfMake.createPdf({
    info: { title: `Attestation de signature · ${d.title}` },
    content: [
      { text: 'Attestation de signature électronique', fontSize: 18, bold: true, margin: [0, 0, 0, 4] },
      { text: `${company} · généré par NORMA`, color: '#555', margin: [0, 0, 0, 16] },
      { table: { widths: [150, '*'], body: [
        row('Document', d.title), row('Type', HR_LABEL[d.kind]), row('Signataire', `${d.signedName ?? ''} (${who})`),
        row('Déposé le', dt(d.uploadedAt)), row('Ouvert le', dt(d.seenAt)), row('Signé le', dt(d.signedAt)),
        row('Appareil', d.signedDevice ?? '—'), row('Empreinte SHA-256 du fichier signé', { text: d.sha256, fontSize: 8 } as unknown as string),
      ] }, layout: 'lightHorizontalLines' },
      ...(signatureDataUrl ? [{ text: 'Signature tracée', bold: true, margin: [0, 16, 0, 4] }, { image: signatureDataUrl, width: 220 }] : []),
      { text: 'Signature électronique simple : la personne a ouvert le document, confirmé l’avoir lu et accepté, écrit son nom et tracé sa signature dans son espace NORMA. '
        + 'L’empreinte SHA-256 permet de vérifier que le fichier conservé est exactement celui qui a été signé. '
        + 'Elle ne remplace pas la forme écrite exigée par la loi pour certaines clauses (CO 14 al. 2bis : signature manuscrite ou électronique qualifiée).',
        fontSize: 9, color: '#555', margin: [0, 16, 0, 0] },
    ],
    defaultStyle: { fontSize: 10 },
  } as never).download(`NORMA-signature-${d.title.replace(/[^\w-]+/g, '_')}.pdf`);
}
