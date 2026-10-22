# NORMA — Phase 6 : suivi du développement

| Élément | Développé | Testé | Remarque |
|---|:-:|:-:|---|
| Schéma base de données (entreprise, postes, membres, équipements) | ✅ | ✅ | PostgreSQL 16 local ; compatible Supabase |
| Droits par poste + options par personne | ✅ | ✅ | Gérant non limitable |
| Code PIN : unicité, codes faciles refusés, jamais stocké en clair | ✅ | ✅ | HMAC avec clé secrète par entreprise |
| Blocage après 5 codes faux (1 min) | ✅ | ✅ | |
| Seuils jamais moins stricts que les limites officielles | ✅ | ✅ | Froid +5 °C, congélation −18 °C, chaud +65 °C, huile 175 °C |
| Relevés : statut vert/jaune/rouge calculé par le serveur | ✅ | ✅ | Seuils copiés dans chaque relevé (preuve historique) |
| Relevé rouge → non-conformité automatique | ✅ | ✅ | |
| Registres non modifiables / non supprimables | ✅ | ✅ | Correction = nouvel enregistrement lié |
| Clôture NC : droit + action corrective + vérification obligatoires | ✅ | ✅ | |
| Journal d'audit (sans données de PIN) | ✅ | ✅ | |
| Accès : aucune écriture directe, tout passe par des fonctions qui vérifient session + droits | ✅ | ✅ | |
| Session tablette par code (2 min d'inactivité), départ uniquement par bouton dédié | ✅ | ✅ | |
| Comptes Direction (iPhone) : saisie de dépannage marquée « iPhone Gérant » | ✅ | ✅ | Connexion e-mail + Face ID : côté interface |
| Cloisonnement entre entreprises, heures visibles seulement Gérant/Manager ou soi-même | ✅ | ✅ | Testé en émulant les rôles Supabase |
| Fonctions d'action huile, réception (+ catalogue code-barres), préparations, lots, signalement et traitement NC | ✅ | ✅ | |
| Bouton « off » de session sur tous les écrans (D36) | ✅ | ✅ | Interface démo |
| Pointage arrivée/départ par code, corrections d'heures (Gérant/Manager) | ✅ | ✅ | Pointage incohérent refusé |
| Prise de poste (apte / non apte, sans symptôme) obligatoire avant relevés et préparations | ✅ | ✅ | |
| Plan de nettoyage : tâches auto pour chaque équipement, états jaune (−15 min) / rouge | ✅ | ✅ | Tâches « fin de service / journée » : alerte à la fermeture (à faire) |
| Huile : soir = polaires (changement le lendemain), matin/service = température + aspect, NC auto | ✅ | ✅ | |
| Réception : acceptation impossible si un contrôle est à NON ou DLC dépassée, refus → NC | ✅ | ✅ | Lecture photo / code-barres : côté interface |
| Recettes + lots CODE-JJMMAA-n, limite J+2, statut à garder / aujourd'hui / à jeter, jeter tracé | ✅ | ✅ | |
| Interface tablette (démo) : pointage coloré, code, prise de poste, session par droits, bouton off, inactivité 2 min | ✅ | ✅ | Test automatique navigateur (Chromium) |
| Relevé à molettes (équipement + température), écran hors seuil avec action corrective obligatoire | ✅ | ✅ | |
| Nettoyage : tâches, retards, validation | ✅ | ✅ | |
| Branchement de l'interface sur Supabase + mode hors ligne (file d'attente) | ⏳ | — | La démo fonctionne avec des données fictives en mémoire |
| Écrans Huile (matin/service/soir), Réception (photo, code-barres, contrôles NON par défaut, refus motivé), Préparations (lots, jeter en 2 temps, étiquette imprimable) | ✅ | ✅ | Démo : lecture photo et scan simulés |
| Écrans Allergènes (14 catégories, vue client trilingue) et Signaler (procédures corps étranger, allergie, coupure) | ✅ | ✅ | Allergènes = données d'exemple à valider |
| Direction iPhone : tableau du jour (incidents, retards, lots, présents apte/non apte), incidents (étapes, clôture contrôlée), équipe (ajout, code affiché une fois, nouveau code), saisie de dépannage marquée | ✅ | ✅ | Connexion réelle e-mail + Face ID au branchement serveur |
| Menu / recettes : mis à jour par Claude à partir du menu transmis (D37) | — | — | Pas d'écran de modification |
| Rapport journalier PDF (page « comment lire », seuils + sources, 7 sections, écarts en rouge, pages numérotées, code de vérification, visa) | ✅ | ✅ | Généré depuis l'iPhone Direction ; test navigateur |
| Envoi automatique du rapport chaque soir au Gérant et au Manager | ⏳ | — | Nécessite le serveur en ligne |
| Corrections de l'audit v1 (checklists, formation + quiz, maintien au chaud 3 h, réchauffe 2 min, origine viande, intoxication, produits entamés, transport propre, documents, revue HACCP) | ✅ | ✅ | Démo ; base de données : migration 005 au branchement serveur |

Tests : 74 vérifications automatiques, toutes réussies (22.10.2026), sur base PostgreSQL de test locale.

- Traductions ES/EN de l’app stand (langue choisie par membre ; Direction et rapports en français). Textes à relire par une personne de langue maternelle ; produits de nettoyage traduits quand les vraies données seront saisies.
