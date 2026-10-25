// E2E espace Employé : invitation WhatsApp par le Gérant → création de l'accès → planning, heures, documents → vue Direction.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const out = process.argv[2] ?? '/tmp';
const log = (...a) => console.log(...a);
const errs = [];
const phone = async () => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { window.open = (u) => { window.__opened = u; return null; }; window.confirm = () => true; });
  return p;
};
// Gérant
const g = await phone();
await g.goto('http://localhost:8767/'); await g.getByLabel('E-mail').fill('orlando@test.ch'); await g.getByLabel('Mot de passe').fill('test1234');
await g.getByRole('button', { name: 'Se connecter' }).click(); await g.waitForTimeout(1200);
await g.getByRole('radio', { name: 'Équipe', exact: true }).click(); await g.waitForTimeout(800);
await g.getByRole('button', { name: /^Lucía Aide/ }).click(); await g.waitForTimeout(500);
await g.getByRole('button', { name: /Inviter sur son téléphone/ }).click(); await g.waitForTimeout(800);
const wa = await g.evaluate(() => window.__opened);
const msg = decodeURIComponent(wa.split('text=')[1]);
log('WhatsApp :', wa.startsWith('https://wa.me/?text='), '·', msg.split('\n')[0].slice(0, 60));
const link = msg.match(/http\S+/)[0];
log('statut équipe :', await g.getByRole('button', { name: /^Lucía Aide/ }).innerText());
await g.screenshot({ path: `${out}/emp-1-equipe.png` });

// Lucía ouvre le lien sur son téléphone
const e = await phone();
await e.goto(link); await e.waitForTimeout(1500);
log('page invitation :', await e.locator('.h1').innerText());
await e.screenshot({ path: `${out}/emp-2-invitation.png` });
await e.getByLabel('Correo electrónico').fill('lucia@test.ch');
await e.getByLabel('Contraseña (mínimo 10 caracteres)').fill('motdepasse123');
await e.getByLabel('Repetir la contraseña').fill('motdepasse12');
await e.getByRole('button', { name: 'Crear mi acceso' }).click(); await e.waitForTimeout(300);
log('mots de passe différents :', await e.getByRole('alert').innerText());
await e.getByLabel('Repetir la contraseña').fill('motdepasse123');
await e.getByRole('button', { name: 'Crear mi acceso' }).click(); await e.waitForTimeout(2500);
log('espace employé :', await e.locator('.h1').innerText(), '· url', new URL(e.url()).hash || '(sans lien)');
await e.screenshot({ path: `${out}/emp-3-planning.png` });
await e.getByRole('radio', { name: 'Horas' }).click(); await e.waitForTimeout(800);
log('heures :', (await e.locator('.group').first().innerText()).replace(/\n/g, ' '));
await e.getByRole('radio', { name: 'Documentos' }).click(); await e.waitForTimeout(500);
await e.getByLabel('Tipo').selectOption('avs');
await e.locator('input[type=file]').setInputFiles({ name: 'carte-avs.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
await e.waitForTimeout(1200);
log('document :', await e.getByRole('status').innerText(), '·', (await e.locator('.group').last().innerText()).replace(/\n/g, ' '));
await e.screenshot({ path: `${out}/emp-4-documents.png` });
await e.getByRole('radio', { name: 'Perfil' }).click(); await e.waitForTimeout(500);
await e.getByLabel('Idioma').selectOption('fr'); await e.waitForTimeout(1200);
log('langue → FR :', await e.locator('.h1').innerText());
await e.screenshot({ path: `${out}/emp-5-profil.png` });
// lien déjà utilisé
const e2 = await phone(); await e2.goto(link); await e2.waitForTimeout(1500);
log('lien réutilisé :', (await e2.getByRole('alert').innerText()).slice(0, 40));

// Gérant : compte actif, document visible, envois automatiques
await g.reload(); await g.waitForTimeout(1200);
await g.getByRole('radio', { name: 'Équipe', exact: true }).click(); await g.waitForTimeout(800);
log('statut après création :', (await g.getByRole('button', { name: /^Lucía Aide/ }).innerText()).replace(/\n/g, ' '));
await g.getByRole('button', { name: /^Lucía Aide/ }).click(); await g.waitForTimeout(800);
log('documents côté Gérant :', await g.getByRole('button', { name: /Carte AVS/ }).innerText());
await g.screenshot({ path: `${out}/emp-6-gerant-docs.png` });
await g.getByRole('radio', { name: 'Plus', exact: true }).click(); await g.waitForTimeout(800);
await g.getByLabel('Heure d’envoi du rapport').selectOption('7'); await g.waitForTimeout(500);
log('rapports envoyés :', (await g.locator('.group', { hasText: 'Rapport de la veille' }).innerText()).replace(/\n/g, ' | '));
await g.getByRole('button', { name: 'Activer' }).click(); await g.waitForTimeout(1500);
log('notifications (navigateur de test) :', await g.locator('.error').last().innerText() || 'activées');
await g.screenshot({ path: `${out}/emp-7-envois.png`, fullPage: true });
log('erreurs JS :', errs.length ? errs : 'aucune');
await b.close();
