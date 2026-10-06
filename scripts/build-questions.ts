// Compila src/data/raw/*.txt -> src/data/questions.json y valida cada pregunta.
// Uso: node scripts/build-questions.ts
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { matchesTruth, normalize, isOffensive } from '../src/engine/text.ts';
import { CATEGORIES } from '../src/data/categories.ts';

const RAW = join(import.meta.dirname, '../src/data/raw');
const OUT = join(import.meta.dirname, '../src/data/questions.json');



const isNum = (s: string) => /^[\d.,]+$/.test(s.trim());

// ---------- Preguntas generadas desde la base de datos histórica ----------
const H = JSON.parse(readFileSync(join(import.meta.dirname, '../src/data/historia.json'), 'utf8'));
const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'i', 'di']);
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
function pick<T>(arr: T[], n: number, ok: (x: T) => boolean): T[] {
  const pool = arr.filter(ok);
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}
const lastWord = (name: string) => name.trim().split(/\s+/).at(-1)!;
const usable = (name: string) => {
  const w = name.trim().split(/\s+/);
  return w.length >= 3 && !PARTICLES.has(w.at(-1)!.toLowerCase()) && w.at(-1)!.length >= 3 && !/ y [A-ZÁÉÍÓÚ][a-záéíóú]+ [A-ZÁÉÍÓÚ]/.test(name.replace(/^.* y (Planells|Trénor|Albarca|Dupu|de Más).*$/, ''));
};
const extra: Record<string, string[]> = {};
const add = (cat: string, line: string) => (extra[cat] ??= []).push(line);
const allSurnames: string[] = [...H.fallerasMayores, ...H.fallerasMayoresInfantiles].map((x: any) => lastWord(x.nom)).filter((w: string) => w.length >= 4 && !PARTICLES.has(w.toLowerCase()));

function personQs(list: any[], label: string, other: any[], otherLabel: string, maxYear: number) {
  for (const e of list) {
    const y = Number(e.any.slice(0, 4));
    if (y > maxYear || e.any === '1932' || !usable(e.nom)) continue;
    const ans = lastWord(e.nom);
    const prefix = e.nom.trim().split(/\s+/).slice(0, -1).join(' ');
    const used = new Set<string>();
    const lies = pick([...new Map(allSurnames.map((w) => [normalize(w), w])).values()], 3, (w: string) => normalize(w) !== normalize(ans) && !e.nom.includes(w) && !used.has(normalize(w)));
    const twin = other.find((o: any) => o.nom === e.nom);
    const fact = `${e.nom} fue ${label} en ${e.any.replace('-', ' y ')}.` + (twin ? ` También fue ${otherLabel} en ${twin.any}.` : '');
    add('falleras', `3 | La ${label} de ${e.any} fue ${prefix} ___ | ${ans} | - | ${lies.join(';')} | - | ${fact}`);
  }
}
personQs(H.fallerasMayores, 'Fallera Mayor de Valencia', H.fallerasMayoresInfantiles, 'Fallera Mayor Infantil de Valencia', 2026);
// Infantiles: solo las que hoy ya son mayores de edad
personQs(H.fallerasMayoresInfantiles, 'Fallera Mayor Infantil de Valencia', H.fallerasMayores, 'Fallera Mayor de Valencia', 2018);

const TOTALS: Record<string, number> = {};
for (const p of H.primerPremioEspecial) TOTALS[p.falla] = (TOTALS[p.falla] ?? 0) + 1;
const SHOW_TOTAL = new Set(['Convento Jerusalén', 'Plaza del Pilar', 'Na Jordana', 'Nou Campanar', "L'Antiga de Campanar"]);
const winners = Object.keys(TOTALS);
for (const p of H.primerPremioEspecial) {
  const lies = pick(winners, 3, (w: string) => w !== p.falla);
  const alias = (H.aliasFallas[p.falla] || []).join(';') || '-';
  const fact = `${p.falla} ganó el primer premio de Sección Especial en ${p.any}.` + (SHOW_TOTAL.has(p.falla) ? ` Suma ${TOTALS[p.falla]} primeros premios en total.` : '');
  add('premios', `3 | En ${p.any}, el primer premio de la Sección Especial fue para la falla ___ | ${p.falla} | ${alias} | ${lies.join(';')} | - | ${fact}`);
}

// Ninots indultats (fallas grandes)
const NIN_TOTAL: Record<string, number> = {};
for (const n of H.ninotIndultat) NIN_TOTAL[n.falla] = (NIN_TOTAL[n.falla] ?? 0) + 1;
const ninFallas = Object.keys(NIN_TOTAL);
for (const n of H.ninotIndultat) {
  const lies = pick(ninFallas, 3, (w: string) => w !== n.falla);
  const alias = (H.aliasFallas[n.falla] || []).join(';') || '-';
  const tot = NIN_TOTAL[n.falla];
  const fact = `El ninot indultat de ${n.any} fue de ${n.falla}.` + (tot > 1 ? ` Esta comisión ha logrado el indulto ${tot} veces según el histórico de Junta Central Fallera (desde 1940).` : '');
  add('monumentos', `3 | En ${n.any}, el ninot indultat de las fallas grandes fue de la falla ___ | ${n.falla} | ${alias} | ${lies.join(';')} | - | ${fact}`);
}

