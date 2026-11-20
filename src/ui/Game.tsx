import { T } from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomConn } from '../net/conn';
import type { RoomState } from '../engine/types';
import * as H from '../engine/host';
import { isOffensive, normalize } from '../engine/text';
import { CATEGORIES } from '../data/categories';
import { useNow } from './hooks';
import { buzz, canSpeak, sfx, speak } from './fx';
import { AutoNext, CountUp, PhaseSteps, QuestionIntro, TimerBar, letter, roundGains } from './turbo';
import { mascleta } from './music';
import { getPrefs } from './local';

type HostApi = { next: () => void; backToLobby: () => void } | null;

export function nameOf(room: RoomState, pid: string) {
  const p = room.players[pid];
  return p ? `${p.avatar} ${p.name}` : '';
}

/* ---------- piezas comunes ---------- */

export function Meta({ room, conn }: { room: RoomState; conn: RoomConn }) {
  const g = room.game!;
  const now = useNow(conn);
  const left = g.deadline ? Math.max(0, Math.ceil((g.deadline - now) / 1000)) : null;
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (left !== null && left <= 5 && left > 0 && last.current !== left) (left <= 3 ? sfx.hurry() : sfx.tick());
    last.current = left;
  }, [left]);
  const timed = left !== null && (g.phase === 'lie' || g.phase === 'vote');
  return (
    <>
    <QuestionIntro room={room} />
    <PhaseSteps phase={g.phase} />
    <div className="meta">
      <span>
        Pregunta {g.qNum} de {g.total}
        {g.multiplier > 1 ? T(' · ¡puntos dobles!') : ''}
      </span>
      {left !== null && (g.phase === 'lie' || g.phase === 'vote') && (
        <span className={'timer' + (left <= 5 ? ' hurry' : '')} aria-label={T('{left} segundos', { left })}>
          {left}
        </span>
      )}
    </div>
    {timed && <TimerBar room={room} left={Math.max(0, (g.deadline! - now) / 1000)} />}
    </>
  );
}

export function QuestionCard({ room }: { room: RoomState }) {
  const q = room.game!.question;
  const [a, b] = q.q.split('___');
  const cat = CATEGORIES[q.cat];
  return (
    <div className="question">
      <span className="cat">
        {cat?.emoji} {cat ? T(cat.name) : null}
        {canSpeak() && (
          <button className="link" style={{ color: 'var(--ink-soft)', padding: '0 0 0 10px', fontSize: 15 }} onClick={() => speak(q.q)}>
            {T('Leer en voz alta')}
          </button>
        )}
      </span>
      {a}
      <span className="blank" aria-label="hueco" />
      {b}
    </div>
  );
}

