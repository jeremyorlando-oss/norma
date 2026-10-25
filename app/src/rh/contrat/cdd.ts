// Modèle de contrat CDD d'Original's Completos (texte et mise en page reproduits du contrat papier du Gérant).
// Les données de la personne viennent de sa fiche (Mon espace › Profil) ; le Gérant choisit fonction, dates et salaire.
// Police Carlito (licence SIL OFL, métriques identiques à Calibri), filigrane du logo, pied de page et sauts de page d'origine.
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { chf, dmy, EMPLOYEUR, H, header, LI, longDate, P, page, parties, qualite, C } from './style';
export { EMPLOYEUR } from './style';

export interface CddData {
  prenoms: string; nom: string; birthDate: string;    // AAAA-MM-JJ
  street: string; npa: string; city: string; avs: string;
  fonction: string;                                     // « employé polyvalent », « chef de cuisine »…
  start: string; end: string;                           // AAAA-MM-JJ
  salaireHoraire: number;                               // CHF brut / heure
  signedOn: Date;                                       // « Fait à Bussigny, le … »
  electronique: boolean;                                // signature dans l'app NORMA (mentions finales adaptées)
}

export const FONCTIONS = ['employé polyvalent', 'employée polyvalente', 'employé(e) de caisse', 'aide de cuisine', 'cuisinier', 'cuisinière', 'chef de cuisine',
  'caissier', 'caissière', 'manager'];

/** Champs de la fiche nécessaires au contrat, encore vides. */
export function missingFields(d: Partial<CddData>) {
  const need: [keyof CddData, string][] = [['prenoms', 'prénoms'], ['nom', 'nom'], ['birthDate', 'date de naissance'], ['street', 'rue'],
    ['npa', 'NPA'], ['city', 'localité'], ['avs', 'numéro AVS']];
  return need.filter(([k]) => !d[k]).map(([, l]) => l);
}

