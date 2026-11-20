// Idioma de la interfaz: castellano (es) o valenciano (va).
// T('texto en castellano') devuelve la traducción si el idioma es valenciano.
// Variables: T('Pregunta {n} de {t}', { n: 1, t: 9 }).
import { VA } from './i18n-va';

export type Lang = 'es' | 'va';
const KEY = 'fallas.lang';

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'es' || saved === 'va') return saved;
  } catch {
    /* sin almacenamiento */
  }
  const nav = (typeof navigator !== 'undefined' && navigator.language) || '';
  return /^(ca|va)\b/i.test(nav) ? 'va' : 'es';
}

let lang: Lang = initial();
const listeners = new Set<(l: Lang) => void>();

export const getLang = () => lang;
export function setLang(l: Lang) {
  lang = l;
  try {
    localStorage.setItem(KEY, l);
    document.documentElement.lang = l === 'va' ? 'ca-ES-valencia' : 'es';
  } catch {
    /* sin almacenamiento */
  }
  listeners.forEach((f) => f(l));
}
export function onLangChange(f: (l: Lang) => void) {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

export function T(es: string, vars?: Record<string, string | number | undefined>): string {
  let s = lang === 'va' ? (VA[es] ?? es) : es;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  return s;
}

/** Elige entre dos textos ya escritos en cada idioma */
export const L = (es: string, va: string) => (lang === 'va' ? va : es);
