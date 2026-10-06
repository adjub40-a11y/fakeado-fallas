// Conexión multimóvil con Firebase Realtime Database + autenticación anónima
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth } from 'firebase/auth';
import {
  getDatabase, ref, onValue, set, update, get, remove, runTransaction, onDisconnect, serverTimestamp,
  type Database,
} from 'firebase/database';
import type { HostSecret, Player, RoomState, Settings } from '../engine/types';
import { cleanRemote, diffPaths, randomCode, type RoomConn } from './conn';
import { firebaseConfig, firebaseConfigured } from '../firebase-config';

let app: FirebaseApp | null = null;
let auth: Auth;
let db: Database;
let offset = 0;

export function isOnlineAvailable(): boolean {
  return firebaseConfigured();
}

async function ensure(): Promise<string> {
  if (!firebaseConfigured()) throw new Error('El juego online no está configurado.');
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
    onValue(ref(db, '.info/serverTimeOffset'), (s) => (offset = s.val() || 0));
  }
  if (auth.currentUser) return auth.currentUser.uid;
  await new Promise<void>((res) => {
    const off = onAuthStateChanged(auth, (u) => {
      if (u) {
        off();
        res();
      }
    });
    signInAnonymously(auth).catch(() => {
      /* el error se verá al usar la base de datos */
    });
  });
  return auth.currentUser!.uid;
}

class FirebaseRoom implements RoomConn {
  readonly local = false;
  private unsubs: (() => void)[] = [];
  constructor(readonly code: string, readonly myId: string, readonly isHost: boolean) {}

  subscribe(cb: (room: RoomState | null) => void) {
    const off = onValue(ref(db, `rooms/${this.code}`), (s) => cb(cleanRemote(s.val())));
    this.unsubs.push(off);
    return off;
  }
  async join(pid: string, p: Player) {
    const pref = ref(db, `rooms/${this.code}/players/${pid}`);
    const existing = (await get(pref)).val();
    await update(pref, {
      name: p.name,
      avatar: p.avatar,
      level: p.level,
      score: existing?.score ?? 0,
      joinedAt: existing?.joinedAt ?? Date.now() + offset,
      online: true,
    });
    onDisconnect(ref(db, `rooms/${this.code}/players/${pid}/online`)).set(false);
  }
  async submitLie(pid: string, text: string, qNum: number) {
    await set(ref(db, `rooms/${this.code}/lies/${pid}`), { text, at: serverTimestamp(), q: qNum });
  }
  async submitVote(pid: string, optionId: string, qNum: number) {
    await set(ref(db, `rooms/${this.code}/votes/${pid}`), { o: optionId, q: qNum });
  }
  async clearReject(pid: string) {
    await remove(ref(db, `rooms/${this.code}/rejects/${pid}`));
  }
  async hostWrite(prev: RoomState, next: RoomState) {
    const u = diffPaths(prev, next);
    if (Object.keys(u).length) await update(ref(db, `rooms/${this.code}`), u);
  }
  async hostUpdateSettings(patch: Partial<RoomState>) {
    const u: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) u[k] = v;
    await update(ref(db, `rooms/${this.code}`), u);
  }
  async kick(pid: string) {
    await remove(ref(db, `rooms/${this.code}/players/${pid}`));
  }
  async getSecret() {
    return ((await get(ref(db, `secrets/${this.code}`))).val() as HostSecret) || null;
  }
  async setSecret(s: HostSecret) {
    await set(ref(db, `secrets/${this.code}`), s);
  }
  now() {
    return Date.now() + offset;
  }
  async leave() {
    this.unsubs.forEach((f) => f());
    this.unsubs = [];
    if (this.isHost) {
      await remove(ref(db, `secrets/${this.code}`)).catch(() => {});
      await remove(ref(db, `rooms/${this.code}`)).catch(() => {});
    } else {
      await set(ref(db, `rooms/${this.code}/players/${this.myId}/online`), false).catch(() => {});
    }
  }
}

/** Crea una sala nueva con un código libre */
export async function createOnlineRoom(hostPlays: boolean, settings: Settings): Promise<RoomConn> {
  const uid = await ensure();
  for (let i = 0; i < 12; i++) {
    const code = randomCode();
    const r = ref(db, `rooms/${code}`);
    const now = Date.now() + offset;
    const res = await runTransaction(r, (cur) => {
      // sala libre o abandonada hace más de 6 horas
      if (cur && now - (cur.createdAt || 0) < 6 * 3600e3) return;
      const room: RoomState = { code, hostId: uid, hostPlays, status: 'lobby', createdAt: now, settings, players: {} };
      return room;
    });
    if (res.committed) {
      onDisconnect(ref(db, `rooms/${code}/hostOnline`)).set(false);
      await set(ref(db, `rooms/${code}/hostOnline`), true);
      return new FirebaseRoom(code, uid, true);
    }
  }
  throw new Error('No se pudo crear la sala. Inténtalo de nuevo.');
}

export type JoinError = 'not-found' | 'started' | 'full';

export async function joinOnlineRoom(code: string): Promise<RoomConn | JoinError> {
  const uid = await ensure();
  const c = code.trim().toUpperCase();
  const snap = await get(ref(db, `rooms/${c}`));
  const raw = snap.val();
  if (!raw) return 'not-found';
  const isHost = raw.hostId === uid;
  const already = !!raw.players?.[uid];
  if (!isHost && !already) {
    if (raw.status !== 'lobby') return 'started';
    if (Object.keys(raw.players || {}).length >= 10) return 'full';
  }
  if (isHost) {
    onDisconnect(ref(db, `rooms/${c}/hostOnline`)).set(false);
    await set(ref(db, `rooms/${c}/hostOnline`), true);
  }
  return new FirebaseRoom(c, uid, isHost);
}

export async function myUid(): Promise<string> {
  return ensure();
}
