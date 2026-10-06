import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomConn } from '../net/conn';
import type { HostSecret, Question, RoomState } from '../engine/types';
import * as H from '../engine/host';
import { addSeen, getSeen } from './local';

/** Suscripción al estado de la sala */
export function useRoom(conn: RoomConn | null) {
  const [room, setRoom] = useState<RoomState | null | undefined>(undefined);
  const ref = useRef<RoomState | null>(null);
  useEffect(() => {
    if (!conn) return;
    return conn.subscribe((r) => {
      ref.current = r;
      setRoom(r);
    });
  }, [conn]);
  return { room, roomRef: ref };
}

/** Reloj que se actualiza para pintar cuentas atrás */
export function useNow(conn: RoomConn | null, ms = 250) {
  const [now, setNow] = useState(() => conn?.now() ?? Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(conn?.now() ?? Date.now()), ms);
    return () => clearInterval(id);
  }, [conn, ms]);
  return now;
}

/** Lógica del anfitrión: hace avanzar la partida y expone acciones */
export function useHost(conn: RoomConn | null, roomRef: React.MutableRefObject<RoomState | null>, bank: Question[]) {
  const secret = useRef<HostSecret | null>(null);
  const busy = useRef(false);
  const [secretLoaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!conn?.isHost) return;
    conn.getSecret().then((s) => {
      secret.current = s;
      setLoaded(true);
    });
  }, [conn]);

  const apply = useCallback(
    async (step: H.HostStep, prev: RoomState) => {
      if (!conn) return;
      busy.current = true;
      try {
        if (step.secret !== secret.current) {
          secret.current = step.secret;
          await conn.setSecret(step.secret);
        }
        roomRef.current = step.room;
        await conn.hostWrite(prev, step.room);
      } catch (e) {
        setError('Se ha perdido la conexión. Comprueba internet.');
        console.error(e);
      } finally {
        busy.current = false;
      }
    },
    [conn, roomRef],
  );

  // bucle de avance automático
  useEffect(() => {
    if (!conn?.isHost) return;
    const id = setInterval(() => {
      const room = roomRef.current;
      if (busy.current || !room || !secret.current || room.status !== 'playing') return;
      const step = H.tick({ room, secret: secret.current }, bank, conn.now(), Math.random);
      if (step) apply(step, room);
    }, 300);
    return () => clearInterval(id);
  }, [conn, bank, apply, roomRef]);

  const start = useCallback(async () => {
    const room = roomRef.current;
    if (!conn || !room || busy.current) return;
    setError(null);
    try {
      const step = H.startGame(room, bank, conn.now(), Math.random, getSeen());
      addSeen(step.secret.order);
      await apply(step, room);
    } catch (e: any) {
      setError(e?.message || 'No se pudo empezar la partida.');
    }
  }, [conn, bank, apply, roomRef]);

  const next = useCallback(async () => {
    const room = roomRef.current;
    if (!conn || !room || !secret.current || busy.current) return;
    const g = room.game;
    if (g?.phase === 'lie') return apply(H.toVote({ room, secret: secret.current }, conn.now(), Math.random), room);
    if (g?.phase === 'vote') return apply(H.toReveal({ room, secret: secret.current }), room);
    await apply(H.next({ room, secret: secret.current }, bank, conn.now()), room);
  }, [conn, bank, apply, roomRef]);

  const backToLobby = useCallback(async () => {
    const room = roomRef.current;
    if (!conn || !room) return;
    const players = { ...room.players };
    for (const p of Object.keys(players)) players[p] = { ...players[p], score: 0 };
    const next: RoomState = { ...room, status: 'lobby', game: undefined, lies: {}, votes: {}, rejects: {}, players, history: {} };
    await apply({ room: next, secret: secret.current ?? { order: [], answer: '', alias: [], house: [], fact: '' } }, room);
  }, [conn, apply, roomRef]);

  return { start, next, backToLobby, error, secretLoaded, lost: secretLoaded && !secret.current };
}
