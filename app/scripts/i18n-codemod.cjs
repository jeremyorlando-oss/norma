// Codemod : entoure les textes JSX et les attributs textuels avec t('…') (analyse TypeScript, sans regex fragile).
const ts = require('typescript'); const fs = require('fs');
const ATTRS = new Set(['aria-label', 'placeholder', 'title', 'label']);
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = []; const comps = [];
  const q = (s) => "t('" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "')";
  const visit = (n) => {
    if (ts.isJsxText(n)) {
      const raw = n.getFullText(sf); const core = raw.replace(/\s+/g, ' ').trim();
      if (/[A-Za-zÀ-ÿ]/.test(core)) {
        const lead = /^\s/.test(raw) ? ' ' : ''; const trail = /\s$/.test(raw) ? ' ' : '';
        let body = core, prefix = '';
        if (core.startsWith('‹ ')) { prefix = '‹ '; body = core.slice(2); }
        edits.push([n.getFullStart(), n.getEnd(), (raw.includes('\n') && !lead ? '' : lead) + prefix + '{' + q(body) + '}' + (raw.includes('\n') && !trail ? '' : trail)]);
      }
    }
    if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer) && ATTRS.has(n.name.getText(sf)) && /[A-Za-zÀ-ÿ]/.test(n.initializer.text))
      edits.push([n.initializer.getStart(sf), n.initializer.getEnd(), '{' + q(n.initializer.text) + '}']);
    if (ts.isFunctionDeclaration(n) && n.name && /^[A-Z]/.test(n.name.text) && n.body) comps.push(n.body.getStart(sf) + 1);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  for (const p of comps) edits.push([p, p, '\n  const t = useT();']);
  edits.sort((a, b) => b[0] - a[0]);
  let out = src; for (const [s, e, r] of edits) out = out.slice(0, s) + r + out.slice(e);
  const rel = file.includes('/components/') || file.includes('/screens/') ? '../i18n' : './i18n';
  out = `import { useT } from '${rel}';\n` + out;
  fs.writeFileSync(file, out);
  console.log(file, edits.length - comps.length, 'textes');
}
