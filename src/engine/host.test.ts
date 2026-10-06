import { describe, expect, it } from 'vitest';
import * as H from './host';
import { isOffensive, matchesTruth, normalize } from './text';
import type { Question, RoomState } from './types';

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const bank: Question[] = Array.from({ length: 30 }, (_, i) => ({
  id: 'Q' + i,
  cat: ['animales', 'espacio', 'comida'][i % 3],
  lvl: ((i % 3) + 1) as 1 | 2 | 3,
  q: `Pregunta ${i} ___`,
  a: i === 0 ? 'tres' : 'verdad' + i,
  alias: i === 0 ? ['3'] : [],
  house: ['casa' + i + 'a', 'casa' + i + 'b'],
  kids: ['k1', 'k2', 'k3'],
  fact: 'dato ' + i,
  free: i % 2 === 0,
}));

function room(levels: (1 | 2 | 3 | 4)[], unlocked = true): RoomState {
  const r = H.createRoom('ABCD', 'p0', true, 0, { ...H.defaultSettings(), unlocked });
  levels.forEach((lv, i) => {
    r.players['p' + i] = { name: 'J' + i, avatar: '🦊', level: lv, score: 0, joinedAt: i };
  });
  return r;
}

describe('texto', () => {
  it('normaliza tildes, artículos y números', () => {
    expect(normalize('Los Tres Corazones')).toBe('3 corazones');
    expect(normalize('1.000')).toBe('1000');
    expect(matchesTruth('3', 'tres')).toBe(true);
    expect(matchesTruth('Tres', 'tres', ['3'])).toBe(true);
    expect(matchesTruth('cuatro', 'tres')).toBe(false);
    expect(matchesTruth('unicornios', 'el unicornio')).toBe(true);
  });
  it('filtra palabrotas sin falsos positivos comunes', () => {
    expect(isOffensive('eres un gilipollas')).toBe(true);
    expect(isOffensive('P U T A')).toBe(true);
    expect(isOffensive('computadora')).toBe(false);
    expect(isOffensive('disputa')).toBe(false);
    expect(isOffensive('cocodrilo')).toBe(false);
    expect(isOffensive('Japón')).toBe(false);
  });
});

describe('selección de preguntas', () => {
  it('con un peque solo salen preguntas de nivel 1', () => {
    const r = room([4, 1]);
    const pool = H.questionPool(bank, r);
    expect(pool.every((q) => q.lvl === 1)).toBe(true);
  });
  it('sin desbloquear solo salen gratuitas', () => {
    const r = room([4, 4], false);
    expect(H.questionPool(bank, r).every((q) => q.free)).toBe(true);
  });
  it('no repite preguntas en la partida', () => {
    const r = room([4, 4]);
    const o = H.pickOrder(bank, r, seeded(3));
    expect(new Set(o).size).toBe(o.length);
    expect(o.length).toBe(9);
  });
});

describe('partida completa', () => {
  it('flujo mentir → votar → revelar → puntos', () => {
    const rand = seeded(7);
    let r = room([4, 4, 3]);
    let st = H.startGame(r, bank, 1000, rand);
    expect(st.room.game?.phase).toBe('lie');
    expect(st.room.game?.deadline).toBe(1000 + 50000);
    // forzamos pregunta Q0 (respuesta "tres")
    st.secret.order[0] = 'Q0';
    st = H.loadQuestion(st, bank, 1, st.room.game!.total, 1000);
    // p0 escribe la verdad sin querer -> rechazada
    st.room.lies = { p0: { text: '3', at: 1 }, p1: { text: 'ocho', at: 1 } };
    let t = H.tick(st, bank, 2000, rand)!;
    expect(t.room.rejects?.p0).toBe('truth');
    expect(t.room.lies?.p0).toBeUndefined();
    st = t;
    st.room.lies = { ...st.room.lies, p0: { text: 'cinco', at: 2 }, p2: { text: 'Ocho', at: 2 } };
    t = H.tick(st, bank, 3000, rand)!;
    expect(t.room.game?.phase).toBe('vote');
    const opts = t.room.game!.options!;
    // ocho (p1 y p2 juntos), cinco, verdad, 2 de la casa (pocas mentiras) = 5
    expect(opts.length).toBe(5);
    const truth = t.secret.truthId!;
    const ocho = opts.find((o) => o.text.toLowerCase() === 'ocho')!.id;
    const cinco = opts.find((o) => o.text === 'cinco')!.id;
    expect(t.secret.authors![ocho].sort()).toEqual(['p1', 'p2']);
    st = t;
    // p0 acierta, p1 vota cinco (engañado por p0), p2 vota su propia (ignorado)
    st.room.votes = { p0: truth, p1: cinco, p2: ocho };
    t = H.tick(st, bank, 4000, rand)!;
    expect(t.room.game?.phase).toBe('reveal');
    expect(t.room.players.p0.score).toBe(1000 + 500);
    expect(t.room.players.p1.score).toBe(0);
    expect(t.room.players.p2.score).toBe(0);
    expect(t.room.game?.reveal?.answer).toBe('tres');
  });

  it('avanza por rondas y termina; la última ronda puntúa doble', () => {
    const rand = seeded(11);
    let st = H.startGame(room([4, 4]), bank, 0, rand);
    const seenPhases: string[] = [];
    let guard = 0;
    while (st.room.status !== 'ended' && guard++ < 200) {
      const g = st.room.game!;
      seenPhases.push(g.phase);
      if (g.phase === 'lie') st = H.tick(st, bank, g.deadline! + 1, rand)!;
      else if (g.phase === 'vote') {
        st.room.votes = { p0: st.secret.truthId!, p1: st.secret.truthId! };
        st = H.tick(st, bank, 0, rand)!;
      } else st = H.next(st, bank, 0);
    }
    expect(st.room.game?.phase).toBe('final');
    expect(seenPhases.filter((p) => p === 'scores').length).toBe(2);
    // 6 preguntas x1000 + 3 preguntas x2000 = 12000
    expect(st.room.players.p0.score).toBe(12000);
  });

  it('un jugador fantasma (solo "online") no cuenta', () => {
    const r = room([4, 4]);
    (r.players as any).ghost = { online: false };
    expect(H.activePlayers(r)).toEqual(['p0', 'p1']);
  });

  it('acertar la verdad puntúa aunque el secreto venga sin la lista vacía de autores', () => {
    const rand = seeded(9);
    let st = H.startGame(room([4, 4]), bank, 0, rand);
    st.room.lies = { p0: { text: 'aa', at: 0 }, p1: { text: 'bb', at: 0 } };
    st = H.toVote(st, 0, rand);
    const authors = { ...st.secret.authors! };
    delete authors[st.secret.truthId!]; // así vuelve de Realtime Database
    st = { room: { ...st.room, votes: { p0: st.secret.truthId! } }, secret: { ...st.secret, authors } };
    expect(H.toReveal(st).room.players.p0.score).toBe(1000);
  });

  it('el anfitrión solo-pantalla no cuenta como jugador', () => {
    const r = room([4, 4, 4]);
    r.hostPlays = false;
    expect(H.activePlayers(r)).toEqual(['p1', 'p2']);
  });

  it('las mentiras de la casa no puntúan y no duplican', () => {
    const rand = seeded(5);
    let st = H.startGame(room([4, 4]), bank, 0, rand);
    st.room.lies = { p0: { text: st.secret.house[0], at: 0 }, p1: { text: 'otra', at: 0 } };
    const t = H.toVote(st, 0, rand);
    const texts = t.room.game!.options!.map((o) => normalize(o.text));
    expect(new Set(texts).size).toBe(texts.length);
  });
});
