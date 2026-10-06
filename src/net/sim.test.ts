// Simulación de una partida online con 1 anfitrión-pantalla y 3 móviles sobre una base de datos
// en memoria que imita Realtime Database (rutas, borrado de nulos y vacíos).
import { describe, expect, it } from 'vitest';
import bank from '../data/questions.json';
import type { HostSecret, Question, RoomState } from '../engine/types';
import * as H from '../engine/host';
import { cleanRemote, diffPaths } from './conn';
import { LocalRoom } from './local';

type Tree = Record<string, any>;
function prune(v: any): any {
  if (v === null || v === undefined) return undefined;
  if (Array.isArray(v)) {
    const a = v.map(prune).filter((x) => x !== undefined);
    return a.length ? a : undefined;
  }
  if (typeof v === 'object') {
    const o: Tree = {};
    for (const [k, x] of Object.entries(v)) {
      const p = prune(x);
      if (p !== undefined) o[k] = p;
    }
    return Object.keys(o).length ? o : undefined;
  }
  return v;
}
class FakeDb {
  root: Tree = {};
  subs: ((v: any) => void)[] = [];
  set(path: string, val: any) {
    const parts = path.split('/');
    let cur = this.root;
    for (const p of parts.slice(0, -1)) cur = cur[p] ??= {};
    cur[parts.at(-1)!] = JSON.parse(JSON.stringify(val ?? null));
    this.root = prune(this.root) ?? {};
  }
  update(base: string, u: Record<string, unknown>) {
    for (const [k, v] of Object.entries(u)) this.set(base + '/' + k, v);
    this.emit();
  }
  get(path: string) {
    return path.split('/').reduce((c: any, p) => (c == null ? undefined : c[p]), this.root);
  }
  emit() {
    const v = JSON.parse(JSON.stringify(this.root));
    this.subs.forEach((s) => s(v));
  }
}

