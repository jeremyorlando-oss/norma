// E2E mode hors ligne : la tablette perd le réseau, les saisies continuent, puis partent avec l'heure réelle au retour du réseau.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
const sql = (q) => execFileSync('su', ['postgres', '-c', `psql -t -A -d normae2e -c "${q}"`]).toString().trim();
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const ctx = await b.newContext({ viewport: { width: 820, height: 1180 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const out = process.argv[2] ?? '/tmp';
const log = (...a) => console.log(...a);
const type = async (c) => { for (const k of c) await p.getByRole('button', { name: k, exact: true }).click(); };

await p.goto('http://localhost:8767/'); await p.waitForTimeout(800);
await p.getByLabel('E-mail').fill('tablette@test.ch'); await p.getByLabel('Mot de passe').fill('test1234');
await p.getByRole('button', { name: 'Se connecter' }).click(); await p.waitForTimeout(1500);
// 1re connexion en ligne d'Esteban : la tablette retient son code (empreinte) et les données du stand
await type('4827'); await p.waitForTimeout(1000);
await p.getByRole('button', { name: 'J’ai lu et compris' }).click(); await p.waitForTimeout(500);
for (const g of await p.getByRole('radiogroup').all()) await g.getByRole('radio', { name: 'Oui' }).click();
await p.getByRole('button', { name: 'Commencer mon service' }).click(); await p.waitForTimeout(600);
await p.getByRole('button', { name: /passer au quiz/ }).click();
const good = [1, 0, 1, 1, 0]; const gs = await p.getByRole('radiogroup').all();
for (let i = 0; i < gs.length; i++) await gs[i].getByRole('radio').nth(good[i]).click();
await p.getByRole('button', { name: /signer l’attestation/ }).click(); await p.waitForTimeout(800);
await p.getByRole('button', { name: /Nettoyage/ }).click(); await p.waitForTimeout(700);
await p.getByRole('button', { name: '‹ Retour' }).click(); await p.waitForTimeout(300);
await p.getByRole('button', { name: /Températures/ }).click(); await p.waitForTimeout(700);
await p.getByRole('button', { name: /Retour/ }).first().click(); await p.waitForTimeout(300);
await p.getByRole('button', { name: 'Fermer la session' }).click(); await p.waitForTimeout(800);
log('SW actif :', await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active));

// ——— coupure réseau
await ctx.setOffline(true);
const t0 = new Date();
await type('4827'); await p.waitForTimeout(1200);
log('session hors ligne :', await p.locator('.h1').innerText(), '·', (await p.getByRole('status').first().innerText()).replace(/\n/g, ' · '));
await p.getByRole('button', { name: /Nettoyage/ }).click(); await p.waitForTimeout(700);
await p.getByRole('button', { name: 'Valider : Sol' }).click(); await p.waitForTimeout(700);
await p.getByRole('button', { name: '‹ Retour' }).click(); await p.waitForTimeout(300);
await p.getByRole('button', { name: /Signaler/ }).click(); await p.waitForTimeout(300);
await p.getByRole('radio', { name: 'Coupure de courant' }).click();
await p.getByLabel('Que s’est-il passé ?').fill('Plus de courant ni de wifi');
await p.getByRole('button', { name: 'Envoyer le signalement' }).click(); await p.waitForTimeout(600);
await p.getByRole('button', { name: 'Terminé' }).click(); await p.waitForTimeout(800);
log('minuteur coupure hors ligne :', await p.getByRole('alert').filter({ hasText: 'Coupure' }).count() === 1);
log('en attente :', (await p.getByRole('status').first().innerText()).replace(/\n/g, ' · '));
await p.screenshot({ path: `${out}/offline-1-session.png` });
await p.getByRole('button', { name: 'Fermer la session' }).click(); await p.waitForTimeout(500);
// rechargement sans réseau : l'app s'ouvre quand même
await p.reload(); await p.waitForTimeout(2500);
log('rechargement hors ligne :', await p.getByText('Tapez votre code').count() === 1 ? 'écran du code' : (await p.locator('body').innerText()).slice(0, 80));
await type('9999'); await p.waitForTimeout(600);
log('code inconnu hors ligne :', await p.getByRole('alert').first().innerText());
log('rien envoyé pendant la coupure :', sql("select count(*) from norma.sync_receipt"));
await p.screenshot({ path: `${out}/offline-2-reload.png` });

// ——— retour du réseau
await ctx.setOffline(false);
await p.evaluate(() => window.dispatchEvent(new Event('online')));
await p.waitForTimeout(4000);
log('après retour réseau :', sql("select string_agg(fn, ', ' order by client_at) from norma.sync_receipt"));
const at = sql("select to_char(at at time zone 'Europe/Zurich', 'HH24:MI:SS') from norma.cleaning_done d join norma.member m on m.id = d.member_id where m.first_name = 'Esteban' order by at desc limit 1");
log('nettoyage enregistré à', at, '(saisi à', t0.toLocaleTimeString('fr-CH'), ')');
log('coupure côté serveur :', sql("select count(*) from norma.outage"), '· bannière :', await p.getByRole('status').count() === 0 ? 'disparue' : await p.getByRole('status').first().innerText());
await p.screenshot({ path: `${out}/offline-3-sync.png` });
log('erreurs JS :', errs.length ? errs : 'aucune');
await b.close();
