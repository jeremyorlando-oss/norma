# NORMA · mise en ligne, pas à pas

État au 23.10.2026 : base Supabase installée (Zurich), 001 à 004 + entreprise, postes et compte Gérant. Schéma `norma` exposé.

## A. Mettre la base à jour (5 min)
1. SQL Editor → nouvel onglet → coller `supabase/migrations/005_audit_v1.sql` → Run → « Success ».
2. Nouvel onglet → coller `supabase/seed_materiel_nettoyage.sql` → Run → « materiel 6 · taches_nettoyage 15 ».

## B. Créer les comptes de connexion (5 min)
1. Authentication → Users → Add user → Create new user :
   - la tablette : une adresse dédiée (ex. tablette@originalscompletos.ch, même si la boîte n'existe pas) + mot de passe fort, « Auto Confirm User » coché ;
   - toi : ton e-mail + mot de passe fort, « Auto Confirm User » coché.
2. SQL Editor → coller `supabase/lier_comptes.sql`, remplacer les deux e-mails → Run → « tablettes 1 · comptes_direction 1 ».
3. Authentication → Sign In / Providers → désactiver « Allow new users to sign up » (personne ne peut créer de compte lui-même).

## C. Mettre l'app en ligne (10 min)
Hébergement gratuit relié au dépôt GitHub (Cloudflare Pages ou Vercel) :
- dossier racine : `app` · commande : `npm ci && npm run build` · dossier publié : `dist-prod`
- variables : `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (déjà dans app/.env.production)
Chaque mise à jour poussée sur GitHub est publiée automatiquement.

## D. Premier test réel
- Tablette : ouvrir l'adresse, se connecter avec le compte tablette, « Ajouter à l'écran d'accueil ».
- iPhone : ouvrir l'adresse, se connecter, accepter d'enregistrer le mot de passe (Face ID).
- Ajouter l'équipe dans Direction → Équipe (chaque personne reçoit son code à 4 chiffres).

## Encore à faire après le test
Mode hors ligne · notifications iPhone · envoi automatique du rapport du soir · vraies recettes et plats (après le menu final).