describe('partida online simulada', () => {
  it('3 jugadores + pantalla: de principio a fin, con lag y estado limpio', () => {
    const db = new FakeDb();
    const code = 'ABCD';
    const room0 = H.createRoom(code, 'host', false, 0, { ...H.defaultSettings(), unlocked: true });
    db.update('rooms', { [code]: room0 });
    for (const [i, pid] of ['u1', 'u2', 'u3'].entries()) {
      db.update(`rooms/${code}/players`, { [pid]: { name: 'J' + i, avatar: '🦊', level: i === 0 ? 2 : 4, score: 0, joinedAt: i, online: true } });
    }
    const read = () => cleanRemote(db.get(`rooms/${code}`))!;
    let secret: HostSecret | null = null;
    const hostWrite = (prev: RoomState, next: RoomState) => db.update(`rooms/${code}`, diffPaths(prev, next));

    // empezar
    let room = read();
    expect(H.activePlayers(room)).toEqual(['u1', 'u2', 'u3']);
    let step = H.startGame(room, bank as Question[], 1000, Math.random);
    secret = step.secret;
    hostWrite(room, step.room);
    // con un Junior, ninguna pregunta de nivel 3
    for (const id of secret.order) expect((bank as Question[]).find((q) => q.id === id)!.lvl).toBeLessThanOrEqual(2);

    let t = 2000;
    let guard = 0;
    const seenPhases = new Set<string>();
    while (guard++ < 500) {
      room = read();
      if (room.status === 'ended') break;
      const g = room.game!;
      seenPhases.add(g.phase);
      if (g.phase === 'lie') {
        // los clientes escriben (uno escribe la verdad la primera vez)
        for (const pid of ['u1', 'u2', 'u3']) {
          if (room.lies?.[pid]) continue;
          const text = pid === 'u2' && !room.rejects?.u2 && g.qNum === 1 ? secret!.answer : `mentira ${pid} ${g.qNum}`;
          if (room.rejects?.[pid]) db.update(`rooms/${code}`, { [`rejects/${pid}`]: null });
          db.update(`rooms/${code}`, { [`lies/${pid}`]: { text, at: t, q: g.qNum } });
        }
        // un voto rezagado de la pregunta anterior no debe contar
        db.update(`rooms/${code}`, { 'votes/u1': { o: 'o0', q: g.qNum - 1 } });
      } else if (g.phase === 'vote') {
        const opts = g.options!;
        for (const pid of ['u1', 'u2', 'u3']) {
          const own = new Set(opts.filter((o) => o.text === room.lies?.[pid]?.text).map((o) => o.id));
          const pick = opts.find((o) => !own.has(o.id))!;
          db.update(`rooms/${code}`, { [`votes/${pid}`]: { o: pick.id, q: g.qNum } });
        }
      }
      room = read();
      t += 500;
      const s = H.tick({ room, secret: secret! }, bank as Question[], t, Math.random);
      if (s) {
        secret = s.secret;
        hostWrite(room, s.room);
        continue;
      }
      if (g.phase === 'reveal' || g.phase === 'scores') {
        const n = H.next({ room, secret: secret! }, bank as Question[], t);
        secret = n.secret;
        hostWrite(room, n.room);
      }
    }
    room = read();
    expect(room.status).toBe('ended');
    expect(room.game!.phase).toBe('final');
    expect([...seenPhases].sort()).toEqual(['lie', 'reveal', 'scores', 'vote']);
    expect(Object.keys(room.history!).length).toBe(9);
    const total = Object.values(room.players).reduce((a, p) => a + p.score, 0);
    expect(total).toBeGreaterThan(0);
    // premios calculables
    expect(H.awards(room)).toBeTruthy();
    // volver a la sala: estado limpio
    const lobby: RoomState = { ...room, status: 'lobby', game: undefined, lies: {}, votes: {}, rejects: {}, history: {}, players: Object.fromEntries(Object.entries(room.players).map(([k, p]) => [k, { ...p, score: 0 }])) };
    hostWrite(room, lobby);
    const r2 = db.get(`rooms/${code}`);
    expect(r2.game).toBeUndefined();
    expect(r2.history).toBeUndefined();
    expect(r2.players.u1.score).toBe(0);
  });

  it('modo un solo móvil (sala local)', async () => {
    const conn = new LocalRoom({ ...H.defaultSettings(), timer: 'sin', unlocked: false });
    await conn.join('p0', { name: 'Papá', avatar: '🐻', level: 4, score: 0, joinedAt: 0 });
    await conn.join('p1', { name: 'Lía', avatar: '🦄', level: 1, score: 0, joinedAt: 1 });
    let room: RoomState | null = null;
    conn.subscribe((r) => (room = r));
    await Promise.resolve();
    let step = H.startGame(room!, bank as Question[], 0, Math.random);
    await conn.hostWrite(room!, step.room);
    await Promise.resolve();
    const r = room as unknown as RoomState;
    expect(r.game!.phase).toBe('lie');
    // con una peque: solo nivel 1, gratis, y con 3 mentiras peques
    const q = (bank as Question[]).find((x) => x.id === r.game!.question.id)!;
    expect(q.lvl).toBe(1);
    expect(q.free).toBe(true);
    expect(r.game!.question.kids.length).toBe(3);
    // la peque elige una sugerida, papá escribe
    await conn.submitLie('p1', r.game!.question.kids[0], 1);
    await conn.submitLie('p0', 'algo inventado', 1);
    await Promise.resolve();
    const s = H.tick({ room: room!, secret: step.secret }, bank as Question[], 1, Math.random)!;
    expect(s.room.game!.phase).toBe('vote');
  });
});

describe('banco de preguntas', () => {
  const b = bank as Question[];
  it('suficientes preguntas gratis para Peques', () => {
    expect(b.filter((q) => q.free && q.lvl === 1).length).toBeGreaterThanOrEqual(25);
  });
  it('ids únicos y todas con dato curioso', () => {
    expect(new Set(b.map((q) => q.id)).size).toBe(b.length);
    expect(b.every((q) => q.fact.length > 10)).toBe(true);
  });
});
