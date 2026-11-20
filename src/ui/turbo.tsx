import { T } from '../i18n';
// Piezas de ritmo: pasos de la ronda, barra de tiempo, presentación de cada pregunta,
// avance automático y marcadores animados. Compartido entre ¡Fakeado! y ¡Fakeado! Fallas.
import { useEffect, useRef, useState } from 'react';
import type { RoomState } from '../engine/types';
import * as H from '../engine/host';
import { CATEGORIES } from '../data/categories';
import { sfx } from './fx';

/* ---------- 1 Miente · 2 Vota · 3 Descubre ---------- */

const STEPS = [
  { phase: 'lie', icon: '✍️', label: T('Miente') },
  { phase: 'vote', icon: '🗳️', label: T('Vota') },
  { phase: 'reveal', icon: '🎭', label: T('Descubre') },
] as const;

export function PhaseSteps({ phase }: { phase: string }) {
  const cur = STEPS.findIndex((s) => s.phase === phase);
  return (
    <ol className="steps" aria-label={T('Fases de la pregunta')}>
      {STEPS.map((s, i) => (
        <li key={s.phase} className={i === cur ? 'on' : i < cur ? 'past' : ''} aria-current={i === cur ? 'step' : undefined}>
          <span aria-hidden="true">{s.icon}</span> {s.label}
        </li>
      ))}
    </ol>
  );
}

/* ---------- barra de tiempo que se vacía ---------- */

export function TimerBar({ room, left }: { room: RoomState; left: number }) {
  const g = room.game!;
  const total = (g.phase === 'lie' ? H.lieSeconds(room.settings) : H.voteSeconds(room.settings)) || left || 1;
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  return (
    <div className={'timebar' + (left <= 5 ? ' hurry' : '')} role="presentation">
      <i style={{ width: pct + '%' }} />
    </div>
  );
}

/* ---------- cartel de presentación de cada pregunta ---------- */

let introShown = '';

export function QuestionIntro({ room }: { room: RoomState }) {
  const g = room.game!;
  const key = `${room.code}-${room.createdAt}-${g.qNum}`;
  const [show, setShow] = useState(() => g.phase === 'lie' && introShown !== key);
  useEffect(() => {
    if (!show) return;
    introShown = key;
    sfx.whoosh();
    const t = setTimeout(() => setShow(false), 1500);
    return () => clearTimeout(t);
  }, [show, key]);
  if (!show) return null;
  const cat = CATEGORIES[g.question.cat];
  const lastOfAll = g.qNum === g.total;
  return (
    <div className="intro" aria-hidden="true" onClick={() => setShow(false)}>
      <div className="intro-card">
        <div className="intro-num">
          {lastOfAll ? T('¡ÚLTIMA PREGUNTA!') : T('PREGUNTA {n}', { n: g.qNum })}
          <small> / {g.total}</small>
        </div>
        <div className="intro-cat">
          <span>{cat?.emoji}</span> {cat ? T(cat.name) : null}
        </div>
        {g.multiplier > 1 && <div className="intro-x2">PUNTOS DOBLES</div>}
      </div>
    </div>
  );
}

/* ---------- avance automático para el anfitrión ---------- */

export function AutoNext({ label, onGo, seconds = 10 }: { label: string; onGo: () => void; seconds?: number }) {
  const [left, setLeft] = useState(seconds);
  const [paused, setPaused] = useState(false);
  const fired = useRef(false);
  useEffect(() => {
    if (paused) return;
    if (left <= 0) {
      if (!fired.current) {
        fired.current = true;
        onGo();
      }
      return;
    }
    const t = setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [left, paused, onGo]);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <button
        className="btn autonext"
        style={{ ['--p' as string]: paused ? '0%' : `${((seconds - left) / seconds) * 100}%` }}
        onClick={() => {
          fired.current = true;
          onGo();
        }}
      >
        {label}
        {!paused && left > 0 && <span className="count">{left}</span>}
      </button>
      {!paused && (
        <button className="link" style={{ alignSelf: 'center' }} onClick={() => setPaused(true)}>
          {T('Esperar, que estamos comentando')}
        </button>
      )}
    </div>
  );
}

/* ---------- número que sube contando ---------- */

export function CountUp({ from, to, ms = 900 }: { from: number; to: number; ms?: number }) {
  const [v, setV] = useState(from);
  useEffect(() => {
    if (from === to) return setV(to);
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to, ms]);
  return <>{v.toLocaleString('es-ES')}</>;
}

/** Puntos que cada jugador ganó en la ronda (para animar el marcador y ver quién sube) */
export function roundGains(room: RoomState, round: number): Record<string, number> {
  const per = room.settings.perRound;
  const out: Record<string, number> = {};
  for (let q = (round - 1) * per + 1; q <= round * per; q++) {
    const gained = room.history?.['q' + q]?.reveal?.gained || {};
    for (const [pid, n] of Object.entries(gained)) out[pid] = (out[pid] ?? 0) + (n || 0);
  }
  return out;
}

/** Letra A, B, C… para cada opción (fácil de decir en voz alta) */
export const letter = (i: number) => String.fromCharCode(65 + i);
