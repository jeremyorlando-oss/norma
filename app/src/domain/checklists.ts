// Checklists du stand. Chaque point indique sa source (audit de conformité v1).
export type ChecklistMode = 'montage' | 'ouverture' | 'fermeture';
export interface ChecklistItem { id: string; text: string; source: string }

export const CHECKLISTS: Record<ChecklistMode, { title: string; when: string; items: ChecklistItem[] }> = {
  montage: {
    title: 'Montage du stand', when: 'Une fois par événement, avant la première préparation',
    items: [
      { id: 'abri', text: 'Stand couvert (toit ou auvent), propre, en bon état, protégé de la vermine', source: 'VD directive · BPHR 2.2.6' },
      { id: 'emplacement', text: 'Éloigné des WC publics et des dépôts de déchets', source: 'VD directive' },
      { id: 'sol', text: 'Sol facile à nettoyer (plancher ou équivalent)', source: 'VD directive' },
      { id: 'protection', text: 'Denrées protégées des clients (vitre anti-postillons, couvercles)', source: 'VD directive · BPHR 2.2.6' },
      { id: 'surfaces', text: 'Surfaces de travail lisses, propres et désinfectées', source: 'VD directive' },
      { id: 'eau', text: 'Eau potable disponible en quantité suffisante', source: 'VD directive · BPHR 2.2.6' },
      { id: 'lavemains', text: 'Lave-mains installé : eau, savon liquide, essuie-mains jetables (pas de torchon)', source: 'VD directive' },
      { id: 'plonge', text: 'Bac de lavage du matériel séparé du lave-mains', source: 'VD directive' },
      { id: 'froid', text: 'Frigos et congélateur allumés avant chargement, à température (≤ 4 °C / ≤ −18 °C)', source: 'VD directive · BPHR 6.2' },
      { id: 'thermos', text: 'Un thermomètre dans chaque frigo / congélateur', source: 'VD directive' },
      { id: 'sonde', text: 'Sonde testée dans eau + glace : 0 °C (± 1 °C), puis désinfectée', source: 'BPHR 2.2.8 · 2.4.4' },
      { id: 'chimie', text: 'Produits de nettoyage étiquetés (usage, dosage), rangés loin des denrées', source: 'VD directive · BPHR 4.2.4' },
      { id: 'sol_denrees', text: 'Aucune denrée ni ustensile posé au sol (tout surélevé)', source: 'VD directive' },
      { id: 'poubelles', text: 'Poubelles avec couvercle, séparées des denrées', source: 'VD directive · BPHR 2.2.6' },
      { id: 'nuisibles', text: 'Aucune trace de nuisibles (insectes, rongeurs)', source: 'ODAlOUs art. 76 · BPHR 2.3.5' },
      { id: 'acces', text: 'Accès à la zone de travail réservé au personnel', source: 'BPHR 4.2.4 (2.1.3)' },
      { id: 'affiches', text: 'Affichages en place : allergènes sur demande, origine des viandes, lavage des mains, accès réservé', source: 'VD directive · BPHR 4.2.4' },
      { id: 'documents', text: 'Classeur sur le stand : annonce OFCO, attestation d’adresse, plan HACCP, guide BPHR, rapports des jours précédents', source: 'VD directive · ODAlOUs art. 20' },
    ],
  },
  ouverture: {
    title: 'Ouverture du jour', when: 'Chaque matin, avant le service',
    items: [
      { id: 'savon', text: 'Lave-mains approvisionné (savon, papier, eau)', source: 'VD directive' },
      { id: 'nuisibles', text: 'Aucune trace de nuisibles pendant la nuit', source: 'BPHR 2.3.5' },
      { id: 'dlc', text: 'Stock contrôlé : aucune DLC dépassée, produits les plus anciens devant (FIFO)', source: 'BPHR 4.2.4 (2.4.3)' },
      { id: 'entames', text: 'Produits entamés refermés et datés (« ouvert le »)', source: 'BPHR 2.4.3 · 6.3.1' },
      { id: 'separation', text: 'Cru / cuit / allergènes séparés dans les frigos', source: 'BPHR 4.2.4 (2.4.3)' },
      { id: 'tablette', text: 'Tablette NORMA désinfectée', source: 'Règle interne' },
    ],
  },
  fermeture: {
    title: 'Fermeture du jour', when: 'Chaque soir, après le dernier service',
    items: [
      { id: 'restes', text: 'Restes chauds (saucisses, frites) éliminés', source: 'BPHR 2.4.4 (3 h max) · GE bonnes pratiques' },
      { id: 'preparations', text: 'Préparations à garder couvertes, étiquetées, au froid', source: 'VD directive · BPHR 6.3.1' },
      { id: 'huile', text: 'Huile filtrée et composés polaires mesurés', source: 'Règle interne D28 · BPHR 2.4.4' },
      { id: 'nettoyage', text: 'Nettoyages de fin de journée validés dans NORMA', source: 'BPHR 2.3.4' },
      { id: 'poubelles', text: 'Poubelles vidées, couvercles fermés', source: 'VD directive' },
      { id: 'froid', text: 'Frigos et congélateur fermés et en marche pour la nuit', source: 'BPHR 6.2' },
    ],
  },
};

