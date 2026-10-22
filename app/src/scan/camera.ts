// Caméra : photo prise par l'appareil (champ fichier « capture »), fonctionne sur iPad, iPhone et Android.
import type { LabelFields } from './parseLabel';
import { parseLabel } from './parseLabel';

/** Lit un code-barres (EAN, Code 128, QR…) sur une photo. null si illisible. */
export async function readBarcode(file: Blob): Promise<string | null> {
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const url = URL.createObjectURL(file);
  try { return (await new BrowserMultiFormatReader().decodeFromImageUrl(url)).getText(); }
  catch { return null; }
  finally { URL.revokeObjectURL(url); }
}

/** Lecture de texte gratuite sur l'appareil (Tesseract, français + allemand). Nécessite internet au premier usage (modèles). */
export async function readLabel(file: Blob, suppliers: string[]): Promise<LabelFields & { text: string }> {
  const { createWorker } = await import('tesseract.js');
  const paths = (window as unknown as { __NORMA_OCR?: Record<string, string> }).__NORMA_OCR ?? {};
  const worker = await createWorker(['fra', 'deu'], 1, paths);
  try {
    const { data } = await worker.recognize(file);
    return { ...parseLabel(data.text, suppliers), text: data.text };
  } finally { await worker.terminate(); }
}

/** Réduit une photo (bon de livraison) pour l'archivage : JPEG ~1600 px. */
export async function compressPhoto(file: Blob, max = 1600): Promise<string> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.75);
}
