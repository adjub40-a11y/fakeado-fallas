// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { xupitoFor } from './Game';
import * as H from '../engine/host';
import type { RoomState } from '../engine/types';

function room(players: [string, 1 | 2 | 3 | 4, number][]): RoomState {
  const r = H.createRoom('ABCD', 'x', true, 0);
  players.forEach(([n, level, score], i) => (r.players['p' + i] = { name: n, avatar: '🦔', level, score, joinedAt: i }));
  return r;
}
describe('premio xupito', () => {
  it('gana un adulto: bunyols', () => {
    const r = room([['Jose', 4, 5000], ['Vera', 1, 3000]]);
    expect(xupitoFor(r, H.ranking(r))?.text).toBe('¡Una de bunyols!');
  });
  it('gana un menor: xocolata', () => {
    const r = room([['Jose', 4, 1000], ['Pau', 2, 4000]]);
    expect(xupitoFor(r, H.ranking(r))?.text).toBe('¡Xupito de xocolata!');
  });
  it('empate adulto y menor: los dos', () => {
    const r = room([['Jose', 4, 3000], ['Pau', 3, 3000]]);
    expect(xupitoFor(r, H.ranking(r))?.kind).toBe('mix');
  });
  it('nadie puntúa: sin premio', () => {
    const r = room([['Jose', 4, 0], ['Pau', 3, 0]]);
    expect(xupitoFor(r, H.ranking(r))).toBeNull();
  });
});
