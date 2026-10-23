# Test de bout en bout de l'app de production (sans toucher à Supabase)

1. `sh e2e-prod/setup-db.sh` : base locale `normae2e` (migrations 001 à 005 + données de départ + tablette et iPhone de test).
2. PostgREST 12 (binaire officiel) : `postgrest e2e-prod/postgrest.conf` (port 3001).
3. Build de test : `cd app && VITE_SUPABASE_URL=http://localhost:8767 VITE_SUPABASE_PUBLISHABLE_KEY=test npx vite build --outDir dist-e2e`
4. Passerelle (imite /rest/v1, /auth/v1, /storage/v1 de Supabase) : `node e2e-prod/gateway.mjs app/dist-e2e` (port 8767).
5. `node e2e-prod/prod.mjs <dossier captures>` (copier dans app/e2e pour trouver Playwright).

Comptes de test : tablette@test.ch / orlando@test.ch, mot de passe test1234. Codes : Gérant 2580, Esteban 4827, Lucía 6142.
