import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const p = await b.newPage({ viewport: { width: 820, height: 1180 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('file://' + process.argv[2]); await p.waitForTimeout(400);
for (const [pin, oui, start, file, ack] of [['6142','Sí','Empezar mi turno','es','He leído y entendido'],['5913','Yes','Start my shift','en','I have read and understood']]) {
  for (const k of pin) await p.getByRole('button', { name: k, exact: true }).click();
  await p.waitForTimeout(300);
  await p.getByRole('button', { name: ack }).click(); await p.waitForTimeout(200);
  for (const g of await p.getByRole('radiogroup').all()) await g.getByRole('radio', { name: oui }).click();
  await p.getByRole('button', { name: start }).click(); await p.waitForTimeout(300);
  await p.screenshot({ path: `/tmp/claude-0/shots/lang-${file}-1.png` });
  const good=[1,0,1,1,0]; await p.getByRole('button',{name:/quiz|test/i}).click();
  const gs=await p.getByRole('radiogroup').all(); for (let i=0;i<gs.length;i++) await gs[i].getByRole('radio').nth(good[i]).click();
  await p.getByRole('button',{name:/certific/}).click(); await p.waitForTimeout(300);
  await p.locator('.tile').first().click(); await p.waitForTimeout(300);
  console.log(file, (await p.locator('body').innerText()).slice(0, 300).replace(/\n/g,' | '));
  await p.getByRole('button', { name: 'Fermer la session' }).click(); await p.waitForTimeout(300);
}
console.log('errors', errs); await b.close();
