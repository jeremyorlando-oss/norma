import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// DEMO=1 : démo autonome en un seul fichier HTML (données fictives, sans serveur).
// Sans DEMO : app de production branchée sur Supabase (app/.env.production).
export default defineConfig({
  plugins: [react(), ...(process.env.DEMO ? [viteSingleFile()] : [])],
  define: { __DEMO__: JSON.stringify(!!process.env.DEMO) },
  build: { outDir: process.env.DEMO ? 'dist' : 'dist-prod' },
});
