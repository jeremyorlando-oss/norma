# NORMA — Phase 3 : Cahier des charges V1 (v1, 22.10.2026)

Références : décisions D1 à D13 (voir audit phase 2), D12 = registres conservés **2 ans** puis archive PDF ; D13 = interface **français** (multilingue prévu).

## 1. Contexte d'utilisation
- Entreprise : Original's Completos (V1 mono-entreprise, modèle de données multi-entreprises).
- Lieux : **événements** (festival, marché…) ; chaque événement a des dates, un lieu, une équipe et des équipements.
- Appareil : **tablette ou téléphone partagé**, connexion par **PIN**, réseau souvent faible → **fonctionnement hors ligne obligatoire**.

## 2. Postes et droits (D20 — remplace D9)

Postes **configurables** : chaque poste = une liste de droits cochés par le Gérant ou le Manager ; d'autres postes peuvent être créés. Écran par défaut de la tablette = **pointage par code** (D19) ; après le code, la personne ne voit que ce que son poste autorise. Attribution par événement, cumul possible.

| Droit | Gérant | Manager | Chef de cuisine | Aide de cuisine |
|---|:-:|:-:|:-:|:-:|
| Pointer / dépointer | ✅ | ✅ | ✅ | ✅ |
| Prise de poste | ✅ | ✅ | ✅ | ✅ |
| Cocher les nettoyages | ✅ | ✅ | ✅ | au choix |
| Relevés température, huile | ✅ | — | ✅ | au choix |
| Réception marchandises | ✅ | ✅ | ✅ | — |
| Préparations, étiquettes, jeter un lot | ✅ | — | ✅ | au choix |
| Ouvrir une NC | ✅ | ✅ | ✅ | ✅ (signaler) |
| Traiter / clôturer une NC | ✅ | — | ✅ | — |
| Tableau de bord | ✅ | ✅ | ✅ | — |
| Heures de l'équipe | ✅ | ✅ | — | — |
| Export PDF des registres | ✅ | ✅ | ✅ | — |
| Équipements, seuils, recettes | ✅ | — | ✅ | — |
| Équipe, postes, codes | ✅ | ✅ | — | — |
| Conformité administrative | ✅ | ✅ | — | — |

**Règle absolue** : aucune suppression ni modification d'un enregistrement. Une erreur se corrige par un **enregistrement de correction** lié (motif, auteur, heure). Un contrôle non conforme **ne peut jamais devenir conforme** ; il se clôt uniquement par une action corrective documentée.

## 3. Modules V1 et règles métier

### M1 — Tableau de bord
Contrôles dus, en retard, NC ouvertes, préparations proches de J+2, checklists non faites. Code couleur vert / orange / rouge.

### M2 — Températures
- Équipements : frigo (0 à 4 °C), congélateur (≤ −18 °C), saladette (2 à 4 °C). Contrôles de produit : cuisson à cœur (≥ 72 °C), maintien au chaud (≥ 65 °C).
- Fréquence des équipements : **2 par jour, ouverture et fermeture** (D14), plus un relevé libre possible à tout moment.
- Hors seuil → **action corrective obligatoire** avant de pouvoir continuer (liste proposée et texte libre) → NC créée automatiquement.
- Chaque seuil stocke sa **source** (VD, autorité ou interne) ; un seuil interne ne peut pas être moins strict que le seuil officiel.

### M3 — Huile
Température (≤ 175 °C), composés polaires (changement à 25 %, alerte), aspect (couleur, odeur, mousse, fumée), filtration, changement. Polaires ≥ 25 % ou aspect dégradé → changement obligatoire et NC.

### M4 — Réception
Fournisseur (liste), produit, quantité, n° de lot, DLC/DDM, température (≤ 4 °C / ≤ −18 °C), emballage, aspect, chaîne du froid. Non conforme → refus, motif, information du fournisseur, NC. Photo facultative (bon de livraison).

### M5 — Nettoyage
9 zones du plan actuel, avec produit, fréquence et responsable. Tâches générées automatiquement par service ; validation en un clic ; tâche en retard signalée. Plans de travail inox : désinfection **à chaque changement de tâche (cru → cuit, sans allergène) et en fin de service** (D15).

### M6 — Non-conformités et incidents
Types : température, huile, réception, corps étranger, coupure de courant, hygiène, autre. Champs : description, denrée/lot ou équipement, évaluation du risque, mesures immédiates, quantité éliminée, action corrective, responsable, vérification d'efficacité, clôture. Assistants pas à pas pour **corps étranger** et **coupure de courant** (reprend tes procédures). Clôture par le déclarant signalée.

