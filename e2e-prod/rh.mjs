// E2E contrats et salaires : le Gérant dépose un contrat et une fiche de salaire, Esteban signe sur son téléphone.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const out = process.argv[2] ?? '/tmp';
const log = (...a) => console.log(...a);
const errs = [];
const pdf = (t) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n% ${t}\ntrailer<</Root 1 0 R>>\n%%EOF`);
const phone = async (email) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { window.open = (u) => { window.__opened = u; return null; }; window.confirm = () => true; });
  await p.goto('http://localhost:8767/'); await p.waitForTimeout(800);
  await p.getByLabel('E-mail').fill(email); await p.getByLabel('Mot de passe').fill('test1234');
  await p.getByRole('button', { name: 'Se connecter' }).click(); await p.waitForTimeout(2000);
  return p;
};
const g = await phone('orlando@test.ch');
const openEsteban = async () => {
  await g.getByRole('radio', { name: 'Équipe', exact: true }).click(); await g.waitForTimeout(800);
  await g.getByRole('button', { name: /^Esteban/ }).first().click(); await g.waitForTimeout(1200);
};
await openEsteban();
await g.getByLabel('Type').first().selectOption('contrat');
await g.getByLabel('Titre').fill('Contrat saison 2027');
await g.locator('input[type=file][accept="application/pdf"]').setInputFiles({ name: 'contrat.pdf', mimeType: 'application/pdf', buffer: pdf('contrat') });
await g.getByRole('button', { name: 'Envoyer à Esteban' }).click(); await g.waitForTimeout(1500);
await g.getByLabel('Type').first().selectOption('fiche_salaire');
await g.locator('input[type=file][accept="application/pdf"]').setInputFiles({ name: 'oct.pdf', mimeType: 'application/pdf', buffer: pdf('octobre') });
await g.getByRole('button', { name: 'Envoyer à Esteban' }).click(); await g.waitForTimeout(1500);
log('côté Gérant :', (await g.locator('button.link', { hasText: /Contrat saison|Salaire/ }).allInnerTexts()).join(' | '));
await g.screenshot({ path: `${out}/rh-1-gerant.png`, fullPage: true });

const e = await phone('esteban@test.ch');
log('accueil Esteban :', await e.getByRole('button', { name: /signer :/i }).innerText());
await e.getByRole('button', { name: /signer :/i }).click(); await e.waitForTimeout(1000);
log('signer avant lecture :', await e.getByRole('button', { name: '2. Signer' }).isDisabled() ? 'bloqué' : 'possible');
await e.getByRole('button', { name: '1. Ouvrir et lire le document' }).click(); await e.waitForTimeout(1200);
await e.getByRole('button', { name: '2. Signer' }).click(); await e.waitForTimeout(500);
await e.getByRole('checkbox').first().check();
const box = await e.getByLabel('Zone de signature').boundingBox();
await e.mouse.move(box.x + 30, box.y + 120); await e.mouse.down();
for (let i = 0; i < 20; i++) await e.mouse.move(box.x + 30 + i * 12, box.y + 120 - Math.sin(i / 2) * 40);
await e.mouse.up();
await e.screenshot({ path: `${out}/rh-2-signature.png`, fullPage: true });
await e.getByRole('button', { name: 'Signer le document' }).click(); await e.waitForTimeout(2000);
log('après signature :', (await e.locator('.group').first().innerText()).replace(/\n/g, ' · '));
await e.screenshot({ path: `${out}/rh-3-signe.png`, fullPage: true });

await g.reload(); await g.waitForTimeout(1500); await openEsteban();
log('Gérant voit :', await g.locator('button.link', { hasText: 'Contrat saison 2027' }).innerText());
const [dl] = await Promise.all([g.waitForEvent('download'), g.getByRole('button', { name: 'Attestation' }).click()]);
await dl.saveAs(`${out}/rh-attestation.pdf`); log('attestation :', dl.suggestedFilename());
log('erreurs JS :', errs.length ? errs : 'aucune');
await b.close();