// Fallas municipales: solo los años con un único artista
function municipalQs(list: any[], label: string) {
  const single = (a: string) => !/,| y |Varios|Hermanos/.test(a);
  const artists = [...new Set(list.map((m: any) => m.artista).filter(single))] as string[];
  for (const m of list) {
    if (!single(m.artista)) continue;
    const years = list.filter((x: any) => x.artista === m.artista).map((x: any) => x.any).sort();
    const lies = pick(artists, 3, (w: string) => w !== m.artista);
    const lema = m.lema ? `, «${m.lema}»,` : '';
    const fact = `${m.artista} hizo la ${label} en ${years.length > 1 ? years.slice(0, -1).join(', ') + ' y ' + years.at(-1) : years[0]}.`;
    add('monumentos', `3 | La ${label} de ${m.any}${lema} la hizo el artista ___ | ${m.artista} | - | ${lies.join(';')} | - | ${fact}`);
  }
}
municipalQs(H.fallaMunicipal, 'falla municipal del Ayuntamiento');
municipalQs(H.fallaMunicipalInfantil, 'falla municipal infantil');

// "La meua falla" se genera en la app (src/ui/meua.ts) con los datos que guarda cada comisión
const errors: string[] = [];
const all: any[] = [];
const seenQ = new Set<string>();

const files = readdirSync(RAW).filter((f) => f.endsWith('.txt'));
const cats = [...new Set([...files.map((f) => f.replace('.txt', '')), ...Object.keys(extra)])].sort();
for (const cat of cats) {
  const file = cat + '.txt';
  const meta = CATEGORIES[cat];
  if (!meta) {
    errors.push(`${file}: categoría desconocida`);
    continue;
  }
  const lines = [...(files.includes(file) ? readFileSync(join(RAW, file), 'utf8').split('\n') : []), ...(extra[cat] || [])];
  let n = 0;
  const perLvl: Record<number, number> = {};
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    let f = t.split('|').map((x) => x.trim());
    if (f.length === 8 && f[5] === '-' && f[6] === '-') f = [...f.slice(0, 5), '-', f[7]];
    const where = `${file}:${i + 1}`;
    if (f.length !== 7) return errors.push(`${where}: ${f.length} campos (deben ser 7)`);
    const [lv, q, a, alias, house, kids, fact] = f;
    const lvl = Number(lv);
    if (![1, 2, 3].includes(lvl)) errors.push(`${where}: nivel inválido`);
    if (!q.includes('___')) errors.push(`${where}: falta ___ en la pregunta`);
    if (q.split('___').length !== 2) errors.push(`${where}: más de un hueco`);
    if (!a) errors.push(`${where}: sin respuesta`);
    if (a.split(' ').length > 4) errors.push(`${where}: respuesta demasiado larga "${a}"`);
    const aliasL = alias === '-' || !alias ? [] : alias.split(';').map((x) => x.trim()).filter(Boolean);
    const houseL = house.split(';').map((x) => x.trim()).filter(Boolean);
    const kidsL = kids === '-' || !kids ? [] : kids.split(';').map((x) => x.trim()).filter(Boolean);
    if (houseL.length < 2) errors.push(`${where}: necesita al menos 2 mentiras de la casa`);
    if (lvl === 1 && kidsL.length !== 3) errors.push(`${where}: nivel 1 necesita 3 mentiras peques (${kidsL.length})`);
    if (!fact || fact === '-') errors.push(`${where}: falta dato curioso`);
    for (const l of [...houseL, ...kidsL]) {
      if (matchesTruth(l, a, aliasL)) errors.push(`${where}: la mentira "${l}" coincide con la verdad`);
      if (isOffensive(l)) errors.push(`${where}: mentira malsonante "${l}"`);
    }
    if (isNum(a) !== houseL.every(isNum)) errors.push(`${where}: formato número/palabra distinto entre verdad "${a}" y casa ${houseL.join(',')}`);
    if (new Set(houseL.map(normalize)).size !== houseL.length) errors.push(`${where}: casa repetida`);
    const key = normalize(q);
    if (seenQ.has(key)) errors.push(`${where}: pregunta repetida`);
    seenQ.add(key);
    n++;
    perLvl[lvl] = (perLvl[lvl] ?? 0) + 1;
    all.push({
      id: `${meta.prefix}-${String(n).padStart(3, '0')}`,
      cat,
      lvl,
      q,
      a,
      alias: aliasL,
      house: houseL,
      kids: kidsL,
      fact,
      // ~1 de cada 3 por nivel gratis
      free: lvl === 1 ? perLvl[lvl] % 2 === 1 : perLvl[lvl] % 3 === 1,
    });
  });
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} errores`);
  process.exit(1);
}
writeFileSync(OUT, JSON.stringify(all));
const by = (k: string) => all.reduce((m: any, q: any) => ((m[q[k]] = (m[q[k]] ?? 0) + 1), m), {});
console.log(`${all.length} preguntas · gratis ${all.filter((q) => q.free).length}`);
console.log('por nivel', by('lvl'));
console.log('por categoría', by('cat'));
