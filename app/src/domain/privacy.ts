// Notice d'information aux collaborateurs (LPD art. 19). Base sérieuse, non validée par un juriste.
// Sources : LPD (RS 235.1) art. 19 et 25 ; LTr art. 46 ; OLT 1 art. 73 (conservation ≥ 5 ans) ; ODAlOUs ; BPHR.

export const PRIVACY_VERSION = '2026-10-25';
type L = 'fr' | 'es' | 'en';
export interface Controller { name: string; responsable: string; address: string; email: string; phone: string }
export interface NoticeSection { title: string; rows?: [string, string, string][]; text?: string }

const T = {
  title: { fr: 'Protection de vos données', es: 'Protección de sus datos', en: 'Protection of your data' },
  intro: {
    fr: 'NORMA est l’application d’hygiène (HACCP) du stand. Voici ce qu’elle enregistre sur vous, pourquoi, combien de temps et qui peut le voir.',
    es: 'NORMA es la aplicación de higiene (HACCP) del puesto. Esto es lo que registra sobre usted, por qué, durante cuánto tiempo y quién puede verlo.',
    en: 'NORMA is the stand’s hygiene (HACCP) app. This is what it records about you, why, for how long and who can see it.' },
  who: { fr: 'Responsable', es: 'Responsable', en: 'Controller' },
  data: { fr: 'Données, but et durée de conservation', es: 'Datos, finalidad y plazo de conservación', en: 'Data, purpose and retention' },
  cols: { fr: ['Donnée', 'Pourquoi', 'Conservée'], es: ['Dato', 'Para qué', 'Se conserva'], en: ['Data', 'Why', 'Kept for'] },
  access: { fr: 'Qui y a accès', es: 'Quién tiene acceso', en: 'Who has access' },
  accessText: {
    fr: 'Le Gérant ; le Manager selon ses droits ; sur demande, les autorités de contrôle (Office de la consommation OFCO, inspection du travail). Hébergement : vos données sont stockées en Suisse (Zurich) chez Supabase (Supabase Inc., États-Unis). Le site de l’application est servi par Vercel (Vercel Inc., États-Unis) et ne contient aucune de vos données. Aucune donnée n’est vendue ni utilisée pour de la publicité.',
    es: 'El Gerente; el Mánager según sus permisos; a petición, las autoridades de control (Oficina del consumo OFCO, inspección de trabajo). Alojamiento: sus datos se guardan en Suiza (Zúrich) en Supabase (Supabase Inc., Estados Unidos). El sitio de la aplicación lo sirve Vercel (Vercel Inc., Estados Unidos) y no contiene ninguno de sus datos. Ningún dato se vende ni se usa para publicidad.',
    en: 'The owner-manager; the manager according to their rights; on request, the inspection authorities (OFCO consumer office, labour inspectorate). Hosting: your data is stored in Switzerland (Zurich) with Supabase (Supabase Inc., USA). The app’s website is served by Vercel (Vercel Inc., USA) and contains none of your data. No data is sold or used for advertising.' },
  health: { fr: 'Santé', es: 'Salud', en: 'Health' },
  healthText: {
    fr: 'À la prise de poste, seul « apte » ou « non apte » est enregistré. Aucun symptôme ni maladie n’est noté. Un certificat médical que vous déposez n’est visible que par le Gérant.',
    es: 'Al empezar el turno solo se registra «apto» o «no apto». No se anota ningún síntoma ni enfermedad. Un certificado médico que usted suba solo lo ve el Gerente.',
    en: 'At the start of a shift only “fit” or “not fit” is recorded. No symptom or illness is written down. A medical certificate you upload is visible to the owner-manager only.' },
  rights: { fr: 'Vos droits', es: 'Sus derechos', en: 'Your rights' },
  rightsText: {
    fr: 'Vous pouvez demander à voir vos données, les faire corriger, ou demander leur suppression quand la loi ne nous oblige pas à les garder (LPD art. 25 et 32). Adressez-vous au responsable ci-dessus.',
    es: 'Puede pedir ver sus datos, corregirlos o solicitar su eliminación cuando la ley no nos obligue a conservarlos (LPD art. 25 y 32). Diríjase al responsable indicado arriba.',
    en: 'You can ask to see your data, have it corrected, or ask for it to be deleted when the law does not require us to keep it (FADP art. 25 and 32). Contact the controller above.' },
  ack: { fr: 'J’ai lu et compris', es: 'He leído y entendido', en: 'I have read and understood' },
} as const;

