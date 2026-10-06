// Normalización de texto y filtro de palabrotas

const NUMS: Record<string, string> = {
  cero: '0', un: '1', uno: '1', una: '1', dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6',
  siete: '7', ocho: '8', nueve: '9', diez: '10', once: '11', doce: '12', trece: '13', catorce: '14',
  quince: '15', dieciseis: '16', diecisiete: '17', dieciocho: '18', diecinueve: '19', veinte: '20',
  treinta: '30', cuarenta: '40', cincuenta: '50', cien: '100', ciento: '100', mil: '1000',
};

const STOP = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'en', 'y', 'a', 'al', 'lo']);

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Normaliza una respuesta para compararla: minúsculas, sin tildes, sin artículos, números en cifra */
export function normalize(s: string): string {
  const base = stripAccents(String(s).toLowerCase())
    .replace(/(\d)[.,](?=\d{3}\b)/g, '$1') // 1.000 -> 1000
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => NUMS[w] ?? w)
    .filter((w) => !STOP.has(w));
  return base.join(' ').trim();
}

/** ¿La respuesta escrita coincide con la verdad (o alguno de sus alias)? */
export function matchesTruth(text: string, answer: string, alias: string[] = []): boolean {
  const n = normalize(text);
  if (!n) return false;
  const cands = [answer, ...alias].map(normalize).filter(Boolean);
  return cands.some((c) => c === n || singular(c) === singular(n));
}

function singular(s: string): string {
  return s
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('es') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ');
}

// Raíces de palabras malsonantes/insultos en español (se compara palabra a palabra, sin tildes).
// Lista deliberadamente prudente para un juego familiar; ampliable.
const BAD_ROOTS = [
  'puta', 'puto', 'putas', 'putos', 'putada', 'hostia', 'ostia', 'joder', 'jodid', 'cabron', 'cabrona', 'gilipoll',
  'imbecil', 'idiota', 'subnormal', 'mierda', 'cojon', 'coño', 'cono', 'polla', 'pollas', 'follar', 'folla',
  'zorra', 'maricon', 'marica', 'mamon', 'capullo', 'pendejo', 'chingad', 'verga', 'culero', 'culiao',
  'tonto', 'tonta', 'estupid', 'retrasad', 'mongol', 'gordo de mierda', 'sexo', 'sexual', 'porno', 'tetas',
  'pene', 'vagina', 'nazi', 'hitler', 'droga', 'cocaina', 'porros', 'porro', 'borracho', 'matar', 'suicid',
  'violar', 'viola', 'fuck', 'shit', 'bitch', 'dick', 'pussy', 'nigga', 'nigger', 'whore', 'bastard',
];
// Coincidencias exactas de palabra (para evitar falsos positivos tipo "computadora" / "disputa")
const BAD_EXACT = new Set(['puta', 'puto', 'putas', 'putos', 'coño', 'cono', 'polla', 'pollas', 'viola', 'pene', 'porro', 'porros', 'tonto', 'tonta', 'marica', 'zorra', 'folla', 'dick']);

export function isOffensive(text: string): boolean {
  const words = stripAccents(String(text).toLowerCase()).replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter(Boolean);
  // también detectar letras repetidas o separadas: "p u t a"
  const joined = words.join('');
  for (const w of words) {
    if (BAD_EXACT.has(w)) return true;
    for (const r of BAD_ROOTS) {
      if (BAD_EXACT.has(r)) continue;
      if (r.length >= 5 && w.startsWith(r)) return true;
      if (w === r) return true;
    }
  }
  for (const r of ['puta', 'gilipoll', 'cabron', 'mierda', 'joder', 'hostia', 'fuck']) {
    if (joined.includes(r) && words.length > 1 && !words.some((w) => w.includes(r))) return true;
  }
  return false;
}

/** Limpia la mentira escrita: recorta espacios, longitud máxima y primera letra minúscula/mayúscula como el original */
export function cleanLie(text: string, max = 40): string {
  return String(text).replace(/\s+/g, ' ').trim().slice(0, max);
}