export function buildCdd(d: CddData, watermark: string): TDocumentDefinitions {
  const employe = `${d.prenoms} ${d.nom}`.trim();
  const b = (t: string) => ({ text: t, bold: true });
  return page(`Contrat de travail CDD · ${employe}`, watermark, [
      ...header('CONTRAT DE TRAVAIL', "Durée déterminée (CDD) — Original's Completos, Cuisine Événementielle"),
      parties([b(employe), ' — né le ', b(dmy(d.birthDate)), ' — ', b(`${d.street}, ${d.npa} ${d.city}`), ' — n° AVS ', b(d.avs)]),
      P("Entre l'employeur mentionné ci-dessus, ci-après « l'employeur », et la personne mentionnée ci-dessus, ci-après « l'employé(e) », il est convenu ce qui suit :"),
      ...H('1. Objet et nature du contrat'),
      P("Le présent contrat est un contrat de travail à durée déterminée (CDD) au sens des art. 319 ss CO, conclu pour les besoins ponctuels de l'activité événementielle de l'employeur (festivals, marchés, manifestations)."),
      P(`L'employé(e) est engagé(e) en qualité ${qualite(d.fonction)} et exercera notamment les tâches suivantes : préparation et cuisson des produits, service à la clientèle, encaissement, entretien et nettoyage du poste de travail, application des règles d'hygiène (HACCP) en vigueur dans l'entreprise, et toute autre tâche nécessaire.`),
      ...H('2. Début, durée et fin des rapports de travail'),
      P(['Le contrat débute le ', b(dmy(d.start)), ' et prend fin de plein droit le ', b(dmy(d.end)), ", sans qu'il soit nécessaire de donner congé (art. 334 al. 1 CO)."]),
      ...H("3. Période d'essai"),
      P("Le contrat de travail ne prévoit pas de période d'essai."),
      ...H('4. Lieu de travail'),
      P("Le lieu de travail correspond à l'emplacement du ou des stands de l'employeur lors des événements pour lesquels l'employé(e) est engagé(e)."),
      ...H('5. Clause de mobilité'),
      P("En cas de besoin de service ou de réorganisation, l'employé(e) peut être affecté(e) à d'autres postes ou emplacements appartenant à l'employeur, dans une mesure compatible avec sa fonction et ses compétences. Une telle affectation ne constitue pas une modification du présent contrat."),
      ...H('6. Temps de travail et horaires'),
      P("L'horaire de travail est fixé en fonction des besoins de l'événement et communiqué à l'employé(e) au préalable. Les horaires et jours de repos peuvent être adaptés en cas de besoin du service, sans que cela constitue une modification du contrat. La durée du travail respecte les limites fixées par la loi sur le travail (LTr) et, le cas échéant, par la convention collective de travail applicable (voir art. 15)."),
      { text: '', pageBreak: 'after' },
      ...H('7. Salaire').map((c, i) => (i === 0 ? { ...(c as object), margin: [0, 0, 0, 3] } as Content : c)),
      P(["L'employé(e) perçoit un salaire brut de CHF ", b(chf(d.salaireHoraire)), " par heure, y compris vacances, jours fériés et 13ème salaire. Le salaire est versé le 30 de chaque mois ou à l'échéance du contrat, sur le compte bancaire ou postal communiqué par l'employé(e)."]),
      P("L'employeur remet à l'employé(e) un décompte de salaire détaillant le salaire brut, les déductions et le montant net versé."),
      ...H('8. Heures supplémentaires'),
      P("Les heures effectuées au-delà de l'horaire convenu ne peuvent être exigées que dans la mesure où l'employé(e) peut s'en charger et où les règles de la bonne foi permettent de les lui demander (art. 321c CO). Elles sont rémunérées selon l'article 7 du présent contrat."),
      ...H('9. Empêchement de travailler (maladie, accident)'),
      P("En cas d'incapacité de travail pour cause de maladie ou d'accident non fautif, l'employé(e) en informe immédiatement l'employeur et fournit un certificat médical. Les prestations dues sont réglées conformément à l'art. 324a CO et, le cas échéant, à l'assurance perte de gain maladie souscrite par l'employeur."),
      ...H('10. Tenue de travail et matériel'),
      P("Compte tenu du contact permanent avec la clientèle et de la nécessité de préserver l'image de l'entreprise, l'employé(e) s'engage à porter en tout temps une tenue correcte et propre, conforme à la charte d'hygiène du personnel de l'entreprise. Les tenues et le matériel remis à l'engagement (uniforme, badge, etc.) restent la propriété de l'employeur et doivent être restitués à la fin des rapports de travail."),
      ...H("11. Obligations de l'employé(e)"),
      LI('Exécuter le travail confié avec soin, diligence et fidélité (art. 321a CO).'),
      LI("Respecter les consignes d'hygiène et de sécurité alimentaire (HACCP) en vigueur dans l'entreprise."),
      LI("Sauvegarder les intérêts légitimes de l'employeur et garder le secret sur les affaires internes de l'entreprise, même après la fin du contrat, dans la mesure exigée pour sauvegarder les intérêts légitimes de l'employeur (art. 321a al. 4 CO)."),
      LI("Respecter le règlement intérieur et les directives de l'employeur."),
      ...H("12. Changement d'adresse ou de coordonnées"),
      P("Tout changement d'adresse, de coordonnées bancaires ou de numéro de téléphone doit être communiqué sans délai à l'employeur."),
      ...H('13. Protection des données'),
      P("Les données personnelles de l'employé(e) sont traitées par l'employeur dans le respect de la loi fédérale sur la protection des données (LPD), exclusivement dans le cadre nécessaire à l'exécution du contrat de travail et aux obligations légales de l'employeur (assurances sociales, décomptes de salaire, etc.)."),
      { text: '', pageBreak: 'after' },
      ...H('14. Fin des rapports de travail').map((c, i) => (i === 0 ? { ...(c as object), margin: [0, 0, 0, 3] } as Content : c)),
      P("En cas de résiliation anticipée, la partie qui résilie le notifie par écrit à l'autre partie et respecte les délais de congé légaux ou convenus (art. 335b CO)."),
      P("Chacune des parties peut en tout temps résilier le contrat avec effet immédiat pour de justes motifs au sens de l'art. 337 CO. Sont notamment considérées comme de justes motifs toutes les circonstances qui, selon les règles de la bonne foi, ne permettent pas d'exiger de celui qui a donné le congé la continuation des rapports de travail."),
      ...H('15. Convention collective et dispositions légales applicables'),
      P("Pour tout ce qui n'est pas réglé par le présent contrat, les dispositions du Code des obligations (art. 319 ss CO) sont applicables, ainsi que, le cas échéant, la Convention collective nationale de travail pour l'hôtellerie-restauration (CCNT) si l'activité de l'employeur entre dans son champ d'application."),
      ...H('16. For et droit applicable'),
      P("Le présent contrat est soumis au droit suisse. Le for juridique est celui du domicile ou du siège de la partie défenderesse, sous réserve des dispositions impératives de la loi sur les fors en matière de droit du travail."),
      ...H('17. Dispositions finales'),
      P("Toute modification du présent contrat doit être faite par écrit pour être valable. Si une clause du présent contrat devait être déclarée nulle ou inapplicable, les autres clauses resteraient pleinement valables."),
      ...(d.electronique
        ? [P(`Fait à ${EMPLOYEUR.lieu}, le ${longDate(d.signedOn)}. Le présent contrat est remis à l'employé(e) et signé par lui/elle dans l'application NORMA ; une attestation de signature électronique est jointe au contrat.`)]
        : [P(`Fait à ${EMPLOYEUR.lieu}, le ${longDate(d.signedOn)}, en deux exemplaires, chaque partie reconnaissant avoir reçu le sien.`),
           { text: "La signature de l'employé(e) est précédée de la mention manuscrite « lu et approuvé ».", italics: true, margin: [0, 0, 0, 8] } as Content]),
      { table: { widths: ['*', '*'], body: [[
        { stack: [{ text: "L'EMPLOYEUR", bold: true }, EMPLOYEUR.nom, { text: d.electronique ? 'Lieu et date : ' + EMPLOYEUR.lieu + ', ' + dmy(d.signedOn.toISOString().slice(0, 10)) : 'Lieu et date : ......................................', color: '#777777', margin: [0, 12, 0, 0] }],
          fillColor: C.label, margin: [8, 8, 8, 26], alignment: 'left' },
        { stack: [{ text: "L'EMPLOYÉ(E)", bold: true }, employe, { text: d.electronique ? 'Signature électronique dans NORMA (voir attestation)' : 'Lieu et date : ......................................', color: '#777777', margin: [0, 12, 0, 0] }],
          fillColor: C.label, margin: [8, 8, 8, 26], alignment: 'left' },
      ]] }, layout: { hLineColor: () => C.rule, vLineColor: () => C.rule, hLineWidth: () => 0.6, vLineWidth: () => 0.6 }, margin: [0, 6, 0, 0] },
  ]);
}
