import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import type { PlayerLevel, Question, RoomState, Settings } from '../engine/types';
import * as H from '../engine/host';
import { CATEGORIES } from '../data/categories';
import { AVATARS, AVATAR_NAMES, LEVELS, type Profile } from './local';
import { buy, getPrice, isUnlocked, purchasesAvailable, restore } from '../purchase';
import type { RoomConn } from '../net/conn';
import { WEB_URL } from '../firebase-config';

export function Bar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div className="bar">
      {onBack && (
        <button className="icon-btn" onClick={onBack} aria-label="Volver">
          ←
        </button>
      )}
      <h1>{title}</h1>
    </div>
  );
}

/* ---------- perfil de jugador ---------- */

export function ProfileForm({
  initial, onSave, submitLabel = 'Guardar', compact = false,
}: { initial?: Partial<Profile>; onSave: (p: Profile) => void; submitLabel?: string; compact?: boolean }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [avatar, setAvatar] = useState(initial?.avatar ?? AVATARS[Math.floor(Math.random() * AVATARS.length)]);
  const [level, setLevel] = useState<PlayerLevel | null>(initial?.level ?? null);
  const ok = name.trim().length > 0 && level !== null;
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSave({ name: name.trim().slice(0, 16), avatar, level: level! });
      }}
    >
      <label className="field">
        Nombre o apodo
        <input className="input" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder="Por ejemplo, Lucía" autoComplete="off" />
        <span className="hint">No uses apellidos: solo lo verán los que juegan contigo.</span>
      </label>
      <div className="field">
        Elige tu cargo fallero
        <div className="avatars">
          {AVATARS.map((a) => (
            <button type="button" key={a} aria-pressed={a === avatar} onClick={() => setAvatar(a)} aria-label={AVATAR_NAMES[a] ?? `Personaje ${a}`}>
              <span>{a}</span>
              {AVATAR_NAMES[a] && <span className="av-name">{AVATAR_NAMES[a]}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        Edad
        <div className="seg even">
          {LEVELS.map((l) => (
            <button type="button" key={l.value} aria-pressed={level === l.value} onClick={() => setLevel(l.value)}>
              {l.label}
            </button>
          ))}
        </div>
        <span className="hint">{level ? LEVELS.find((l) => l.value === level)!.hint : 'Sirve para elegir preguntas adecuadas para todos.'}</span>
      </div>
      <button className="btn" disabled={!ok}>
        {submitLabel}
      </button>
    </form>
  );
}

/* ---------- ajustes de partida ---------- */

export function SettingsEditor({ settings, onChange, bank, youngest, pass }: {
  settings: Settings; onChange: (s: Settings) => void; bank: Question[]; youngest: PlayerLevel; pass?: boolean;
}) {
  const fake: RoomState = useMemo(
    () => ({
      code: '', hostId: '', hostPlays: true, status: 'lobby', createdAt: 0, settings,
      players: { a: { name: '', avatar: '', level: youngest, score: 0, joinedAt: 0 } },
    }),
    [settings, youngest],
  );
  const pool = H.questionPool(bank, fake).length;
  const need = settings.rounds * settings.perRound;
  const toggleCat = (c: string) => {
    const all = Object.keys(CATEGORIES);
    const cur = settings.cats.length ? settings.cats : all;
    const next = cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c];
    onChange({ ...settings, cats: next.length === all.length || next.length === 0 ? [] : next });
  };
  const on = (c: string) => settings.cats.length === 0 || settings.cats.includes(c);
  return (
    <div className="card stack">
      <div className="field">
        Rondas (3 preguntas cada una)
        <div className="seg even">
          {[2, 3, 4].map((n) => (
            <button type="button" key={n} aria-pressed={settings.rounds === n} onClick={() => onChange({ ...settings, rounds: n })}>
              {n} rondas
            </button>
          ))}
        </div>
      </div>
      {!pass && (
        <div className="field">
          Tiempo para pensar
          <div className="seg even">
            {([['normal', 'Normal'], ['relajado', 'Relajado'], ['sin', 'Sin tiempo']] as const).map(([v, l]) => (
              <button type="button" key={v} aria-pressed={settings.timer === v} onClick={() => onChange({ ...settings, timer: v })}>
                {l}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="field">
        Temas
        <div className="seg">
          {Object.entries(CATEGORIES).map(([id, c]) => (
            <button type="button" key={id} aria-pressed={on(id)} onClick={() => toggleCat(id)}>
              {c.emoji} {c.name}
            </button>
          ))}
        </div>
        <span className={pool < need ? 'error' : 'hint'}>
          {pool < need
            ? `Solo hay ${pool} preguntas con estos temas y edades: elige más temas o menos rondas.`
            : `${pool} preguntas disponibles para esta partida.`}
        </span>
      </div>
    </div>
  );
}

/* ---------- código y QR de la sala ---------- */

export function RoomCode({ code }: { code: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const url = WEB_URL ? `${WEB_URL.replace(/\/$/, '')}/?sala=${code}` : '';
  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { margin: 1, width: 336, color: { dark: '#16205b', light: '#ffffff' } }).then(setQr).catch(() => setQr(null));
  }, [url]);
  return (
    <div className="card row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 180px' }}>
        <div className="muted" style={{ fontWeight: 600 }}>Código de la sala</div>
        <div className="code-big">{code}</div>
        <div className="hint" style={{ marginTop: 8 }}>
          En otro móvil: abre ¡Fakeado!, toca «Unirme a una partida» y escribe el código.
          {qr ? ' O escanea el QR para jugar desde el navegador.' : ''}
        </div>
      </div>
      {qr && <img className="qr" src={qr} alt={`QR para unirse a la sala ${code}`} style={{ flex: '0 0 auto' }} />}
    </div>
  );
}

/* ---------- puerta parental ---------- */

export function ParentGate({ onPass, onCancel }: { onPass: () => void; onCancel: () => void }) {
  const [q] = useState(() => {
    const a = 6 + Math.floor(Math.random() * 7);
    const b = 6 + Math.floor(Math.random() * 7);
    return { a, b };
  });
  const [v, setV] = useState('');
  const [err, setErr] = useState(false);
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="Pregunta para adultos">
      <form
        className="card modal stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (Number(v) === q.a * q.b) onPass();
          else {
            setErr(true);
            setV('');
          }
        }}
      >
        <h2>Solo para adultos</h2>
        <p style={{ margin: 0 }}>
          Para continuar, escribe cuánto es {q.a} × {q.b}.
        </p>
        <input className="input" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} autoFocus aria-label="Resultado" />
        {err && <div className="error">No es correcto. Pide ayuda a un adulto.</div>}
        <div className="row">
          <button type="button" className="btn white small" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn small" disabled={!v}>
            Continuar
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------- tienda (desbloquear todo) ---------- */

export function Store({ bank, onBack }: { bank: Question[]; onBack: () => void }) {
  const [unlocked, setUnlocked] = useState(isUnlocked());
  const [gate, setGate] = useState<null | 'buy' | 'restore'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const total = bank.length;
  const free = bank.filter((q) => q.free).length;
  const price = getPrice() || '0,99 €';
  const native = purchasesAvailable();

  async function doIt(kind: 'buy' | 'restore') {
    setGate(null);
    setMsg(null);
    if (kind === 'buy') {
      const r = await buy();
      if (r === 'ok') {
        setUnlocked(true);
        setMsg('¡Listo! Ya tienes todas las preguntas.');
      } else if (r === 'error') setMsg('No se pudo completar la compra. Inténtalo más tarde.');
      else if (r === 'unavailable') setMsg('La tienda no está disponible ahora mismo.');
    } else {
      const ok = await restore();
      setUnlocked(ok);
      setMsg(ok ? 'Compra recuperada.' : 'No hemos encontrado ninguna compra en esta cuenta.');
    }
  }

  return (
    <div className="app">
      <Bar title="Todas las preguntas" onBack={onBack} />
      <div className="card stack">
        {unlocked ? (
          <>
            <h2>Lo tienes todo desbloqueado</h2>
            <p style={{ margin: 0 }}>Puedes jugar con las {total} preguntas. Los que se unan a tus partidas también, sin pagar nada.</p>
          </>
        ) : (
          <>
            <h2>
              {total} preguntas por {price}
            </h2>
            <p style={{ margin: 0 }}>
              La versión gratis trae {free} preguntas. Con un único pago desbloqueas las {total}, y las nuevas que vayamos añadiendo.
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Basta con que pague quien crea la sala: el resto de la familia se une gratis. Sin anuncios y sin suscripciones.
            </p>
            {native ? (
              <button className="btn" onClick={() => setGate('buy')}>
                Desbloquear por {price}
              </button>
            ) : (
              <p className="banner" style={{ margin: 0 }}>
                El desbloqueo se compra desde la app de ¡Fakeado! en Google Play o App Store.
              </p>
            )}
          </>
        )}
        {msg && <div className="banner">{msg}</div>}
        {native && !unlocked && (
          <button className="btn white small" onClick={() => setGate('restore')}>
            Restaurar compras
          </button>
        )}
      </div>
      {gate && <ParentGate onPass={() => doIt(gate)} onCancel={() => setGate(null)} />}
    </div>
  );
}

/* ---------- cómo se juega ---------- */

export function HowTo({ onBack }: { onBack: () => void }) {
  return (
    <div className="app">
      <Bar title="Cómo se juega" onBack={onBack} />
      <div className="card prose">
        <ol>
          <li>Sale una pregunta con una respuesta real sorprendente, por ejemplo: «El pulpo tiene ___ corazones».</li>
          <li>Cada uno escribe en su móvil una respuesta falsa que parezca verdad. Los peques eligen entre tres mentiras.</li>
          <li>Se mezclan todas las respuestas con la verdadera y cada uno vota cuál cree que es la real.</li>
          <li>Se descubre quién ha engañado a quién.</li>
        </ol>
        <p>
          <strong>Puntos:</strong> 1.000 por acertar la verdad y 500 por cada jugador que cae en tu mentira. La última ronda vale el doble.
        </p>
        <p>
          <strong>Varios móviles:</strong> uno crea la sala y los demás se unen con el código. Si tenéis una tablet o un ordenador, podéis usarlo como
          pantalla grande para que todos vean las respuestas.
        </p>
        <p>
          <strong>Un solo móvil:</strong> elige «Jugar con un solo móvil» y os lo vais pasando por turnos.
        </p>
        <p style={{ margin: 0 }}>
          <strong>Consejo:</strong> la mejor mentira no es la más loca, sino la que parece aburridamente verdad.
        </p>
      </div>
    </div>
  );
}

/* ---------- lista de jugadores en el lobby ---------- */

export function PlayerChips({ room, conn, canKick }: { room: RoomState; conn?: RoomConn; canKick?: boolean }) {
  const ids = H.activePlayers(room);
  if (!ids.length) return <p className="muted on-ink" style={{ margin: 0 }}>Todavía no hay nadie. ¡Comparte el código!</p>;
  return (
    <div className="players">
      {ids.map((pid) => {
        const p = room.players[pid];
        return (
          <span key={pid} className={'chip pop' + (p.online === false ? ' off' : '')}>
            <span className="av">{p.avatar}</span>
            {p.name}
            {canKick && conn && pid !== conn.myId && (
              <button onClick={() => conn.kick(pid)} aria-label={`Quitar a ${p.name}`}>
                ✕
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
