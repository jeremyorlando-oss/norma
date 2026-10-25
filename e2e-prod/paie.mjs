// E2E salaires : réglages (taux par poste, AANP), contrat CDD généré, fiche de salaire calculée depuis le pointage.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
const sql = (q) => execFileSync('su', ['postgres', '-c', `psql -t -A -d normae2e -c "${q}"`]).toString().trim();
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const out = process.argv[2] ?? '/tmp';
const log = (...a) => console.log(...a);
const errs = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const g = await ctx.newPage(); g.on('pageerror', (e) => errs.push(e.message));
await g.addInitScript(() => { window.open = (u) => { window.__opened = u; return null; }; window.confirm = () => true; });
await g.goto('http://localhost:8767/'); await g.waitForTimeout(800);
await g.getByLabel('E-mail').fill('orlando@test.ch'); await g.getByLabel('Mot de passe').fill('test1234');
await g.getByRole('button', { name: 'Se connecter' }).click(); await g.waitForTimeout(2000);
// Réglages des salaires
await g.getByRole('radio', { name: 'Plus', exact: true }).click(); await g.waitForTimeout(600);
await g.getByRole('button', { name: /^Salaires/ }).click(); await g.waitForTimeout(1000);
await g.getByLabel('Chef de cuisine').fill('26');
await g.getByLabel(/Accident non professionnel/).fill('1.2');
await g.getByRole('button', { name: 'Enregistrer' }).click(); await g.waitForTimeout(800);
log('réglages :', await g.getByRole('status').innerText());
await g.screenshot({ path: `${out}/paie-1-reglages.png`, fullPage: true });
await g.getByRole('button', { name: '‹ Plus' }).click(); await g.waitForTimeout(500);
// Contrat
await g.getByRole('radio', { name: 'Équipe', exact: true }).click(); await g.waitForTimeout(800);
await g.getByRole('button', { name: /^Esteban/ }).first().click(); await g.waitForTimeout(1200);
await g.getByRole('button', { name: /Préparer le contrat/ }).click(); await g.waitForTimeout(1000);
const d = new Date(); const ymd = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
await g.getByLabel('Début').fill(ymd(new Date(d.getFullYear(), d.getMonth(), 1)));
await g.getByLabel('Fin').fill(ymd(new Date(d.getFullYear(), d.getMonth(), 28)));
log('taux repris du poste :', await g.getByLabel('CHF / heure').inputValue());
await g.getByRole('button', { name: 'Envoyer le contrat à Esteban' }).click(); await g.waitForTimeout(4000);
log('contrat :', sql("select fonction||' · '||hourly_rate||' · doc '||(hr_document_id is not null) from norma.employment_contract"), errs);
// Fiche de salaire
const month = ymd(d).slice(0, 7);
await g.getByRole('button', { name: /Établir une fiche de salaire/ }).click(); await g.waitForTimeout(500);
await g.getByLabel('Mois').first().fill(month); await g.waitForTimeout(3000);
log('aperçu :', (await g.locator('.group', { hasText: 'pointées' }).last().innerText()).replace(/\n/g, ' | ').slice(0, 400));
await g.screenshot({ path: `${out}/paie-2-apercu.png`, fullPage: true });
await g.getByRole('button', { name: 'Envoyer la fiche à Esteban' }).click(); await g.waitForTimeout(4000);
log('fiche :', sql("select hours||' h · brut '||gross||' · net '||net from norma.payslip"));
log('documents RH :', sql("select string_agg(title, ' | ') from norma.hr_document"));
log('erreurs JS :', errs.length ? errs : 'aucune');
await b.close();
