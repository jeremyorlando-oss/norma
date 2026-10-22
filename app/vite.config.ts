import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// DEMO=1 : construit une démo autonome en un seul fichier HTML (données fictives, sans serveur)
export default defineConfig({
  plugins: [react(), ...(process.env.DEMO ? [viteSingleFile()] : [])],
});