const ROWS: Record<L, [string, string, string][]> = {
  fr: [
    ['Prénom, poste, langue, code personnel (chiffré)', 'Ouvrir votre session et vos droits', 'Pendant l’emploi'],
    ['Heures d’arrivée et de départ', 'Enregistrement du temps de travail obligatoire (LTr art. 46, OLT 1 art. 73) et salaire', '5 ans minimum (OLT 1 art. 73 al. 2)'],
    ['Apte / non apte du jour', 'Sécurité des aliments (hygiène du personnel, BPHR)', '2 ans (règle interne)'],
    ['Vos actions signées : relevés, nettoyages, réceptions, lots, incidents', 'Autocontrôle HACCP obligatoire (ODAlOUs)', '2 ans (règle interne)'],
    ['Compte sur votre téléphone (si vous êtes invité) : e-mail, mot de passe chiffré', 'Accès à votre espace Employé (planning, heures, documents)', 'Pendant l’emploi'],
    ['Documents que vous déposez : pièce d’identité ou permis, carte AVS, coordonnées bancaires, certificat médical', 'Contrat de travail, salaire, assurances sociales, absences', 'Pendant l’emploi, puis supprimés sauf obligation légale de les garder (règle interne)'],
  ],
  es: [
    ['Nombre, puesto, idioma, código personal (cifrado)', 'Abrir su sesión y sus permisos', 'Durante el empleo'],
    ['Horas de entrada y salida', 'Registro obligatorio del tiempo de trabajo (LTr art. 46, OLT 1 art. 73) y salario', '5 años mínimo (OLT 1 art. 73 ap. 2)'],
    ['Apto / no apto del día', 'Seguridad alimentaria (higiene del personal, BPHR)', '2 años (regla interna)'],
    ['Sus acciones firmadas: registros, limpiezas, recepciones, lotes, incidentes', 'Autocontrol HACCP obligatorio (ODAlOUs)', '2 años (regla interna)'],
    ['Cuenta en su teléfono (si le invitan): correo, contraseña cifrada', 'Acceso a su espacio de Empleado (planificación, horas, documentos)', 'Durante el empleo'],
    ['Documentos que usted sube: documento de identidad o permiso, tarjeta AVS, datos bancarios, certificado médico', 'Contrato de trabajo, salario, seguros sociales, ausencias', 'Durante el empleo; después se borran salvo obligación legal de conservarlos (regla interna)'],
  ],
  en: [
    ['First name, role, language, personal code (encrypted)', 'Open your session and rights', 'During employment'],
    ['Clock-in and clock-out times', 'Mandatory working-time records (LTr art. 46, OLT 1 art. 73) and pay', 'At least 5 years (OLT 1 art. 73 para. 2)'],
    ['Fit / not fit for the day', 'Food safety (staff hygiene, BPHR)', '2 years (internal rule)'],
    ['Your signed actions: readings, cleaning, deliveries, batches, incidents', 'Mandatory HACCP self-checks (ODAlOUs)', '2 years (internal rule)'],
    ['Account on your phone (if invited): e-mail, encrypted password', 'Access to your Employee space (schedule, hours, documents)', 'During employment'],
    ['Documents you upload: ID or residence permit, AVS card, bank details, medical certificate', 'Employment contract, pay, social insurance, absences', 'During employment, then deleted unless the law requires keeping them (internal rule)'],
  ],
};

export function privacyNotice(lang: L, c: Controller) {
  return {
    title: T.title[lang], intro: T.intro[lang], ack: T.ack[lang], cols: T.cols[lang],
    sections: [
      { title: T.who[lang], text: `${c.name} · ${c.responsable} · ${c.address} · ${c.email} · ${c.phone}` },
      { title: T.data[lang], rows: ROWS[lang] },
      { title: T.health[lang], text: T.healthText[lang] },
      { title: T.access[lang], text: T.accessText[lang] },
      { title: T.rights[lang], text: T.rightsText[lang] },
    ] as NoticeSection[],
  };
}

export const CONTROLLER: Controller = { name: "Original's Completos", responsable: 'Orlando Quispe Oscco', address: 'Bussigny', email: 'info@originalscompletos.ch', phone: '078 352 12 02' };
