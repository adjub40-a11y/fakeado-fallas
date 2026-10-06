// Lógica del anfitrión: funciones puras que reciben el estado y devuelven el siguiente.
// El dispositivo anfitrión es la "autoridad" de la partida: valida mentiras, mezcla opciones y puntúa.

import type { GameState, HostSecret, Option, PlayerLevel, Question, RoomState, Settings } from './types';
import { cleanLie, isOffensive, matchesTruth, normalize } from './text';

export type Rand = () => number;

export const POINTS_TRUTH = 1000;
export const POINTS_FOOL = 500;

export function shuffle<T>(arr: T[], rand: Rand = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

export function defaultSettings(): Settings {
  return { rounds: 3, perRound: 3, timer: 'normal', cats: [], unlocked: false };
}

export function lieSeconds(s: Settings): number | null {
  return s.timer === 'sin' ? null : s.timer === 'relajado' ? 90 : 50;
}
export function voteSeconds(s: Settings): number | null {
  return s.timer === 'sin' ? null : s.timer === 'relajado' ? 45 : 25;
}

export function createRoom(code: string, hostId: string, hostPlays: boolean, now: number, settings: Settings = defaultSettings()): RoomState {
  return { code, hostId, hostPlays, status: 'lobby', createdAt: now, settings, players: {} };
}

/** Jugadores que participan (excluye al anfitrión si es solo pantalla) */
export function activePlayers(room: RoomState): string[] {
  return Object.keys(room.players || {})
    .filter((pid) => !!room.players[pid]?.name && (room.hostPlays || pid !== room.hostId))
    .sort((a, b) => (room.players[a].joinedAt ?? 0) - (room.players[b].joinedAt ?? 0));
}

export function youngestLevel(room: RoomState): PlayerLevel {
  const lv = activePlayers(room).map((p) => room.players[p].level);
  return (lv.length ? Math.min(...lv) : 4) as PlayerLevel;
}

/** Preguntas aptas para la sala según edad del más pequeño, categorías y si está desbloqueado */
export function questionPool(bank: Question[], room: RoomState): Question[] {
  const young = youngestLevel(room);
  const maxLvl = young >= 3 ? 3 : young; // adultos y teens: todo
  const cats = room.settings.cats;
  return bank.filter(
    (q) => q.lvl <= maxLvl && (cats.length === 0 || cats.includes(q.cat)) && (room.settings.unlocked || q.free),
  );
}

/**
 * Elige el orden de preguntas, evitando las ya vistas recientemente (seen) si es posible.
 * Si el más pequeño es Peques, solo nivel 1. Si hay Junior, se mezclan nivel 1 y 2.
 */
export function pickOrder(bank: Question[], room: RoomState, rand: Rand, seen: Set<string> = new Set()): string[] {
  const pool = questionPool(bank, room);
  const total = room.settings.rounds * room.settings.perRound;
  // Reparto equilibrado: una pregunta de cada tema por turnos, las no vistas primero
  const byCat = new Map<string, Question[]>();
  for (const q of pool) {
    if (!byCat.has(q.cat)) byCat.set(q.cat, []);
    byCat.get(q.cat)!.push(q);
  }
  for (const [c, list] of byCat) {
    const fresh = shuffle(list.filter((q) => !seen.has(q.id)), rand);
    const old = shuffle(list.filter((q) => seen.has(q.id)), rand);
    byCat.set(c, [...fresh, ...old]);
  }
  const out: Question[] = [];
  let cats = shuffle([...byCat.keys()], rand);
  while (out.length < total && cats.length) {
    for (const c of cats) {
      if (out.length >= total) break;
      const q = byCat.get(c)!.shift();
      if (q) out.push(q);
    }
    cats = shuffle(cats.filter((c) => byCat.get(c)!.length > 0), rand);
    // evita que la primera del nuevo turno repita el tema de la última
    if (cats.length > 1 && out.length && cats[0] === out[out.length - 1].cat) cats.push(cats.shift()!);
  }
  return out.map((q) => q.id);
}

export interface HostStep {
  room: RoomState;
  secret: HostSecret;
}

function multiplierFor(round: number, rounds: number): number {
  return round === rounds && rounds > 1 ? 2 : 1;
}

/** Empieza la partida: requiere al menos 2 jugadores activos (o 2 en modo pasa el móvil) */
export function startGame(room: RoomState, bank: Question[], now: number, rand: Rand, seen?: Set<string>): HostStep {
  const order = pickOrder(bank, room, rand, seen);
  if (order.length === 0) throw new Error('No hay preguntas disponibles para esta selección');
  const players = { ...room.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], score: 0 };
  const total = order.length;
  const base: RoomState = { ...room, players, status: 'playing', history: {} };
  const secret: HostSecret = { order, answer: '', alias: [], house: [], fact: '' };
  return loadQuestion({ room: base, secret }, bank, 1, total, now);
}

