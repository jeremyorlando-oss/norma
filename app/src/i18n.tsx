// Traductions de l'interface tablette (D24) : français (source), espagnol, anglais.
// La clé est le texte français ; une clé absente reste en français (repli sûr).
import { createContext, useContext, type ReactNode } from 'react';
import { EN, ES } from './i18n.dict';

export type Lang = 'fr' | 'es' | 'en';
const DICTS: Record<Lang, Record<string, string>> = { fr: {}, es: ES, en: EN };

export type T = (fr: string, vars?: Record<string, string | number>) => string;
export const makeT = (lang: Lang): T => (fr, vars) => {
  let s = DICTS[lang][fr] ?? fr;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
};

const Ctx = createContext<{ t: T; lang: Lang }>({ t: makeT('fr'), lang: 'fr' });
export const LangProvider = ({ lang, children }: { lang: Lang; children: ReactNode }) =>
  <Ctx.Provider value={{ t: makeT(lang), lang }}>{children}</Ctx.Provider>;
export const useT = () => useContext(Ctx).t;
export const useLang = () => useContext(Ctx).lang;
export const LOCALE: Record<Lang, string> = { fr: 'fr-CH', es: 'es-ES', en: 'en-GB' };
