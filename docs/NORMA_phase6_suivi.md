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
- Événements (point 5) : fiche (lieu, dates, organisateur, annonce OFCO, équipe, matériel, notes), en-tête du rapport « nom · lieu · jour n/N », checklist de montage 1× par événement, bilan, nom affiché sur la tablette. Migration 005 : ajouter place, organizer, ofco_ref, notes, event_member, event_equipment.
- Réglages (point 6) : matériel (ajout/renommage/retrait par Gérant+Manager ; seuils Gérant seul, jamais moins stricts que la limite officielle ; tâche de nettoyage créée automatiquement), plan de nettoyage (Gérant ; zone, produit·dosage·protection, fréquence, rappel), droits par poste et droits en plus par personne (Gérant ; pointage, prise de poste et signalement toujours actifs). Cuisson : limite BPHR 70 °C à reporter dans official_limit (migration 005).
- Caméra (point 7) : code-barres réel (ZXing, photo), lecture d’étiquette gratuite sur l’appareil (Tesseract fr+de ; modèles chargés depuis internet au 1er usage, à héberger avec l’app à la mise en ligne), photo du bon de livraison compressée et archivée. Produit jamais deviné par l’OCR : seulement fournisseur connu, lot, DLC (tests unitaires parseLabel). e2e OCR : servir via http (voir e2e/demo.mjs).
- Capture automatique : caméra en direct, lecture ~1×/s, capture dès lot + DLC (ou code-barres) lus ; bouton « Prendre la photo » ; si caméra en direct impossible (fichier local, refus) → retour à la photo classique. Testé avec fausse caméra Chromium (e2e/make-camera.sh). À vérifier sur iPad réel à la mise en ligne.
- Notice LPD (point 10) : affichée à la 1re session (FR/ES/EN), lecture horodatée, PDF pour le classeur avec la liste des lectures. Sources vérifiées : LPD art. 19 (contenu), OLT 1 art. 73 al. 2 (registres ≥ 5 ans, commentaire SECO). Hébergeur/pays à compléter à la mise en ligne. Constat : OLT 1 art. 73 al. 1 let. e impose aussi l’horaire et la durée des pauses ≥ 30 min → à ajouter au pointage.
- Heures (point 11) : pauses (bouton tablette, déduites, colonne Pauses dans le rapport — OLT 1 art. 73 al. 1 let. e), alerte « oubli de dépointage » après 10 h (règle interne, onglet Jour), correction par Gérant/Manager avec motif obligatoire et historique (ancienne valeur, auteur, date), récapitulatif par personne (jour / événement / 7 jours), export CSV salaires. Migration 005 : time_break, time_correction.
- Mode inspecteur (point 12) : ouvert par Gérant/Manager (droit export), lecture seule, fermeture auto après 2 h, registres par jour (+ PDF), seuils/sources, formations, revue HACCP, documents, événements ; chaque ouverture/consultation/fermeture dans le journal (Direction → Plus). Heures de travail non montrées (hors champ OFCO). Migration 005 : inspector_access + audit_log.
