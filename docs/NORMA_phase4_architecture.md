# NORMA — Phase 4 : Architecture technique (proposition v1, 22.10.2026)

## 1. Options comparées

| Critère | **A. Application web installable (PWA) + base Postgres gérée** | B. Application native (App Store / Play Store) | C. Outil no-code (Glide, AppSheet…) |
|---|---|---|---|
| Smartphone, tablette, ordinateur | ✅ un seul code, tous les appareils | Mobile ; ordinateur à part | ✅ |
| Hors ligne fiable | ✅ (stockage local et file de synchronisation) | ✅ | ⚠️ limité |
| Registres non modifiables, journal d'audit | ✅ maîtrisé (règles dans la base) | ✅ | ❌ difficile à garantir |
| Coût mensuel estimé | Faible (≈ 0 à 50 CHF/mois) | + compte Apple ≈ 100 USD/an, publication sur les stores | Abonnement par utilisateur |
| Mises à jour | Instantanées | Validation des stores | Instantanées |
| Évolution multi-entreprises | ✅ | ✅ | ❌ |
| Dépendance à un fournisseur | Faible (Postgres standard, exportable) | Faible | **Forte** |

**Recommandation : A.** C'est la seule option qui remplit à la fois le hors-ligne, l'intégrité des registres, le multi-appareils et un coût bas. La B coûte plus cher sans apporter de bénéfice en V1. La C ne permet pas de garantir des registres non modifiables, une exigence centrale du projet.

## 2. Pile technique retenue (proposition)

- **Interface** : React + TypeScript (Vite), installable sur l'écran d'accueil (PWA), mobile d'abord.
- **Hors ligne** : base locale dans le navigateur (IndexedDB) et **file de synchronisation**. Les enregistrements étant **ajoutés uniquement, jamais modifiés**, il n'y a pas de conflit de synchronisation à arbitrer.
- **Serveur et base de données** : **Supabase** (PostgreSQL, authentification, stockage des photos et PDF) en région européenne.
  - Règles d'accès par rôle et par événement **dans la base** (Row Level Security) : même un appareil compromis ne peut pas contourner les droits.
  - Interdiction technique des modifications et suppressions sur les registres (déclencheurs SQL) et journal d'audit automatique.
- **PIN** : chaque personne a un PIN haché, lié à la session de l'appareil du stand ; verrouillage automatique.
- **PDF** : génération des registres côté application ; archives stockées.
- **Étiquettes** : page d'impression au format étiquette, envoyée en **AirPrint** depuis l'iPhone ou l'iPad.
- **Hébergement de l'interface** : Cloudflare Pages (offre gratuite, usage commercial autorisé, à vérifier à l'ouverture du compte).
- **Tests** : tests automatiques des règles métier (seuils, J+2, droits, non-modifiabilité) et tests de bout en bout sur mobile (Playwright).
- **Code** : dépôt GitHub privé à ton nom ; tu restes propriétaire de tout.

## 3. Coûts estimés (à confirmer à l'ouverture des comptes)

| Poste | Démarrage / test | Exploitation réelle |
|---|---|---|
| Supabase | Gratuit (le projet se met en pause s'il reste inactif) | Offre Pro ≈ 25 USD/mois (sauvegardes quotidiennes, pas de pause) |
| Cloudflare Pages | Gratuit | Gratuit |
| Nom de domaine | — | Sous-domaine de ton site, par ex. `norma.originalscompletos.ch` : 0 CHF |
| Imprimante AirPrint | — | Achat unique, modèle à choisir (P3) |

## 4. Ce dont j'aurai besoin de ta part (plus tard, au moment du déploiement)
1. Créer un compte **GitHub** (gratuit).
2. Créer un compte **Supabase** (gratuit pour commencer).
3. Accès à la gestion DNS de `originalscompletos.ch` (pour le sous-domaine).
Je te guiderai pas à pas. Le développement peut commencer **avant**, ici dans mon environnement.

## 5. Organisation du code (prévue)
```
norma/
  app/          interface (pages, composants, hors ligne)
  supabase/     schéma SQL, règles d'accès, déclencheurs d'audit, migrations
  tests/        tests des règles métier et tests de bout en bout
  docs/         décisions, guide d'utilisation, procédure de restauration
```