### M7 — Étiquettes de préparations
Choix d'une recette, puis génération de l'étiquette : nom, date de production, **date limite = J+2 (fin de journée)**, auteur, n° de préparation, allergènes. Impression **AirPrint**. Alerte la veille et le jour de la date limite ; élimination enregistrée.

### M8 — Checklists
- **Montage du stand** (exigences de la directive VD) : une fois par événement.
- **Prise de poste** (santé, tenue, bijoux, lavage des mains) : une par personne et par jour. Une réponse « malade » bloque l'accès aux postes de manipulation et alerte le responsable.

### M9 — Allergènes
Fiches produits et ingrédients avec les **14 allergènes** ; calcul automatique par plat à partir des ingrédients ; vue « client » affichable et imprimable.

### M10 — Export
PDF par événement ou par période : tous les registres, NC, checklists, avec horodatage et auteurs. Export CSV pour l'archive.

### M11 — Conformité administrative
Documents : annonce OFCO (art. 20 ODAlOUs), attestation d'adresse, extrait RC, certificats de formation. Alerte si un document manque ou expire.

### M12 — Équipe et formation
Fiche collaborateur, briefing interne daté, **attestations de prise de connaissance** (HACCP, hygiène) signées dans l'application.

## 4. Exigences techniques
- **Hors ligne** : toutes les saisies fonctionnent sans réseau, puis synchronisation automatique. Aucune perte de données si l'application est fermée.
- **Horodatage** : heure de l'appareil plus heure du serveur à la synchronisation ; un écart important est signalé.
- **Journal d'audit** de toutes les opérations sensibles.
- **Sauvegardes** quotidiennes ; procédure de restauration testée.
- **LPD** : hébergement en Suisse ou dans l'UE, données personnelles minimales (nom, rôle, téléphone facultatif), PIN chiffré.
- **Conservation** : 2 ans, puis archive PDF et purge.
- **Interface** : smartphone d'abord, gros boutons, saisie d'une température en moins de 3 touches.
- **Avertissement** affiché : l'application aide à l'autocontrôle mais ne garantit pas la conformité.

## 5. Points ouverts
- P1 et P2 tranchés (D14, D15).
- **P3** : liste des modèles d'imprimantes AirPrint (phase 4).
- **P4** : mention du mode d'élevage pour la saucisse de volaille, à confirmer auprès de l'OFCO.

