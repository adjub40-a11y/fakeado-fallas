// Interfaz común de conexión a una sala (Firebase para multimóvil, local para "pasa el móvil")
import type { HostSecret, Player, RoomState } from '../engine/types';

export interface RoomConn {
  readonly code: string;
  /** id del dispositivo (uid anónimo) */
  readonly myId: string;
  readonly isHost: boolean;
  readonly local: boolean;
  subscribe(cb: (room: RoomState | null) => void): () => void;
  join(pid: string, p: Player): Promise<void>;
  submitLie(pid: string, text: string, qNum: number): Promise<void>;
  submitVote(pid: string, optionId: string, qNum: number): Promise<void>;
  clearReject(pid: string): Promise<void>;
  /** Solo anfitrión: escribe los cambios entre el estado anterior y el nuevo */
  hostWrite(prev: RoomState, next: RoomState): Promise<void>;
  hostUpdateSettings(patch: Partial<RoomState>): Promise<void>;
  kick(pid: string): Promise<void>;
  getSecret(): Promise<HostSecret | null>;
  setSecret(s: HostSecret): Promise<void>;
  /** Hora del servidor estimada (ms) */
  now(): number;
  leave(): Promise<void>;
}

/** Calcula las rutas que cambian entre dos estados (para escribir solo lo necesario) */
export function diffPaths(prev: RoomState, next: RoomState): Record<string, unknown> {
  const u: Record<string, unknown> = {};
  if (prev.status !== next.status) u.status = next.status;
  if (JSON.stringify(prev.game ?? null) !== JSON.stringify(next.game ?? null)) u.game = next.game ?? null;
  for (const pid of Object.keys(next.players || {})) {
    const a = prev.players?.[pid];
    const b = next.players[pid];
    if (!a || a.score !== b.score) u[`players/${pid}/score`] = b.score;
  }
  if (Object.keys(next.history || {}).length === 0 && Object.keys(prev.history || {}).length > 0) u.history = null;
  for (const [k, v] of Object.entries(next.history || {})) if (!prev.history?.[k]) u[`history/${k}`] = v;
  const newQuestion = prev.game?.qNum !== next.game?.qNum || (prev.game?.phase !== 'lie' && next.game?.phase === 'lie');
  if (newQuestion) {
    u.lies = null;
    u.votes = null;
    u.rejects = null;
  } else {
    for (const pid of Object.keys(prev.lies || {})) if (!next.lies?.[pid]) u[`lies/${pid}`] = null;
    for (const [pid, r] of Object.entries(next.rejects || {})) if (prev.rejects?.[pid] !== r) u[`rejects/${pid}`] = r;
    if (prev.game?.phase !== 'vote' && next.game?.phase === 'vote') u.votes = null;
  }
  return u;
}

/** Normaliza lo que llega de la base de datos: filtra mentiras y votos de otra pregunta */
export function cleanRemote(raw: any): RoomState | null {
  if (!raw) return null;
  const qNum = raw.game?.qNum;
  const lies: Record<string, any> = {};
  for (const [pid, e] of Object.entries<any>(raw.lies || {})) if (e && e.q === qNum) lies[pid] = { text: e.text, at: e.at };
  const votes: Record<string, string> = {};
  for (const [pid, e] of Object.entries<any>(raw.votes || {})) if (e && e.q === qNum) votes[pid] = e.o;
  const game = raw.game
    ? {
        ...raw.game,
        question: { ...raw.game.question, kids: raw.game.question?.kids || [] },
        options: raw.game.options || undefined,
        deadline: raw.game.deadline ?? null,
      }
    : undefined;
  return {
    code: raw.code,
    hostId: raw.hostId,
    hostPlays: !!raw.hostPlays,
    status: raw.status || 'lobby',
    createdAt: raw.createdAt || 0,
    settings: { ...(raw.settings || {}), cats: raw.settings?.cats || [] },
    players: raw.players || {},
    game,
    lies,
    votes,
    rejects: raw.rejects || {},
    hostOnline: raw.hostOnline !== false,
    history: raw.history || {},
  };
}

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I ni O para no confundir
export function randomCode(rand = Math.random): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += LETTERS[Math.floor(rand() * LETTERS.length)];
  return s;
}
