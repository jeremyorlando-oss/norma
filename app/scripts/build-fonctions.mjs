// Regroupe chaque fonction serveur en UN seul fichier, à coller dans l'éditeur Supabase (Edge Functions › Via Editor).
// Lancer : node app/scripts/build-fonctions.mjs
import { build } from 'esbuild';
import path from 'node:path';
const here = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../supabase/functions');
for (const name of ['invitation', 'rapport-soir', 'notifications']) {
  await build({ entryPoints: [path.join(here, name, 'index.ts')], bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
    external: ['npm:*'], outfile: path.join(here, '..', 'fonctions-a-coller', `${name}.ts`),
    banner: { js: `// NORMA · fonction serveur « ${name} » — fichier généré par app/scripts/build-fonctions.mjs, à coller tel quel.` } });
}
console.log('ok');
