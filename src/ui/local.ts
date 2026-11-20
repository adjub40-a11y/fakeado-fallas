import { T } from '../i18n';
// Datos guardados en el dispositivo: perfil, preferencias y preguntas ya vistas
import type { PlayerLevel } from '../engine/types';

export interface Profile {
  name: string;
  avatar: string;
  level: PlayerLevel;
}

export const AVATARS = ['👑', '🎖️', '👸', '🧒', '☕', '🎟️', '🎉', '🧨', '🎨', '🎺', '💰', '📜', '🥘', '🍩', '💐', '🚒', '🥁', '🔥', '📸', '💡', '🪅', '🎭', '🎤', '🧹'];
/** Nombre de cada personaje fallero (se muestra al elegirlo) */
export const AVATAR_NAMES: Record<string, string> = {
  '👑': T('Fallera Mayor'),
  '🎖️': T('Presidente'),
  '👸': T('FM Infantil'),
  '🧒': T('Presidente infantil'),
  '☕': T('El del bar'),
  '🎟️': T('El de la lotería'),
  '🎉': T('El de festejos'),
  '🧨': 'Pirotècnic',
  '🎨': T('Artista faller'),
  '🎺': T('El de la banda'),
  '💰': 'Tresorer',
  '📜': 'Secretari',
  '🥘': T('El de la paella'),
  '🍩': 'Bunyolera',
  '💐': "L'Ofrena",
  '🚒': 'Bomber',
  '🥁': 'Tabaleter',
  '🔥': 'Cremador',
  '📸': 'Fotògraf',
  '💡': 'El de les llums',
  '🪅': T('Delegada infantil'),
  '🎭': T('El ninot'),
  '🎤': T('El de la verbena'),
  '🧹': T('El que escombra'),
};

export const LEVELS: { value: PlayerLevel; label: string; hint: string }[] = [
  { value: 1, label: T('Peques'), hint: T('6 a 8 años · eliges la mentira, sin escribir') },
  { value: 2, label: 'Junior', hint: T('9 a 12 años') },
  { value: 3, label: 'Teen', hint: T('13 a 16 años') },
  { value: 4, label: T('Adulto'), hint: T('17 o más') },
];

function read<T>(k: string, def: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : def;
  } catch {
    return def;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* sin almacenamiento disponible */
  }
}

export const getProfile = () => read<Profile | null>('fakeado.profile', null);
export const saveProfile = (p: Profile) => write('fakeado.profile', p);

export interface Prefs {
  sound: boolean;
  music?: boolean;
  /** bromas de casal (premio del xupito al ganador) */
  bromes?: boolean;
}
export const getPrefs = () => ({ music: true, bromes: true, ...read<Prefs>('fakeado.prefs', { sound: true, music: true, bromes: true }) });
export const savePrefs = (p: Prefs) => write('fakeado.prefs', p);

export function getSeen(): Set<string> {
  return new Set(read<string[]>('fakeado.seen', []));
}
export function addSeen(ids: string[]) {
  const all = [...read<string[]>('fakeado.seen', []), ...ids];
  write('fakeado.seen', all.slice(-400));
}

/** Última sala a la que se unió este dispositivo (para volver tras cerrar la app) */
export const getLastRoom = () => read<{ code: string; at: number } | null>('fakeado.lastRoom', null);
export const setLastRoom = (code: string | null) => write('fakeado.lastRoom', code ? { code, at: Date.now() } : null);
