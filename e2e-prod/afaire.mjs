// E2E « à faire » : pastilles et carte rouge (employé), pastille Plus (Gérant). Base : setup-db.sh, rh.mjs, puis un événement et un avenant de test.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell' });
const errs = [];
const phone = async (email) => {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8767/?onglet=documents'); await p.waitForTimeout(800);
  await p.getByLabel('E-mail').fill(email); await p.getByLabel('Mot de passe').fill('test1234');
  await p.getByRole('button', { name: 'Se connecter' }).click(); await p.waitForTimeout(2500);
  return p;
};
const e = await phone('esteban@test.ch');
await e.getByRole('radio', { name: /Planning/ }).click(); await e.waitForTimeout(300);
console.log('onglets Esteban :', (await e.getByRole('radio').evaluateAll((l) => l.map((x) => x.getAttribute('aria-label') ?? x.textContent))).join(' | '));
console.log('carte :', (await e.locator('.todo-card').innerText()).replace(/\n/g, ' / '));
await e.screenshot({ path: '/tmp/shots/afaire-esteban.png' });
await e.getByRole('radio', { name: /Planning/ }).click(); await e.waitForTimeout(1500);
console.log('après planning :', (await e.getByRole('radio').evaluateAll((l) => l.map((x) => x.getAttribute('aria-label') ?? x.textContent))).join(' | '));
await e.getByRole('radio', { name: /Profil/ }).click(); await e.waitForTimeout(1200);
await e.screenshot({ path: '/tmp/shots/afaire-profil.png', fullPage: true });
const g = await phone('orlando@test.ch');
console.log('onglets Gérant :', (await g.getByRole('radio').evaluateAll((l) => l.map((x) => x.getAttribute('aria-label') ?? x.textContent))).join(' | '));
await g.screenshot({ path: '/tmp/shots/afaire-gerant.png' });
console.log('erreurs JS :', errs.join(' ; ') || 'aucune');
await b.close();
