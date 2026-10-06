// "La meua falla": cargos y preguntas propias de una comisión, guardados en el dispositivo.
// Se convierten en preguntas del tema "La meua falla" (aptas para peques y gratis).
import historia from '../data/historia.json';
import type { Question } from '../engine/types';
import { matchesTruth, normalize } from '../engine/text';

export interface Cargo {
  cargo: string;
  nom: string;
}
export interface PreguntaPropia {
  q: string; // con ___
  a: string;
  lies: string[];
}
export interface MeuaFalla {
  falla: string;
  ejercicio: string;
  cargos: Cargo[];
  preguntas: PreguntaPropia[];
}

export const CARGOS = ['Fallera Mayor', 'Presidente', 'Presidenta', 'Fallera Mayor Infantil', 'Presidente Infantil', 'Presidenta Infantil'];

const KEY = 'fakeado.meua';
const DEFAULT: MeuaFalla = {
  falla: (historia as any).meuaFalla?.falla ?? '',
  ejercicio: (historia as any).meuaFalla?.ejercicio ?? String(new Date().getFullYear()),
  cargos: (historia as any).meuaFalla?.cargos ?? [],
  preguntas: [],
};

export function getMeua(): MeuaFalla {
  try {
    const v = localStorage.getItem(KEY);
    if (v) return { ...DEFAULT, ...JSON.parse(v) };
  } catch {
    /* sin almacenamiento */
  }
  return DEFAULT;
}
export function saveMeua(m: MeuaFalla) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* sin almacenamiento */
  }
}

const FAKE_SURNAMES = ['Ferrer Soler', 'Navarro Gil', 'Martí Peris', 'Sanchis Roig', 'Llopis Climent', 'Ballester Vidal', 'Tormo Puchades'];
const KIDS = ['Bunyol', 'Petardet', 'Ninot', 'Traca', 'Carabassa'];

function articleFor(cargo: string) {
  return /^(Fallera|Presidenta)/.test(cargo) ? 'la' : 'el';
}

export function meuaQuestions(m: MeuaFalla = getMeua()): Question[] {
  const out: Question[] = [];
  if (!m.falla.trim()) return out;
  m.cargos.forEach((c, i) => {
    const w = c.nom.trim().split(/\s+/);
    if (w.length < 2 || !c.cargo) return;
    const answer = w.slice(1).join(' ');
    const house = FAKE_SURNAMES.filter((s) => !matchesTruth(s, answer)).slice(i % 3, (i % 3) + 3);
    out.push({
      id: `MEU-C${i}`,
      cat: 'meua',
      lvl: 1,
      q: `En ${m.ejercicio}, ${articleFor(c.cargo)} ${c.cargo.toLowerCase()} de la falla ${m.falla} es ${w[0]} ___`,
      a: answer,
      alias: w.length > 2 ? [w[1]] : [],
      house,
      kids: KIDS.slice(i % 2, (i % 2) + 3),
      fact: `${c.nom} es ${c.cargo.toLowerCase()} de ${m.falla} en el ejercicio ${m.ejercicio}.`,
      free: true,
    });
  });
  m.preguntas.forEach((p, i) => {
    if (!p.q.includes('___') || !p.a.trim()) return;
    const lies = p.lies.map((l) => l.trim()).filter((l) => l && !matchesTruth(l, p.a));
    const house = lies.length >= 2 ? lies : [...lies, 'nadie lo sabe', 'otra cosa'].slice(0, 2);
    out.push({
      id: `MEU-P${i}`,
      cat: 'meua',
      lvl: 1,
      q: p.q.trim(),
      a: p.a.trim(),
      alias: [],
      house,
      kids: [...lies, ...KIDS].filter((x, j, arr) => arr.findIndex((y) => normalize(y) === normalize(x)) === j).slice(0, 3),
      fact: `Pregunta de la falla ${m.falla}.`,
      free: true,
    });
  });
  return out;
}
