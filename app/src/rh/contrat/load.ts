// Prépare pdfmake dans le navigateur avec la police Carlito et le filigrane (chargés seulement quand on génère un document RH).
import regular from './Carlito-Regular.ttf?url';
import bold from './Carlito-Bold.ttf?url';
import italic from './Carlito-Italic.ttf?url';
import boldItalic from './Carlito-BoldItalic.ttf?url';
import watermarkUrl from './watermark.png?url';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

const b64 = async (url: string) => {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
};
let ready: Promise<{ pdfMake: { createPdf: (d: TDocumentDefinitions) => { getBlob: (cb: (b: Blob) => void) => void; download: (n: string) => void } }; watermark: string }> | null = null;

export function rhPdf() {
  ready ??= (async () => {
    const pdfMake = (await import('pdfmake/build/pdfmake')).default as unknown as Record<string, unknown>;
    const [r, b, i, bi, w] = await Promise.all([b64(regular), b64(bold), b64(italic), b64(boldItalic), b64(watermarkUrl)]);
    pdfMake.vfs = { 'Carlito-Regular.ttf': r, 'Carlito-Bold.ttf': b, 'Carlito-Italic.ttf': i, 'Carlito-BoldItalic.ttf': bi };
    pdfMake.fonts = { Carlito: { normal: 'Carlito-Regular.ttf', bold: 'Carlito-Bold.ttf', italics: 'Carlito-Italic.ttf', bolditalics: 'Carlito-BoldItalic.ttf' } };
    return { pdfMake: pdfMake as never, watermark: 'data:image/png;base64,' + w };
  })();
  return ready;
}

export async function pdfBlob(build: (watermark: string) => TDocumentDefinitions) {
  const { pdfMake, watermark } = await rhPdf();
  return new Promise<Blob>((ok) => pdfMake.createPdf(build(watermark)).getBlob(ok));
}