export function loadQuestion(step: HostStep, bank: Question[], qNum: number, total: number, now: number): HostStep {
  const { room, secret } = step;
  const id = secret.order[qNum - 1];
  const q = bank.find((x) => x.id === id);
  if (!q) throw new Error('Pregunta no encontrada: ' + id);
  const per = room.settings.perRound;
  const round = Math.min(room.settings.rounds, Math.ceil(qNum / per));
  const lieS = lieSeconds(room.settings);
  const game: GameState = {
    phase: 'lie',
    round,
    qNum,
    total,
    question: { id: q.id, cat: q.cat, q: q.q, kids: q.kids.length >= 3 ? q.kids.slice(0, 3) : [...q.kids, ...q.house].slice(0, 3) },
    deadline: lieS === null ? null : now + lieS * 1000,
    multiplier: multiplierFor(round, room.settings.rounds),
  };
  return {
    room: { ...room, game, lies: {}, votes: {}, rejects: {} },
    secret: { order: secret.order, answer: q.a, alias: q.alias, house: q.house, fact: q.fact },
  };
}

/** Revisa las mentiras recibidas: rechaza las que son la verdad o malsonantes */
export function validateLies(step: HostStep): HostStep {
  const { room, secret } = step;
  const lies = { ...(room.lies || {}) };
  const rejects = { ...(room.rejects || {}) };
  let changed = false;
  for (const [pid, entry] of Object.entries(lies)) {
    const text = cleanLie(entry?.text ?? '');
    if (!text) {
      delete lies[pid];
      changed = true;
      continue;
    }
    if (matchesTruth(text, secret.answer, secret.alias)) {
      delete lies[pid];
      rejects[pid] = 'truth';
      changed = true;
    } else if (isOffensive(text)) {
      delete lies[pid];
      rejects[pid] = 'bad';
      changed = true;
    }
  }
  if (!changed) return step;
  return { room: { ...room, lies, rejects }, secret };
}

export function allLiesIn(room: RoomState): boolean {
  const lies = room.lies || {};
  return activePlayers(room).every((pid) => !!lies[pid]);
}

export function allVotesIn(room: RoomState): boolean {
  const votes = room.votes || {};
  return activePlayers(room).every((pid) => !!votes[pid] || !canVote(room, pid));
}

/** Un jugador puede votar si hay al menos una opción que no es suya */
export function canVote(room: RoomState, pid: string): boolean {
  const opts = room.game?.options || [];
  return opts.length > 0;
}

/** Pasa a votación: agrupa mentiras iguales, añade la verdad y mentiras de la casa, y baraja */
export function toVote(step: HostStep, now: number, rand: Rand): HostStep {
  const { room, secret } = step;
  if (!room.game) return step;
  const groups = new Map<string, { text: string; authors: string[] }>();
  const lies = room.lies || {};
  const active = new Set(activePlayers(room));
  for (const pid of activePlayers(room)) {
    const e = lies[pid];
    if (!e || !active.has(pid)) continue;
    const text = cleanLie(e.text);
    if (!text || matchesTruth(text, secret.answer, secret.alias) || isOffensive(text)) continue;
    const key = normalize(text);
    const g = groups.get(key);
    if (g) g.authors.push(pid);
    else groups.set(key, { text, authors: [pid] });
  }
  // mentiras de la casa: 1 siempre; 2 si hay pocas mentiras de jugadores
  const wantHouse = groups.size <= 2 ? 2 : 1;
  let added = 0;
  for (const h of shuffle(secret.house, rand)) {
    if (added >= wantHouse) break;
    const key = normalize(h);
    if (!key || groups.has(key) || matchesTruth(h, secret.answer, secret.alias)) {
      const g = groups.get(key);
      if (g && !g.authors.includes('house')) g.authors.push('house');
      continue;
    }
    groups.set(key, { text: h, authors: ['house'] });
    added++;
  }
  const entries: { text: string; authors: string[]; truth?: boolean }[] = [...groups.values()];
  entries.push({ text: secret.answer, authors: [], truth: true });
  const shuffled = shuffle(entries, rand);
  const options: Option[] = [];
  const authors: Record<string, string[]> = {};
  let truthId = '';
  shuffled.forEach((e, i) => {
    const id = 'o' + i;
    options.push({ id, text: e.text });
    authors[id] = e.authors;
    if (e.truth) truthId = id;
  });
  const vs = voteSeconds(room.settings);
  const game: GameState = { ...room.game, phase: 'vote', options, deadline: vs === null ? null : now + vs * 1000 };
  return { room: { ...room, game, votes: {} }, secret: { ...secret, authors, truthId } };
}

