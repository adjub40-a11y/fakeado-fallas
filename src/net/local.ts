// Sala local en memoria: modo "pasa el móvil" (un solo dispositivo) y pruebas
import type { HostSecret, Player, RoomState, Settings } from '../engine/types';
import { createRoom } from '../engine/host';
import type { RoomConn } from './conn';

export class LocalRoom implements RoomConn {
  readonly local = true;
  readonly isHost = true;
  readonly myId = 'local-host';
  private room: RoomState;
  private secret: HostSecret | null = null;
  private subs = new Set<(r: RoomState | null) => void>();

  constructor(settings: Settings, readonly code = 'LOCAL') {
    this.room = createRoom(code, this.myId, false, Date.now(), settings);
  }
  private emit() {
    const snap = structuredClone(this.room);
    queueMicrotask(() => this.subs.forEach((cb) => cb(snap)));
  }
  subscribe(cb: (r: RoomState | null) => void) {
    this.subs.add(cb);
    cb(structuredClone(this.room));
    return () => this.subs.delete(cb);
  }
  async join(pid: string, p: Player) {
    this.room.players = { ...this.room.players, [pid]: { ...p, online: true } };
    this.emit();
  }
  async submitLie(pid: string, text: string, qNum: number) {
    if (this.room.game?.qNum !== qNum) return;
    this.room.lies = { ...(this.room.lies || {}), [pid]: { text, at: Date.now() } };
    this.emit();
  }
  async submitVote(pid: string, optionId: string, qNum: number) {
    if (this.room.game?.qNum !== qNum) return;
    this.room.votes = { ...(this.room.votes || {}), [pid]: optionId };
    this.emit();
  }
  async clearReject(pid: string) {
    const r = { ...(this.room.rejects || {}) };
    delete r[pid];
    this.room.rejects = r;
    this.emit();
  }
  async hostWrite(_prev: RoomState, next: RoomState) {
    // conserva mentiras/votos llegados mientras el anfitrión calculaba (si siguen siendo de la misma pregunta)
    const sameQ = next.game?.qNum === this.room.game?.qNum && next.game?.phase === this.room.game?.phase;
    const lies = sameQ ? { ...(this.room.lies || {}), ...(next.lies || {}) } : next.lies;
    if (sameQ) for (const pid of Object.keys(_prev.lies || {})) if (!next.lies?.[pid]) delete lies![pid];
    const votes = sameQ ? { ...(this.room.votes || {}), ...(next.votes || {}) } : next.votes;
    this.room = structuredClone({ ...next, lies, votes });
    this.emit();
  }
  async hostUpdateSettings(patch: Partial<RoomState>) {
    this.room = { ...this.room, ...patch } as RoomState;
    this.emit();
  }
  async kick(pid: string) {
    const p = { ...this.room.players };
    delete p[pid];
    this.room.players = p;
    this.emit();
  }
  async getSecret() {
    return this.secret;
  }
  async setSecret(s: HostSecret) {
    this.secret = structuredClone(s);
  }
  now() {
    return Date.now();
  }
  async leave() {
    this.subs.clear();
  }
}
