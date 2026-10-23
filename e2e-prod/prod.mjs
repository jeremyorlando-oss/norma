// Test de bout en bout de l'app de PRODUCTION contre une base locale qui imite Supabase (setup-db.sh + PostgREST + gateway.mjs).
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const ctx = await b.newContext({ viewport: { width: 820, height: 1180 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const fails = []; p.on('response', (r) => { if (r.url().includes('/rest/v1/') && r.status() >= 400) r.text().then((t) => fails.push(r.status() + ' ' + r.url().split('/rpc/')[1] + ' ' + t.slice(0, 160))); });
const out = process.argv[2] ?? '/tmp';
const shot = (n) => p.screenshot({ path: `${out}/prod-${n}.png` });
const log = (...a) => console.log(...a);
const type = async (c) => { for (const k of c) await p.getByRole('button', { name: k, exact: true }).click(); };
const login = async (email) => {
  await p.getByLabel('E-mail').fill(email); await p.getByLabel('Mot de passe').fill('test1234');
  await p.getByRole('button', { name: 'Se connecter' }).click(); await p.waitForTimeout(800);
};

await p.goto('http://localhost:8767/'); await p.waitForTimeout(500);
await shot('1-connexion');
await p.getByLabel('E-mail').fill('tablette@test.ch'); await p.getByLabel('Mot de passe').fill('faux');
await p.getByRole('button', { name: 'Se connecter' }).click(); await p.waitForTimeout(500);
log('mauvais mot de passe:', await p.getByRole('alert').innerText());
await login('tablette@test.ch');
log('tablette → écran du code:', await p.getByText('Tapez votre code').count() === 1);
await shot('2-code');

// Esteban : code, notice, prise de poste, formation
await type('0000'); await p.waitForTimeout(400);
log('code faux:', await p.getByRole('alert').first().innerText());
await type('4827'); await p.waitForTimeout(800);
log('notice:', await p.locator('.h1').innerText());
await p.getByRole('button', { name: 'J’ai lu et compris' }).click(); await p.waitForTimeout(500);
for (const g of await p.getByRole('radiogroup').all()) await g.getByRole('radio', { name: 'Oui' }).click();
await p.getByRole('button', { name: 'Commencer mon service' }).click(); await p.waitForTimeout(600);
await p.getByRole('button', { name: /passer au quiz/ }).click();
const bad = [1, 0, 1, 1, 1]; let gs = await p.getByRole('radiogroup').all();
for (let i = 0; i < gs.length; i++) await gs[i].getByRole('radio').nth(bad[i]).click();
await p.getByRole('button', { name: /signer l’attestation/ }).click(); await p.waitForTimeout(600);
log('quiz 4/5 refusé:', await p.getByRole('alert').innerText());
await p.getByRole('button', { name: /passer au quiz/ }).click();
const good = [1, 0, 1, 1, 0]; gs = await p.getByRole('radiogroup').all();
for (let i = 0; i < gs.length; i++) await gs[i].getByRole('radio').nth(good[i]).click();
await p.getByRole('button', { name: /signer l’attestation/ }).click(); await p.waitForTimeout(800);
log('accueil session:', await p.locator('.h1').innerText(), '· tuiles:', (await p.locator('.tile .t').allInnerTexts()).length);
await shot('3-accueil');

// Checklist d'ouverture (1 point à NON)
await p.getByRole('button', { name: /^Checklists/ }).click(); await p.waitForTimeout(500);
await p.getByRole('radio', { name: /Ouverture/ }).click(); await p.waitForTimeout(200);
const sws = await p.getByRole('switch').all(); for (let i = 0; i < sws.length - 1; i++) await sws[i].click();
await p.getByRole('button', { name: 'Valider la checklist' }).click(); await p.waitForTimeout(600);
log('checklist:', await p.locator('.badge').innerText()); await p.waitForTimeout(1700);

// Relevé hors seuil + action corrective
await p.getByRole('button', { name: /Températures/ }).click(); await p.waitForTimeout(600);
const w = p.getByRole('slider', { name: 'Température' });
for (let i = 0; i < 25; i++) await w.press('ArrowUp');
log('relevé:', await p.locator('.badge').innerText());
await p.getByRole('button', { name: /action corrective/ }).click();
await p.getByLabel('Produits isolés').check(); await p.getByRole('button', { name: /ouvrir la NC/ }).click();
await p.waitForTimeout(1500);

// Nettoyage
await p.getByRole('button', { name: /Nettoyage/ }).click(); await p.waitForTimeout(600);
await p.getByRole('button', { name: 'Valider : Sol' }).click(); await p.waitForTimeout(600);
log('nettoyage fait:', await p.getByText('Fait').count() > 0); await shot('4-nettoyage');
await p.getByRole('button', { name: '‹ Retour' }).click(); await p.waitForTimeout(300);

// Huile (soir : composés polaires)
await p.getByRole('button', { name: /^Huile/ }).click(); await p.waitForTimeout(500);
await p.getByRole('radio', { name: 'Matin' }).click();
await p.getByRole('button', { name: 'Enregistrer' }).click(); await p.waitForTimeout(600);
log('huile:', await p.locator('.badge').innerText()); await p.waitForTimeout(1700);

// Préparation → lot + étiquette
await p.getByRole('button', { name: /Préparations/ }).click(); await p.waitForTimeout(600);
await p.getByRole('button', { name: '+ Nouvelle préparation' }).click();
await p.getByRole('button', { name: /Sauce jalapeños/ }).click(); await p.waitForTimeout(800);
log('étiquette lot:', await p.locator('.print-label b').nth(1).innerText());
await shot('5-etiquette');
await p.getByRole('button', { name: 'Fermer la session' }).click(); await p.waitForTimeout(400);

// Session suivante : pause puis reprise
await type('4827'); await p.waitForTimeout(800);
await p.getByRole('button', { name: 'Commencer une pause' }).click(); await p.waitForTimeout(500);
log('pause:', await p.locator('.h1').innerText());
await p.getByRole('button', { name: 'Reprendre le travail' }).click(); await p.waitForTimeout(500);
// Signalement d'une coupure de courant
await p.getByRole('button', { name: /Signaler/ }).click(); await p.waitForTimeout(300);
await p.getByRole('radio', { name: 'Coupure de courant' }).click();
await p.getByLabel('Que s’est-il passé ?').fill('Plus de courant');
await p.getByRole('button', { name: 'Envoyer le signalement' }).click(); await p.waitForTimeout(600);
await p.getByRole('button', { name: 'Terminé' }).click(); await p.waitForTimeout(800);
log('minuteur coupure:', await p.getByRole('alert').filter({ hasText: 'Coupure' }).count() === 1);
await p.getByRole('button', { name: 'Courant rétabli' }).click(); await p.waitForTimeout(500);
await p.getByRole('button', { name: 'Fermer la session' }).click(); await p.waitForTimeout(1500);
log('alertes tablette:', (await p.getByText(/^Relevé après coupure|^Checklist|^Nettoyage/).allInnerTexts()).join(' | '));
await shot('6-alertes');

// Lucía (espagnol)
await type('6142'); await p.waitForTimeout(800);
log('notice ES:', await p.locator('.h1').innerText());

// iPhone du Gérant
await ctx.clearCookies(); await p.evaluate(() => localStorage.clear()); await p.goto('http://localhost:8767/'); await p.waitForTimeout(600);
await login('orlando@test.ch'); await p.waitForTimeout(600);
log('iPhone Gérant → Direction:', await p.locator('.h1').innerText());
await shot('7-direction');
log('incidents ouverts (tuile):', await p.locator('.group', { hasText: 'Incidents ouverts' }).last().locator('div').first().innerText());
await p.getByRole('radio', { name: 'Incidents', exact: true }).click(); await p.waitForTimeout(600);
log('incidents:', (await p.locator('.group .main').allInnerTexts()).slice(0, 4).join(' | '));
await p.getByRole('radio', { name: 'Équipe', exact: true }).click(); await p.waitForTimeout(800);
log('équipe:', (await p.locator('.group .main').allInnerTexts()).slice(0, 6).join(' | '));
await p.getByRole('radio', { name: 'Plus', exact: true }).click(); await p.waitForTimeout(600);
await p.getByRole('button', { name: '+ Nouvel événement' }).click();
const t = new Date(); const ymd = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
await p.getByLabel('Nom', { exact: true }).fill('Festival test'); await p.getByLabel('Lieu').fill('Lausanne');
await p.getByLabel('Début').fill(ymd(t)); await p.getByLabel('Fin').fill(ymd(new Date(t.getTime() + 86400000)));
await p.getByRole('button', { name: 'Enregistrer l’événement' }).click(); await p.waitForTimeout(800);
log('événements:', (await p.locator('.group').first().locator('.main').allInnerTexts()).join(' | '));
const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /Rapport du jour/ }).click()]);
await dl.saveAs(`${out}/prod-rapport.pdf`); log('rapport PDF:', dl.suggestedFilename());
await p.getByRole('button', { name: /^Réglages/ }).click(); await p.waitForTimeout(600);
log('réglages matériel:', (await p.locator('.group .main').allInnerTexts()).join(', '));
await p.getByRole('button', { name: '‹ Plus' }).click(); await p.waitForTimeout(300);
await p.getByRole('button', { name: /^Mode inspecteur/ }).click(); await p.waitForTimeout(1000);
log('inspecteur:', await p.locator('.h1').innerText(), '·', (await p.locator('.section-label').allInnerTexts()).slice(0, 3).join(', '));
await shot('8-inspecteur');
await p.getByRole('button', { name: 'Terminer le contrôle' }).click(); await p.waitForTimeout(800);
log('retour Direction:', await p.locator('.h1').innerText());
log('erreurs serveur:', fails.length ? fails : 'aucune');
log('erreurs JS:', errs.length ? errs : 'aucune');
await b.close();
