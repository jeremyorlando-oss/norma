// Lance les 3 fonctions serveur (fichiers à coller dans Supabase) avec Deno, branchées sur la passerelle de test.
// Brevo est remplacé par un faux service : chaque e-mail est écrit dans /tmp/norma-mails/.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const DENO = process.env.DENO ?? 'deno';
const SECRET = 'norma-e2e-secret-norma-e2e-secret-0123456789';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 86400 });
const key = `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../supabase/fonctions-a-coller');
fs.mkdirSync('/tmp/norma-mails', { recursive: true });
const wrapper = path.join('/tmp', 'norma-fn-wrapper.ts');
fs.writeFileSync(wrapper, `
const real = globalThis.fetch;
globalThis.fetch = async (u, init) => {
  if (String(u).startsWith('https://api.brevo.com/')) { await Deno.writeTextFile('/tmp/norma-mails/' + Date.now() + '.json', init.body); return new Response('{"messageId":"test"}', { status: 201 }); }
  return real(u, init);
};
const serve = Deno.serve;
Deno.serve = (handler) => serve({ port: Number(Deno.env.get('PORT')), onListen: () => console.log('fonction prête', Deno.env.get('PORT')) }, handler);
await import(Deno.env.get('FN'));
`);
for (const [name, port] of [['invitation', 8768], ['rapport-soir', 8769], ['notifications', 8770]]) {
  spawn(DENO, ['run', '-A', wrapper], { stdio: 'inherit', env: { ...process.env, PORT: String(port), FN: path.join(dir, `${name}.ts`),
    SUPABASE_URL: 'http://127.0.0.1:8767', SUPABASE_SERVICE_ROLE_KEY: key, BREVO_API_KEY: 'test', NORMA_EXPEDITEUR: 'info@originalscompletos.ch' } });
}
