import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomConn } from '../net/conn';
import type { RoomState } from '../engine/types';
import * as H from '../engine/host';
import { isOffensive, normalize } from '../engine/text';
import { CATEGORIES } from '../data/categories';
import { useNow } from './hooks';
import { buzz, canSpeak, sfx, speak } from './fx';
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
    if (left !== null && left <= 5 && left > 0 && last.current !== left) sfx.tick();
    last.current = left;
  }, [left]);
  return (
    <div className="meta">
      <span>
        Pregunta {g.qNum} de {g.total}
        {g.multiplier > 1 ? ' · ¡puntos dobles!' : ''}
      </span>
      {left !== null && (g.phase === 'lie' || g.phase === 'vote') && (
        <span className={'timer' + (left <= 5 ? ' hurry' : '')} aria-label={`${left} segundos`}>
          {left}
        </span>
      )}
    </div>
  );
}

export function QuestionCard({ room }: { room: RoomState }) {
  const q = room.game!.question;
  const [a, b] = q.q.split('___');
  const cat = CATEGORIES[q.cat];
  return (
    <div className="question">
      <span className="cat">
        {cat?.emoji} {cat?.name}
        {canSpeak() && (
          <button className="link" style={{ color: 'var(--ink-soft)', padding: '0 0 0 10px', fontSize: 15 }} onClick={() => speak(q.q)}>
            Leer en voz alta
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
        {kind === 'lie' ? 'Mentiras listas' : 'Votos'}: {n} de {act.length}
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

  useEffect(() => {
    setText('');
    setErr(null);
  }, [g.qNum]);

  async function send(t: string) {
    const clean = t.replace(/\s+/g, ' ').trim();
    if (!clean) return setErr('Escribe una respuesta inventada.');
    if (isOffensive(clean)) return setErr('Esa palabra no vale en este juego. Prueba con otra.');
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
          <h2>Mentira enviada</h2>
          <p className="muted" style={{ margin: 0 }}>«{sent.text}». Ahora a esperar a los demás.</p>
        </div>
        {!conn.local && <Waiting room={room} kind="lie" />}
      </div>
    );
  }

  const kid = me?.level === 1 && g.question.kids.length > 0;
  return (
    <div className="stack">
      {reject === 'truth' && <div className="banner">¡Has escrito la verdad! Inventa otra respuesta para engañar a los demás.</div>}
      {reject === 'bad' && <div className="banner red">Esa respuesta no vale. Prueba con otra.</div>}
      {kid ? (
        <>
          <p className="on-ink" style={{ margin: 0, fontSize: 20 }}>Elige la mentira que quieres colar:</p>
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
            Escribe una respuesta falsa que parezca verdad
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
              placeholder="Tu mentira"
            />
          </label>
          {err && <div className="banner red">{err}</div>}
          <button className="btn" disabled={sending || !text.trim()}>
            Enviar mentira
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
          <h2>Voto enviado</h2>
          <p className="muted" style={{ margin: 0 }}>Has elegido «{o?.text}».</p>
        </div>
        {!conn.local && <Waiting room={room} kind="vote" />}
      </div>
    );
  }
  return (
    <div className="stack">
      <p className="on-ink" style={{ margin: 0, fontSize: 20 }}>¿Cuál es la respuesta verdadera?</p>
      <div className="options">
        {(g.options || []).map((o) => (
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
          {(g.options || []).map((o) => (
            <div key={o.id} className="opt" style={{ cursor: 'default' }}>
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
    const t = setTimeout(() => setN((x) => x + 1), isTruth ? 1500 : 2600);
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
              <div className="label">La verdad</div>
              <div className="text">{rv.answer}</div>
              <div className="who">
                {fell.length ? `La acertaron: ${fell.map((p) => nameOf(room, p)).join(', ')}` : 'Nadie la acertó.'}
              </div>
            </div>
          );
        return (
          <div key={id} className="reveal-item pop">
            <div className="text">{o?.text}</div>
            <div className="who">{auth.length ? `Mentira de ${auth.map((p) => nameOf(room, p)).join(' y ')}` : 'Mentira de la casa'}</div>
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
            <button className="btn" onClick={host.next}>
              {g.qNum >= g.total ? 'Ver resultado final' : g.qNum % room.settings.perRound === 0 ? 'Ver marcador' : 'Siguiente pregunta'}
            </button>
          ) : (
            !conn.local && <p className="muted on-ink center">El anfitrión pasará a la siguiente.</p>
          )}
        </>
      )}
      {!done && <p className="muted on-ink center" style={{ margin: 0, fontSize: 15 }}>Toca para ir más rápido</p>}
    </div>
  );
}

function Gains({ room }: { room: RoomState }) {
  const gained = room.game?.reveal?.gained || {};
  const list = H.ranking(room).filter((r) => (gained[r.pid] || 0) > 0);
  if (!list.length) return null;
  return (
    <div className="players">
      {list.map((r) => (
        <span key={r.pid} className="chip">
          <span className="av">{r.avatar}</span>
          {r.name} +{gained[r.pid]}
        </span>
      ))}
    </div>
  );
}

/* ---------- marcador y final ---------- */

export function Ranking({ room }: { room: RoomState }) {
  const rows = H.ranking(room);
  return (
    <div className="rank">
      {rows.map((r, i) => (
        <div key={r.pid} className={'rank-row pop' + (i === 0 && r.score > 0 ? ' first' : '')}>
          <span className="pos">{i + 1}º</span>
          <span className="av">{r.avatar}</span>
          <span className="name">{r.name}</span>
          <span className="pts">{r.score.toLocaleString('es-ES')}</span>
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
      <Ranking room={room} />
      {nextRound === room.settings.rounds && room.settings.rounds > 1 && (
        <div className="banner">Última ronda: ¡todo vale el doble!</div>
      )}
      {host ? (
        <button className="btn" onClick={host.next}>
          Empezar ronda {nextRound}
        </button>
      ) : (
        !conn.local && <p className="muted on-ink center">Esperando al anfitrión…</p>
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
  if (adults && kids) return { kind: 'mix', emoji: '🍩🍫', text: '¡Una de bunyols per als majors i xupito de xocolata per als xiquets!' };
  if (adults) return { kind: 'bunyols', emoji: '🍩', text: '¡Una de bunyols!' };
  return { kind: 'xocolata', emoji: '🍫', text: '¡Xupito de xocolata!' };
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
        <h2 className="title-big">{tie ? '¡Empate en cabeza!' : `¡Gana ${top?.name}!`}</h2>
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
              <strong>Mejor mentiroso:</strong> {nameOf(room, aw.bestLiar.pid)} ({aw.bestLiar.n} {aw.bestLiar.n === 1 ? 'engaño' : 'engaños'})
            </div>
          )}
          {aw.hardestToFool && (
            <div>
              <strong>Más difícil de engañar:</strong> {nameOf(room, aw.hardestToFool.pid)} ({aw.hardestToFool.n}{' '}
              {aw.hardestToFool.n === 1 ? 'vez fakeado' : 'veces fakeado'})
            </div>
          )}
        </div>
      )}
      {host && (
        <button className="btn" onClick={host.backToLobby}>
          Jugar otra vez
        </button>
      )}
      <button className="btn white" onClick={onExit}>
        Salir al inicio
      </button>
    </div>
  );
}