## 6. Décisions phase 5
- **D16** : zone jaune (vigilance) à **0,5 °C** de chaque limite ; relevé jaune = conforme.
- **D17** : n° de lot des préparations = **CODE-JJMMAA-n** (ex. JAL-221026-1), généré automatiquement et imprimé sur l'étiquette.
- **D18** : lien lot de préparation → lots d'ingrédients : **pas pour l'instant** (évolution possible).
- **D19** : écran d'accueil du stand = **pointage par code à 4 chiffres seul** (pas d'identifiant) ; le code identifie la personne, pointe l'arrivée et ouvre la prise de poste ; 2e saisie = départ. Codes uniques par entreprise, blocage 1 min après 5 erreurs. Santé : apte / non apte uniquement (pas de symptômes). À vérifier : obligations de conservation des relevés de temps de travail (droit du travail).
- **D21** : Manager = toutes les tâches HACCP de terrain (relevés, huile, réception, préparations/étiquettes/jeter, nettoyage, NC jusqu'à clôture), heures équipe (corrections tracées), export, gestion équipe (postes existants, reset codes), ajout/retrait d'équipement avec seuils imposés par le type. **Réservé Gérant** : seuils, zone jaune, recettes (code, durée, allergènes), plan de nettoyage, droits/création de postes, compte Gérant, conservation des registres, suppression définitive, suppression de documents admin. Manager peut faire une **demande de modification** validée par le Gérant.
- **D22** : Chef de cuisine = pointage, prise de poste, relevés température/huile, réception, préparations/étiquettes/jeter, nettoyages, NC jusqu'à clôture, tableau de bord, vue des prises de poste du jour (apte/non apte). Pas : heures équipe, gestion équipe/codes, équipements, export, réglages Gérant.
- **D23** : Aide de cuisine = toujours : pointage, prise de poste, **nettoyages**, signaler une NC, voir ses propres heures. Options par personne (désactivées par défaut, activables par Gérant/Manager) : relevés température/huile, préparations/étiquettes. Jamais : jeter un lot, traiter/clôturer NC, tableau de bord, heures des autres, export, réglages.
- **D24** (remplace D13) : interface en **français, espagnol, anglais** ; langue choisie par membre, appliquée dès la saisie du code. Registres et exports PDF toujours en français. Traductions des consignes d'hygiène à faire relire par un locuteur.
- **D25** : Réception = photo (étiquette) → remplissage auto fournisseur, produit, lot, DLC (IA en ligne, champs surlignés à vérifier) + scan code-barres GS1 hors ligne ; température par petite molette ; contrôles **NON (rouge) par défaut**, à basculer un par un sur OUI (vert) après vérification ; photo du bon de livraison archivée avec la réception et consultable.
- **D26** : code-barres → **catalogue interne uniquement** (produit nommé au 1er scan, reconnu ensuite avec son fournisseur) ; pas de base externe. Lot/DLC : depuis GS1-128/DataMatrix si présent, sinon photo.
- **D27** : friteuses gérées comme équipements (ajout/modif/retrait) avec lien depuis l'écran Huile. Allergènes : modification **Gérant uniquement** ; consultation par le nouveau poste **Caisse** (droits à définir). **Rapport journalier** PDF généré automatiquement à la fermeture, à imprimer chaque matin pour le classeur (rappel sur le tableau de bord tant qu'il n'est pas imprimé).
- **D28** : huile (règle interne, aucune fréquence officielle VD trouvée) → **soir avant fermeture** : composés polaires (+ filtration) pour décider du changement le lendemain ; **matin** : aspect + température ; **chaque service** : température.
- **D29** : poste **Caisse** = pointage, prise de poste, **tous les nettoyages**, **allergènes en lecture**. + bouton **Signaler un problème** (alerte chef de cuisine et manager). Rien d'autre.
- **D30** : 3 espaces — **Stand** (tablette, code 4 chiffres, tout l'opérationnel), **Direction** (iPhone Gérant/Manager, compte sécurisé e-mail + Face ID, version simplifiée ; Gérant peut **saisir en dépannage**, saisie marquée « depuis iPhone »), **Employé** (téléphone perso : horaires, heures, documents, contrats, fiches de salaire). Découpage validé : **V1** = tablette + pointage + Direction ; **V1.1** = espace Employé (horaires/planning, heures, dépôt documents) ; **V1.2** = contrats à signer + fiches de salaire (transmission, pas de calcul). Certificats médicaux : données sensibles LPD, chiffrés, Gérant seul.
- **D31** : **pas d'imprimante A4 sur le stand**. Rapport journalier PDF envoyé automatiquement en fin de journée/service au **Gérant et au Manager** (app Direction) pour impression à la maison et dépôt au classeur le lendemain matin. Le rapport papier doit se suffire à lui-même pour un inspecteur : page « comment lire ce rapport », seuils et sources, signatures, pagination, code de vérification d'intégrité. Consultation possible à l'écran par l'inspecteur (mode lecture seule).
- **D32** : **mini-imprimante d'étiquettes autocollantes** conservée sur le stand (seule imprimante du stand) ; compatibilité iPhone/iPad à vérifier avant achat.
- **D33** : zones/lieux du plan de nettoyage ajoutés **par le Gérant uniquement** (équipements ajoutés par le Manager → nettoyage créé automatiquement avec fréquence par défaut).
- **D34** : **écran par défaut (pointage) coloré** selon l'état des tâches : **jaune 15 min avant** l'échéance, **rouge** dès que l'échéance est dépassée ; liste des tâches concernées avec les postes autorisés à les faire.
- **D35** : le code ouvre la **session** de la personne ; **arrivée** automatique seulement si elle n'est pas pointée ; le **départ n'est jamais automatique** (bouton « Terminer mon service · dépointer » + confirmation). Session fermée après 2 min d'inactivité, la personne reste pointée.
- **D36** : sur la tablette, **bouton rouge « off » discret** présent sur **tous les écrans** d'une session (coin supérieur droit) → ferme la session immédiatement (la personne reste pointée ; ≠ dépointer).
- **D37** : **pas d'écran de modification des recettes/mets/allergènes** dans l'application. Le Gérant transmet le menu définitif et les recettes exactes à Claude dans ce projet avant chaque événement ; Claude met à jour les données (fichier de menu versionné dans GitHub, changements tracés).
- **D38** : activation des appareils — **tablette du stand** activée une fois par le Gérant (compte Gérant) et révocable à distance ; **iPhone Gérant/Manager** : compte e-mail + mot de passe puis Face ID (passkey) ; **employés** (V1.1) : invitation, espace Employé seul. Le poste est toujours attribué par le Gérant/Manager. Sur la tablette, les **réglages sensibles** exigent le code **+ mot de passe ou Face ID du Gérant**.
- **D39** : invitations des employés envoyées **par WhatsApp** : l'app génère un lien d'invitation à usage unique (expiration 48 h) et ouvre WhatsApp sur le téléphone du Gérant avec le message prêt à envoyer (sans API WhatsApp Business payante en V1.1).