/** Formation / briefing (BPHR 1.3 : 5 clés de l'OMS, formation documentée et vérifiée). */
export const BRIEFING = [
  { title: 'Garder propre', text: 'Se laver les mains avant de toucher les aliments, après les toilettes, l’argent, le téléphone, les déchets. Surfaces et ustensiles propres.' },
  { title: 'Séparer le cru et le cuit', text: 'Ustensiles et gants différents ; changer de gants entre chaque tâche. Commande « client allergique » : ustensiles dédiés, préparée en priorité.' },
  { title: 'Bien cuire', text: 'Saucisses réchauffées à cœur : 72 °C au moins, maintenus 2 minutes. Contrôle à la sonde désinfectée.' },
  { title: 'Garder à bonne température', text: 'Froid ≤ 4 °C, congélation ≤ −18 °C, maintien au chaud ≥ 65 °C pendant 3 h au maximum. Chaîne du froid : 30 min max d’interruption.' },
  { title: 'Produits sûrs', text: 'Vérifier les dates ; préparations maison jusqu’à J+2 ; produits entamés datés. En cas de doute : on jette et on signale.' },
  { title: 'Santé et règles du stand', text: 'Fièvre, diarrhée, vomissements ou plaie infectée : le dire au responsable, pas de manipulation des aliments. Pas de bijoux, coiffe obligatoire. Accès réservé au personnel.' },
];

export const QUIZ = [
  { q: 'Le frigo affiche 6 °C. Que faites-vous ?', options: ['Rien, c’est proche de 5 °C', 'J’isole les produits, je préviens le responsable et je l’enregistre', 'Je baisse le thermostat et j’attends le lendemain'], ok: 1 },
  { q: 'Combien de temps au maximum une saucisse peut-elle rester au chaud ?', options: ['3 heures', 'Toute la journée', '30 minutes'], ok: 0 },
  { q: 'Vous avez eu de la diarrhée cette nuit. Vous…', options: ['Travaillez avec des gants', 'Le dites au responsable et ne manipulez pas les aliments', 'Prenez un médicament et travaillez'], ok: 1 },
  { q: 'Un client dit qu’il est allergique. Vous…', options: ['Enlevez simplement l’ingrédient', 'Suivez la procédure : ustensiles dédiés, gants changés, priorité', 'Refusez de le servir'], ok: 1 },
  { q: 'Une sauce maison faite lundi peut être servie jusqu’à…', options: ['Mercredi soir (J+2)', 'Vendredi', 'Tant qu’elle sent bon'], ok: 0 },
];