/** Opciones de las que es autor un jugador (no puede votarlas) */
export function ownOptions(authors: Record<string, string[]> | undefined, pid: string): string[] {
  if (!authors) return [];
  return Object.keys(authors).filter((o) => authors[o].includes(pid));
}

/** Calcula puntos y pasa a la revelación */
export function toReveal(step: HostStep): HostStep {
  const { room, secret } = step;
  if (!room.game || !secret.authors || !secret.truthId) return step;
  const m = room.game.multiplier;
  const gained: Record<string, number> = {};
  const votes = room.votes || {};
  const active = new Set(activePlayers(room));
  for (const pid of active) gained[pid] = 0;
  for (const [voter, opt] of Object.entries(votes)) {
    if (!active.has(voter)) continue;
    const auth = secret.authors[opt] || [];
    if (auth.includes(voter)) continue; // no se puede votar la propia
    if (opt === secret.truthId) {
      gained[voter] += POINTS_TRUTH * m;
    } else if (secret.authors[opt]) {
      for (const a of auth) if (a !== 'house' && active.has(a)) gained[a] = (gained[a] ?? 0) + POINTS_FOOL * m;
    }
  }
  const players = { ...room.players };
  for (const [pid, g] of Object.entries(gained)) {
    if (players[pid]) players[pid] = { ...players[pid], score: (players[pid].score || 0) + g };
  }
  const reveal = { truthId: secret.truthId, answer: secret.answer, fact: secret.fact, authors: secret.authors, gained };
  const game: GameState = { ...room.game, phase: 'reveal', deadline: null, reveal };
  const history = { ...(room.history || {}), ['q' + room.game.qNum]: { reveal, votes: { ...votes } } };
  return { room: { ...room, players, game, history }, secret };
}

/** Tras la revelación: marcador de ronda, siguiente pregunta o final */
export function next(step: HostStep, bank: Question[], now: number): HostStep {
  const { room } = step;
  const g = room.game;
  if (!g) return step;
  if (g.phase === 'reveal') {
    if (g.qNum >= g.total) {
      return { room: { ...room, status: 'ended', game: { ...g, phase: 'final', deadline: null } }, secret: step.secret };
    }
    if (g.qNum % room.settings.perRound === 0) {
      return { room: { ...room, game: { ...g, phase: 'scores', deadline: null } }, secret: step.secret };
    }
    return loadQuestion(step, bank, g.qNum + 1, g.total, now);
  }
  if (g.phase === 'scores') return loadQuestion(step, bank, g.qNum + 1, g.total, now);
  return step;
}

/** Avance automático según tiempo y respuestas recibidas. Devuelve null si no hay cambios. */
export function tick(step: HostStep, bank: Question[], now: number, rand: Rand): HostStep | null {
  const { room } = step;
  const g = room.game;
  if (!g || room.status !== 'playing') return null;
  const expired = g.deadline != null && now >= g.deadline;
  if (g.phase === 'lie') {
    const v = validateLies(step);
    if (allLiesIn(v.room) || expired) return toVote(v, now, rand);
    return v === step ? null : v;
  }
  if (g.phase === 'vote') {
    if (allVotesIn(room) || expired) return toReveal(step);
  }
  return null;
}

/** Ranking ordenado */
export function ranking(room: RoomState): { pid: string; name: string; avatar: string; score: number }[] {
  return activePlayers(room)
    .map((pid) => ({ pid, name: room.players[pid].name, avatar: room.players[pid].avatar, score: room.players[pid].score || 0 }))
    .sort((a, b) => b.score - a.score);
}

/** Premios del resumen final */
export function awards(room: RoomState) {
  const history = Object.values(room.history || {});
  const fooled: Record<string, number> = {};
  const wrong: Record<string, number> = {};
  for (const h of history) {
    for (const [voter, opt] of Object.entries(h.votes)) {
      if (opt === h.reveal.truthId) continue;
      wrong[voter] = (wrong[voter] ?? 0) + 1;
      const auth = h.reveal.authors?.[opt] || [];
      if (auth.includes(voter)) continue;
      for (const a of auth) if (a !== 'house') fooled[a] = (fooled[a] ?? 0) + 1;
    }
  }
  const act = activePlayers(room);
  const best = act.slice().sort((a, b) => (fooled[b] ?? 0) - (fooled[a] ?? 0))[0];
  const hardest = act.slice().sort((a, b) => (wrong[a] ?? 0) - (wrong[b] ?? 0))[0];
  return {
    bestLiar: best && (fooled[best] ?? 0) > 0 ? { pid: best, n: fooled[best] } : null,
    hardestToFool: hardest ? { pid: hardest, n: wrong[hardest] ?? 0 } : null,
  };
}
