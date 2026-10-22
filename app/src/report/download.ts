// Génère le PDF dans le navigateur et le propose au téléchargement / à l'impression.
import pdfMake from 'pdfmake/build/pdfmake';
import vfsSource from 'pdfmake/build/vfs_fonts.js?raw';
import { buildDailyReport, verificationCode, type DayReport } from './dailyReport';

// vfs_fonts.js écrit dans « this.pdfMake » : on l'exécute avec un objet porteur (compatible modules ES).
const holder: { pdfMake?: { vfs?: Record<string, string> } } = {};
new Function(vfsSource).call(holder);
(pdfMake as unknown as { vfs: unknown }).vfs = holder.pdfMake?.vfs;

export async function downloadDailyReport(data: DayReport) {
  const code = await verificationCode(data);
  pdfMake.createPdf(buildDailyReport(data, code)).download(`NORMA-rapport-${data.date.toISOString().slice(0, 10)}.pdf`);
}