function Waiting({ room, kind }: { room: RoomState; kind: 'lie' | 'vote' }) {
  const done = kind === 'lie' ? room.lies || {} : room.votes || {};
  const act = H.activePlayers(room);
  const n = act.filter((p) => done[p]).length;
  return (
    <div className="stack">
      <p className="on-ink" style={{ margin: 0 }}>
        {kind === 'lie' ? T('Mentiras listas') : T('Votos')}: {n} de {act.length}
      </p>
      <div className="players">
        {act.map((pid) => (
          <span key={pid} className={'chip' + (done[pid] ? ' done' : '') + (room.players[pid]?.online === false ? ' off' : '')}>
            <span className="av">{room.players[pid].avatar}</span>
            {room.players[pid].name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- fase: escribir la mentira ---------- */

export function LiePhase({ room, conn, pid, onSent }: { room: RoomState; conn: RoomConn; pid: string; onSent?: () => void }) {
  const g = room.game!;
  const me = room.players[pid];
  const sent = room.lies?.[pid];
  const reject = room.rejects?.[pid];
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [idea, setIdea] = useState(-1);
  const [qa, qb] = g.question.q.split('___');

  useEffect(() => {
    setText('');
    setErr(null);
    setIdea(-1);
  }, [g.qNum]);

  async function send(t: string) {
    const clean = t.replace(/\s+/g, ' ').trim();
    if (!clean) return setErr(T('Escribe una respuesta inventada.'));
    if (isOffensive(clean)) return setErr(T('Esa palabra no vale en este juego. Prueba con otra.'));
    setSending(true);
    sfx.send();
    buzz();
    if (reject) await conn.clearReject(pid);
    await conn.submitLie(pid, clean.slice(0, 40), g.qNum);
    setSending(false);
    onSent?.();
  }

  if (sent && !reject) {
    return (
      <div className="stack pop">
        <div className="card paper center">
          <h2>{T('Mentira enviada')}</h2>
          <p className="muted" style={{ margin: 0 }}>«{sent.text}». Ahora a esperar a los demás.</p>
        </div>
        {!conn.local && <Waiting room={room} kind="lie" />}
      </div>
    );
  }

  const kid = me?.level === 1 && g.question.kids.length > 0;
  return (
    <div className="stack">
      {reject === 'truth' && <div className="banner">{T('¡Has escrito la verdad! Inventa otra respuesta para engañar a los demás.')}</div>}
      {reject === 'near' && <div className="banner">{T('¡Casi es la verdad! Inventa algo más alejado para que sea una mentira.')}</div>}
      {reject === 'bad' && <div className="banner red">{T('Esa respuesta no vale. Prueba con otra.')}</div>}
      {kid ? (
        <>
          <p className="on-ink" style={{ margin: 0, fontSize: 20 }}>{T('Elige la mentira que quieres colar:')}</p>
          <div className="kids">
            {g.question.kids.map((k) => (
              <button key={k} className="opt" disabled={sending} onClick={() => send(k)}>
                {k}
              </button>
            ))}
          </div>
        </>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <label className="field on-ink">
            {T('Inventa una respuesta falsa que parezca verdad')}
            <span className="hint">{T('Por cada jugador que caiga en tu mentira: +500')}</span>
            <input
              className="input"
              value={text}
              maxLength={40}
              autoComplete="off"
              autoCorrect="off"
              enterKeyHint="send"
              onChange={(e) => {
                setText(e.target.value);
                setErr(null);
              }}
              placeholder={T('Tu mentira')}
            />
          </label>
          {text.trim() && (
            <div className="preview" aria-live="polite">
              {qa}
              <b>{text.trim()}</b>
              {qb}
            </div>
          )}
          {g.question.kids.length > 0 && (
            <button
              type="button"
              className="btn white small idea"
              onClick={() => {
                const n = (idea + 1) % g.question.kids.length;
                setIdea(n);
                setText(g.question.kids[n]);
                setErr(null);
                sfx.tap();
              }}
            >
              💡 {idea < 0 ? T('¿Sin ideas? Dame una') : T('Otra idea')}
            </button>
          )}
          {err && <div className="banner red">{err}</div>}
          <button className="btn" disabled={sending || !text.trim()}>
            {T('Enviar mentira')}
          </button>
        </form>
      )}
    </div>
  );
}

/* ---------- fase: votar ---------- */

export function myOptionIds(room: RoomState, pid: string): Set<string> {
  const mine = room.lies?.[pid]?.text;
  const opts = room.game?.options || [];
  if (!mine) return new Set();
  const n = normalize(mine);
  return new Set(opts.filter((o) => normalize(o.text) === n).map((o) => o.id));
}

export function VotePhase({ room, conn, pid, onSent }: { room: RoomState; conn: RoomConn; pid: string; onSent?: () => void }) {
  const g = room.game!;
  const voted = room.votes?.[pid];
  const mine = useMemo(() => myOptionIds(room, pid), [room, pid]);
  const [busy, setBusy] = useState(false);
  if (voted) {
    const o = g.options?.find((x) => x.id === voted);
    return (
      <div className="stack pop">
        <div className="card paper center">
          <h2>{T('Voto enviado')}</h2>
          <p className="muted" style={{ margin: 0 }}>Has elegido «{o?.text}».</p>
        </div>
        {!conn.local && <Waiting room={room} kind="vote" />}
      </div>
    );
  }
  return (
    <div className="stack">
      <p className="on-ink" style={{ margin: 0, fontSize: 20 }}>
        {T('¿Cuál es la verdad?')} <span className="hint">{T('Si aciertas: +1000')}</span>
      </p>
      <div className="options">
        {(g.options || []).map((o, i) => (
          <button
            key={o.id}
            className={'opt' + (mine.has(o.id) ? ' mine' : '')}
            disabled={mine.has(o.id) || busy}
            onClick={async () => {
              setBusy(true);
              sfx.tap();
              buzz();
              await conn.submitVote(pid, o.id, g.qNum);
              setBusy(false);
              onSent?.();
            }}
          >
            <span className="letter">{letter(i)}</span>
            {o.text}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- pantalla grande: mentiras y votos en curso ---------- */

export function ScreenWaiting({ room }: { room: RoomState }) {
  const g = room.game!;
  if (g.phase === 'vote')
    return (
      <div className="stack">
        <div className="options">
          {(g.options || []).map((o, i) => (
            <div key={o.id} className="opt" style={{ cursor: 'default' }}>
              <span className="letter">{letter(i)}</span>
              {o.text}
            </div>
          ))}
        </div>
        <Waiting room={room} kind="vote" />
      </div>
    );
  return <Waiting room={room} kind="lie" />;
}

/* ---------- revelación ---------- */

export function Reveal({ room, host, conn }: { room: RoomState; host: HostApi; conn: RoomConn }) {
  const g = room.game!;
  const rv = g.reveal!;
  const votes = room.history?.['q' + g.qNum]?.votes || room.votes || {};
  const voters = (opt: string) => Object.keys(votes).filter((p) => votes[p] === opt && !(rv.authors?.[opt] || []).includes(p));
  const steps = useMemo(() => {
    const lies = (g.options || []).filter((o) => o.id !== rv.truthId);
    const shown = lies.filter((o) => voters(o.id).length > 0 || (rv.authors?.[o.id] || []).some((a) => a !== 'house'));
    // primero las que menos engañaron, al final las más exitosas
    shown.sort((a, b) => voters(a.id).length - voters(b.id).length);
    return [...shown.map((o) => o.id), rv.truthId];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.qNum]);
  const [n, setN] = useState(1);
  useEffect(() => setN(1), [g.qNum]);
  useEffect(() => {
    if (n > steps.length) return;
    const isTruth = steps[n - 1] === rv.truthId;
    if (isTruth) sfx.truth();
    else if (voters(steps[n - 1]).length) {
      mascleta();
      buzz(true);
    }
    const t = setTimeout(() => setN((x) => x + 1), isTruth ? 1200 : 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, steps]);
  const done = n > steps.length;
  const cur = steps.slice(0, Math.min(n, steps.length));

  return (
    <div className="stack" onClick={() => !done && setN((x) => x + 1)}>
      {cur.map((id) => {
        const o = g.options?.find((x) => x.id === id);
        const fell = voters(id);
        const auth = (rv.authors?.[id] || []).filter((a) => a !== 'house');
        if (id === rv.truthId)
          return (
            <div key={id} className="reveal-item truth pop">
              <div className="label">{T('La verdad')}</div>
              <div className="text">{rv.answer}</div>
              <div className="who">
                {fell.length ? T('La acertaron: {names}', { names: fell.map((p) => nameOf(room, p)).join(', ') }) : T('Nadie la acertó.')}
              </div>
            </div>
          );
        return (
          <div key={id} className="reveal-item pop">
            <div className="text">{o?.text}</div>
            <div className="who">{auth.length ? T('Mentira de {names}', { names: auth.map((p) => nameOf(room, p)).join(T(' y ')) }) : T('Mentira de la casa')}</div>
            {fell.length > 0 && (
              <div className="fell">
                {fell.map((p) => (
                  <span key={p} className="chip">
                    <span className="av">{room.players[p]?.avatar}</span>
                    {room.players[p]?.name}
                  </span>
                ))}
              </div>
            )}
            {fell.length > 0 && <span className="stamp">¡FAKEADO!</span>}
          </div>
        );
      })}
      {done && (
        <>
          <div className="fact pop">{rv.fact}</div>
          <Gains room={room} />
          {host ? (
            <AutoNext
              key={g.qNum}
              seconds={10}
              onGo={host.next}
              label={g.qNum >= g.total ? T('Ver resultado final') : g.qNum % room.settings.perRound === 0 ? T('Ver marcador') : T('Siguiente pregunta')}
            />
          ) : (
            !conn.local && <p className="muted on-ink center">{T('El anfitrión pasará a la siguiente.')}</p>
          )}
        </>
      )}
      {!done && <p className="muted on-ink center" style={{ margin: 0, fontSize: 15 }}>{T('Toca para ir más rápido')}</p>}
    </div>
  );
}

function Gains({ room }: { room: RoomState }) {
  const gained = room.game?.reveal?.gained || {};
  const streak = room.game?.reveal?.streak || {};
  const list = H.ranking(room).filter((r) => (gained[r.pid] || 0) > 0);
  const hot = Object.keys(streak).length > 0;
  useEffect(() => {
    if (hot) sfx.streak();
  }, [hot]);
  if (!list.length) return null;
  return (
    <div className="players">
      {list.map((r) => (
        <span key={r.pid} className="chip">
          <span className="av">{r.avatar}</span>
          {r.name} +{gained[r.pid]}
          {streak[r.pid] ? <span className="fire" title={T('{n} aciertos seguidos', { n: streak[r.pid] })}>🔥{streak[r.pid]}</span> : null}
        </span>
      ))}
    </div>
  );
}

/* ---------- marcador y final ---------- */

export function Ranking({ room, gains }: { room: RoomState; gains?: Record<string, number> }) {
  const rows = H.ranking(room);
  const before = (pid: string, score: number) => score - (gains?.[pid] || 0);
  const prevPos: Record<string, number> = {};
  if (gains)
    rows
      .map((r) => ({ pid: r.pid, s: before(r.pid, r.score) }))
      .sort((a, b) => b.s - a.s)
      .forEach((r, i) => (prevPos[r.pid] = i));
  return (
    <div className="rank">
      {rows.map((r, i) => (
        <div key={r.pid} className={'rank-row pop' + (i === 0 && r.score > 0 ? ' first' : '')}>
          <span className="pos">{i + 1}º</span>
          <span className="av">{r.avatar}</span>
          <span className="name">{r.name}</span>
          {gains && prevPos[r.pid] > i && <span className="move up" aria-label={T('sube {n}', { n: prevPos[r.pid] - i })}>▲{prevPos[r.pid] - i}</span>}
          {gains && prevPos[r.pid] < i && <span className="move down" aria-label={T('baja {n}', { n: i - prevPos[r.pid] })}>▼{i - prevPos[r.pid]}</span>}
          <span className="pts">{gains ? <CountUp from={before(r.pid, r.score)} to={r.score} /> : r.score.toLocaleString('es-ES')}</span>
        </div>
      ))}
    </div>
  );
}

export function Scores({ room, host, conn }: { room: RoomState; host: HostApi; conn: RoomConn }) {
  const g = room.game!;
  const nextRound = g.round + 1;
  return (
    <div className="stack">
      <div>
        <div className="meta">FIN DE LA RONDA {g.round}</div>
        <h2 className="title-big" style={{ margin: '6px 0 0' }}>Marcador</h2>
      </div>
      <Ranking room={room} gains={roundGains(room, g.round)} />
      {nextRound === room.settings.rounds && room.settings.rounds > 1 && (
        <div className="banner">{T('Última ronda: ¡todo vale el doble!')}</div>
      )}
      {host ? (
        <AutoNext key={g.round} seconds={12} onGo={host.next} label={T('Empezar ronda {n}', { n: nextRound })} />
      ) : (
        !conn.local && <p className="muted on-ink center">{T('Esperando al anfitrión…')}</p>
      )}
    </div>
  );
}

/** Premio de casal: adultos (nivel Adulto) se llevan una de bunyols; menores, un xupito de xocolata */
export function xupitoFor(room: RoomState, rows: ReturnType<typeof H.ranking>) {
  if (!getPrefs().bromes) return null;
  const top = rows[0];
  if (!top || top.score <= 0) return null;
  const winners = rows.filter((r) => r.score === top.score);
  const adults = winners.filter((r) => room.players[r.pid]?.level === 4).length;
  const kids = winners.length - adults;
  if (adults && kids) return { kind: 'mix', emoji: '🍩🍫', text: T('¡Una de bunyols per als majors i xupito de xocolata per als xiquets!') };
  if (adults) return { kind: 'bunyols', emoji: '🍩', text: T('¡Una de bunyols!') };
  return { kind: 'xocolata', emoji: '🍫', text: T('¡Xupito de xocolata!') };
}

export function Final({ room, host, onExit }: { room: RoomState; host: HostApi; onExit: () => void }) {
  useEffect(() => {
    mascleta(true);
  }, []);
  const rows = H.ranking(room);
  const aw = H.awards(room);
  const top = rows[0];
  const tie = rows.length > 1 && rows[1].score === top?.score;
  const xupito = xupitoFor(room, rows);
  return (
    <div className="stack">
      <div className="center on-ink pop">
        <div className="big-emoji">{tie ? '🤝' : top?.avatar}</div>
        <h2 className="title-big">{tie ? T('¡Empate en cabeza!') : T('¡Gana {name}!', { name: top?.name })}</h2>
      </div>
      {xupito && (
        <div className={'xupito ' + xupito.kind} role="status">
          <span className="xupito-emoji" aria-hidden="true">{xupito.emoji}</span>
          <span>{xupito.text}</span>
        </div>
      )}
      <Ranking room={room} />
      {(aw.bestLiar || aw.hardestToFool) && (
        <div className="card paper stack" style={{ gap: 8 }}>
          {aw.bestLiar && (
            <div>
              <strong>{T('Mejor mentiroso:')}</strong> {nameOf(room, aw.bestLiar.pid)} ({aw.bestLiar.n} {aw.bestLiar.n === 1 ? 'engaño' : 'engaños'})
            </div>
          )}
          {aw.hardestToFool && (
            <div>
              <strong>{T('Más difícil de engañar:')}</strong> {nameOf(room, aw.hardestToFool.pid)} ({aw.hardestToFool.n}{' '}
              {aw.hardestToFool.n === 1 ? T('vez fakeado') : T('veces fakeado')})
            </div>
          )}
        </div>
      )}
      {host && (
        <button className="btn" onClick={host.backToLobby}>
          {T('Jugar otra vez')}
        </button>
      )}
      <button className="btn white" onClick={onExit}>
        {T('Salir al inicio')}
      </button>
    </div>
  );
}
