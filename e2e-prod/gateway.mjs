// Passerelle de test : imite Supabase (REST /rest/v1 → PostgREST, connexion /auth/v1, stockage /storage/v1) et sert l'app.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SECRET = 'norma-e2e-secret-norma-e2e-secret-0123456789';
const USERS = { 'tablette@test.ch': 'aaaaaaaa-0000-0000-0000-000000000001', 'orlando@test.ch': 'aaaaaaaa-0000-0000-0000-000000000002' };
const PASSWORDS = {};   // comptes créés par la fonction « invitation » (API admin)
const sql = (q) => execFileSync('su', ['postgres', '-c', `psql -q -t -d normae2e -c "${q}"`]).toString();
const FUNCTIONS = { invitation: 8768, 'rapport-soir': 8769, notifications: 8770 };   // fonctions serveur lancées avec Deno (functions.mjs)
const DIST = path.resolve(process.argv[2]);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub, email, role = 'authenticated') => {
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ sub, email, role, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
};
const body = (req) => new Promise((r) => { const c = []; req.on('data', (x) => c.push(x)); req.on('end', () => r(Buffer.concat(c))); });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (url.pathname.startsWith('/rest/v1/')) {
    const b = await body(req);
    const headers = { ...req.headers }; delete headers.host;
    const p = http.request({ host: '127.0.0.1', port: 3001, path: url.pathname.slice(8) + url.search, method: req.method, headers }, (r) => {
      res.writeHead(r.statusCode, { ...r.headers, ...cors }); r.pipe(res);
    });
    p.on('error', (e) => { res.writeHead(502, cors); res.end(String(e)); });
    return p.end(b);
  }
  if (url.pathname === '/auth/v1/token') {
    const j = JSON.parse((await body(req)).toString() || '{}');
    const id = USERS[j.email];
    if (!id || j.password !== (PASSWORDS[j.email] ?? 'test1234')) { res.writeHead(400, { 'content-type': 'application/json', ...cors });
      return res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials', code: 'invalid_credentials' })); }
    const user = { id, email: j.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    res.writeHead(200, { 'content-type': 'application/json', ...cors });
    return res.end(JSON.stringify({ access_token: jwt(id, j.email), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user }));
  }
  if (url.pathname === '/auth/v1/admin/users' && req.method === 'POST') {
    const j = JSON.parse((await body(req)).toString());
    if (USERS[j.email]) { res.writeHead(422, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ msg: 'A user with this email address has already been registered', code: 'email_exists' })); }
    const id = crypto.randomUUID(); USERS[j.email] = id; PASSWORDS[j.email] = j.password;
    sql(`insert into auth.users(id, email) values ('${id}', '${j.email.replace(/'/g, '')}')`);
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ id, email: j.email, aud: 'authenticated', role: 'authenticated' }));
  }
  if (url.pathname.startsWith('/auth/v1/admin/users/') && req.method === 'DELETE') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}'); }
  if (url.pathname.startsWith('/functions/v1/')) {
    const port = FUNCTIONS[url.pathname.slice(14)];
    const b = await body(req);
    const p = http.request({ host: '127.0.0.1', port, path: '/', method: req.method, headers: Object.fromEntries(Object.entries(req.headers).filter(([k]) => k !== 'host')) }, (r) => {
      res.writeHead(r.statusCode, { ...r.headers, ...cors }); r.pipe(res);
    });
    p.on('error', (e) => { res.writeHead(502, cors); res.end(String(e)); });
    return p.end(b);
  }
  if (url.pathname.startsWith('/storage/v1/object/sign/')) { await body(req); res.writeHead(200, { 'content-type': 'application/json', ...cors }); return res.end(JSON.stringify({ signedURL: '/document-signe' })); }
  if (url.pathname === '/auth/v1/logout') { res.writeHead(204, cors); return res.end(); }
  if (url.pathname === '/auth/v1/user') { res.writeHead(200, { 'content-type': 'application/json', ...cors }); return res.end('{}'); }
  if (url.pathname.startsWith('/storage/v1/object/')) { await body(req); res.writeHead(200, { 'content-type': 'application/json', ...cors }); return res.end(JSON.stringify({ Key: url.pathname })); }
  let f = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) f = path.join(DIST, 'index.html');
  const type = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html';
  res.writeHead(200, { 'content-type': type }); fs.createReadStream(f).pipe(res);
}).listen(8767, () => console.log('passerelle prête sur 8767'));
