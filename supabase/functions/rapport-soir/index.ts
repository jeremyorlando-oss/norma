// Fonction serveur « rapport-soir » : chaque matin, le rapport HACCP de la veille part en PDF au Gérant et aux Managers (D31).
// Appelée toutes les heures par pg_cron ; la base décide s'il est l'heure et si le rapport n'est pas déjà parti.
// Envoi par Brevo (secrets à créer dans Supabase : BREVO_API_KEY et NORMA_EXPEDITEUR = adresse vérifiée chez Brevo).
import pdfMake from 'npm:pdfmake@0.2.10/build/pdfmake.js';
import vfsFonts from 'npm:pdfmake@0.2.10/build/vfs_fonts.js';
import { buildDailyReport, reportSummary, verdictText, verificationCode, type DayReport } from '../../../app/src/report/dailyReport.ts';
import { admin, cronAutorise, json } from '../_commun/serveur.ts';

// deno-lint-ignore no-explicit-any
const pm = pdfMake as any;
// deno-lint-ignore no-explicit-any
const fonts = vfsFonts as any;
pm.vfs = fonts.pdfMake?.vfs ?? fonts.vfs ?? fonts;

const day = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const dmy = (s: string) => s.slice(0, 10).split('-').reverse().join('.');
const pdfBase64 = (doc: unknown) => new Promise<string>((ok) => pm.createPdf(doc).getBase64((b: string) => ok(b)));

async function envoyer(to: string[], sujet: string, html: string, fichier: string, contenu: string) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': Deno.env.get('BREVO_API_KEY') ?? '', 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { name: 'NORMA', email: Deno.env.get('NORMA_EXPEDITEUR') }, to: to.map((email) => ({ email })),
      subject: sujet, htmlContent: html, attachment: [{ name: fichier, content: contenu }] }),
  });
  if (!r.ok) throw new Error(`Brevo ${r.status} : ${await r.text()}`);
}

Deno.serve(async (req) => {
  const sb = admin();
  if (!(await cronAutorise(req, sb))) return json({ error: 'Non autorisé' }, 401);
  const db = sb.schema('norma');
  const { data: list, error } = await db.rpc('rapports_a_envoyer', { p_now: new Date().toISOString() });
  if (error) return json({ error: error.message }, 500);
  const done: string[] = [];
  for (const r of list as { companyId: string; entreprise: string; day: string; to: string[]; report: Record<string, unknown> }[]) {
    const data = { ...r.report, date: day(r.report.date as string), generatedAt: new Date(r.report.generatedAt as string) } as DayReport;
    if (r.to.length) {
      const code = await verificationCode(data);
      const pdf = await pdfBase64(buildDailyReport(data, code));
      const html = `<p>Bonjour,</p><p>Voici le rapport HACCP du <b>${dmy(r.day)}</b>${data.event ? ` (${data.event})` : ''} de ${r.entreprise}.</p>`
        + `<p><b>${verdictText(data)}</b> · score ${reportSummary(data).score}/100</p>`
        + `<p>À imprimer et à ranger dans le classeur du stand.</p><p style="color:#777">Code de vérification : ${code}<br>Message automatique de NORMA.</p>`;
      await envoyer(r.to, `Rapport HACCP du ${dmy(r.day)} · ${r.entreprise}`, html, `NORMA-rapport-${r.day.slice(0, 10)}.pdf`, pdf);
    }
    await db.rpc('rapport_envoye', { p_company: r.companyId, p_day: r.day, p_n: r.to.length });
    done.push(`${r.entreprise} ${r.day}`);
  }
  return json({ envoyes: done });
});
