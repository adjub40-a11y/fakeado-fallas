import { useCallback, useEffect, useMemo, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import bankJson from './data/questions.json';
import type { Question, RoomState, Settings } from './engine/types';
import * as H from './engine/host';
import type { RoomConn } from './net/conn';
import { LocalRoom } from './net/local';
import { createOnlineRoom, isOnlineAvailable, joinOnlineRoom } from './net/firebase';
import { getPrefs, getProfile, savePrefs, saveProfile, setLastRoom, type Profile } from './ui/local';
import { useHost, useRoom } from './ui/hooks';
import { Final, LiePhase, Meta, QuestionCard, Reveal, Scores, ScreenWaiting, VotePhase } from './ui/Game';
import { Bar, HowTo, PlayerChips, ProfileForm, RoomCode, SettingsEditor, Store } from './ui/screens';
import { Hemeroteca, MeuaScreen } from './ui/fallas';
import { meuaQuestions } from './ui/meua';
import { initPurchases, isUnlocked, onPurchaseChange } from './purchase';
import { isMusicPlaying, musicEnabled, setMusicMood, startMusic, stopMusic } from './ui/music';

const baseBank = bankJson as Question[];
const buildBank = () => [...baseBank, ...meuaQuestions()];
// se reconstruye solo al guardar "La meua falla", para mantener la misma referencia durante la partida
let bank: Question[] = buildBank();

type Screen =
  | { name: 'home' }
  | { name: 'profile'; then?: Screen }
  | { name: 'create' }
  | { name: 'join'; code?: string }
  | { name: 'online'; conn: RoomConn }
  | { name: 'passSetup' }
  | { name: 'pass'; conn: RoomConn }
  | { name: 'store' }
  | { name: 'howto' }
  | { name: 'meua' }
  | { name: 'hemeroteca' };

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    const code = new URLSearchParams(location.search).get('sala');
    if (code && /^[A-Za-z]{4}$/.test(code)) return getProfile() ? { name: 'join', code } : { name: 'profile', then: { name: 'join', code } };
    return getProfile() ? { name: 'home' } : { name: 'profile' };
  });
  const [, force] = useState(0);

  // música: arranca con el primer toque (los navegadores no dejan sonar antes) y se pausa en segundo plano
  useEffect(() => {
    const go = () => {
      if (musicEnabled() && !isMusicPlaying() && !document.hidden) startMusic();
    };
    const vis = () => (document.hidden ? stopMusic() : go());
    window.addEventListener('pointerdown', go);
    document.addEventListener('visibilitychange', vis);
    const h = Capacitor.isNativePlatform() ? CapApp.addListener('appStateChange', (st) => (st.isActive ? go() : stopMusic())) : null;
    return () => {
      window.removeEventListener('pointerdown', go);
      document.removeEventListener('visibilitychange', vis);
      h?.then((x) => x.remove());
    };
  }, []);

  useEffect(() => {
    initPurchases().catch(() => {});
    const off = onPurchaseChange(() => force((x) => x + 1));
    return () => {
      off();
    };
  }, []);

  const goHome = useCallback(() => {
    if ((screen.name === 'online' || screen.name === 'pass') && 'conn' in screen) screen.conn.leave();
    setLastRoom(null);
    setScreen({ name: 'home' });
  }, [screen]);

  // botón atrás de Android
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const h = CapApp.addListener('backButton', () => {
      if (screen.name === 'home') CapApp.exitApp();
      else if (screen.name === 'online' || screen.name === 'pass') {
        if (confirm('¿Salir de la partida?')) goHome();
      } else setScreen({ name: 'home' });
    });
    return () => {
      h.then((x) => x.remove());
    };
  }, [screen, goHome]);

  switch (screen.name) {
    case 'profile':
      return (
        <div className="app">
          {getProfile() ? <Bar title="Tu perfil" onBack={() => setScreen({ name: 'home' })} /> : <Logo />}
          <ProfileForm
            initial={getProfile() ?? undefined}
            submitLabel={getProfile() ? 'Guardar' : 'Empezar'}
            onSave={(p) => {
              saveProfile(p);
              setScreen(screen.then ?? { name: 'home' });
            }}
          />
        </div>
      );
    case 'home':
      return <Home go={setScreen} />;
    case 'create':
      return <Create onBack={() => setScreen({ name: 'home' })} onCreated={(conn) => setScreen({ name: 'online', conn })} />;
    case 'join':
      return <Join initial={screen.code} onBack={() => setScreen({ name: 'home' })} onJoined={(conn) => setScreen({ name: 'online', conn })} />;
    case 'online':
      return <OnlineRoom conn={screen.conn} onExit={goHome} openStore={() => setScreen({ name: 'store' })} />;
    case 'passSetup':
      return <PassSetup onBack={() => setScreen({ name: 'home' })} onStart={(conn) => setScreen({ name: 'pass', conn })} />;
    case 'pass':
      return <PassGame conn={screen.conn} onExit={goHome} />;
    case 'store':
      return <Store bank={bank} onBack={() => setScreen({ name: 'home' })} />;
    case 'meua':
      return (
        <MeuaScreen
          onBack={() => setScreen({ name: 'home' })}
          onSaved={() => {
            bank = buildBank();
          }}
        />
      );
    case 'hemeroteca':
      return <Hemeroteca onBack={() => setScreen({ name: 'home' })} />;
    case 'howto':
      return <HowTo onBack={() => setScreen({ name: 'home' })} />;
  }
}

function Logo() {
  return (
    <div className="logo-wrap">
      <img className="logo-fallera" src="./fallera.svg" alt="" width="170" height="170" />
      <div className="logo">¡FAKEADO!</div>
      <div>
        <span className="senyera" aria-label="Edició Falles">
          <span className="blau" />
          <span className="bars">FALLES</span>
        </span>
      </div>
      <p className="tagline">Cuela tus mentiras sobre las Fallas de València</p>
    </div>
  );
}

/* ---------- inicio ---------- */

function Home({ go }: { go: (s: Screen) => void }) {
  const p = getProfile()!;
  const [prefs, setPrefs] = useState(getPrefs());
  const online = isOnlineAvailable();
  return (
    <div className="app">
      <Logo />
      <div className="stack">
        <button className="btn" onClick={() => go({ name: 'create' })} disabled={!online}>
          Crear partida
        </button>
        <button className="btn lilac" onClick={() => go({ name: 'join' })} disabled={!online}>
          Unirme a una partida
        </button>
        <button className="btn white" onClick={() => go({ name: 'passSetup' })}>
          Jugar con un solo móvil
        </button>
        {!online && <p className="muted on-ink" style={{ margin: 0 }}>El juego con varios móviles no está disponible en esta versión.</p>}
      </div>
      <div className="spacer" />
      <div className="card paper row" style={{ flexWrap: 'wrap' }}>
        <span style={{ fontSize: 34, flex: '0 0 auto' }}>{p.avatar}</span>
        <span style={{ fontWeight: 700 }}>{p.name}</span>
        <button className="btn white small" onClick={() => go({ name: 'profile' })}>
          Cambiar
        </button>
      </div>
      <div className="footer-links">
        <button className="link" onClick={() => go({ name: 'howto' })}>Cómo se juega</button>
        <button className="link" onClick={() => go({ name: 'meua' })}>La meua falla</button>
        <button className="link" onClick={() => go({ name: 'hemeroteca' })}>Hemeroteca</button>
        <button className="link" onClick={() => go({ name: 'store' })}>{isUnlocked() ? 'Todo desbloqueado' : 'Más preguntas'}</button>
        <button
          className="link"
          onClick={() => {
            const n = { ...prefs, sound: !prefs.sound };
            savePrefs(n);
            setPrefs(n);
          }}
        >
          Sonido: {prefs.sound ? 'sí' : 'no'}
        </button>
        <button
          className="link"
          onClick={() => {
            const n = { ...prefs, music: !(prefs.music !== false) };
            savePrefs(n);
            setPrefs(n);
            if (n.music) startMusic();
            else stopMusic();
          }}
        >
          Música: {prefs.music !== false ? 'sí' : 'no'}
        </button>
        <button
          className="link"
          onClick={() => {
            const n = { ...prefs, bromes: !(prefs.bromes !== false) };
            savePrefs(n);
            setPrefs(n);
          }}
        >
          Premio xupito: {prefs.bromes !== false ? 'sí' : 'no'}
        </button>
        <a className="link" href="./privacidad.html">Privacidad</a>
      </div>
    </div>
  );
}

/* ---------- crear sala online ---------- */

function Create({ onBack, onCreated }: { onBack: () => void; onCreated: (c: RoomConn) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function make(hostPlays: boolean) {
    setBusy(true);
    setErr(null);
    try {
      const settings: Settings = { ...H.defaultSettings(), unlocked: isUnlocked() };
      const conn = await createOnlineRoom(hostPlays, settings);
      if (hostPlays) {
        const p = getProfile()!;
        await conn.join(conn.myId, { ...p, score: 0, joinedAt: conn.now() });
      }
      setLastRoom(conn.code);
      onCreated(conn);
    } catch (e: any) {
      setErr('No se pudo crear la sala. Comprueba que tienes internet.');
      console.error(e);
      setBusy(false);
    }
  }
  return (
    <div className="app">
      <Bar title="Crear partida" onBack={onBack} />
      <p className="on-ink" style={{ margin: 0, fontSize: 20 }}>¿Cómo vas a usar este dispositivo?</p>
      <button className="btn" disabled={busy} onClick={() => make(true)}>
        <span>
          Para jugar
          <span className="sub">Juego desde aquí como uno más</span>
        </span>
      </button>
      <button className="btn lilac" disabled={busy} onClick={() => make(false)}>
        <span>
          Como pantalla grande
          <span className="sub">Tablet, ordenador o tele: todos ven las preguntas aquí</span>
        </span>
      </button>
      {err && <div className="banner red">{err}</div>}
    </div>
  );
}

/* ---------- unirse ---------- */

function Join({ initial, onBack, onJoined }: { initial?: string; onBack: () => void; onJoined: (c: RoomConn) => void }) {
  const [code, setCode] = useState((initial || '').toUpperCase());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go(e?: React.FormEvent) {
    e?.preventDefault();
    if (code.length !== 4) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await joinOnlineRoom(code);
      if (r === 'not-found') setErr('No existe ninguna sala con ese código. Revisa las letras.');
      else if (r === 'started') setErr('Esa partida ya ha empezado. Pide que vuelvan a la sala al terminar.');
      else if (r === 'full') setErr('La sala está llena (10 jugadores).');
      else {
        if (!r.isHost) {
          const p = getProfile()!;
          await r.join(r.myId, { ...p, score: 0, joinedAt: r.now() });
        }
        setLastRoom(r.code);
        return onJoined(r);
      }
    } catch (e) {
      console.error(e);
      setErr('No se pudo conectar. Comprueba que tienes internet.');
    }
    setBusy(false);
  }
  useEffect(() => {
    if (initial && initial.length === 4) go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="app">
      <Bar title="Unirme a una partida" onBack={onBack} />
      <form className="card stack" onSubmit={go}>
        <label className="field">
          Código de la sala
          <input
            className="input code"
            value={code}
            maxLength={4}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            placeholder="ABCD"
            aria-label="Código de 4 letras"
          />
        </label>
        {err && <div className="error">{err}</div>}
        <button className="btn" disabled={busy || code.length !== 4}>
          {busy ? 'Conectando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

/* ---------- sala online (lobby + partida) ---------- */

function useMusicMood(room: RoomState | null | undefined) {
  const phase = room && room.status !== 'lobby' ? room.game?.phase : undefined;
  useEffect(() => {
    setMusicMood(phase === 'lie' || phase === 'vote' ? 'calma' : phase === 'final' ? 'final' : phase ? 'fiesta' : 'menu');
  }, [phase]);
  useEffect(() => () => setMusicMood('menu'), []);
}

function OnlineRoom({ conn, onExit, openStore }: { conn: RoomConn; onExit: () => void; openStore: () => void }) {
  const { room, roomRef } = useRoom(conn);
  useMusicMood(room);
  const host = useHost(conn.isHost ? conn : null, roomRef, bank);
  const unlocked = isUnlocked();

  // si el anfitrión compra durante la partida, se aplica a la sala
  useEffect(() => {
    if (conn.isHost && room && room.settings.unlocked !== unlocked) conn.hostUpdateSettings({ settings: { ...room.settings, unlocked } } as Partial<RoomState>);
  }, [conn, room, unlocked]);

  if (room === undefined) return <div className="app"><Bar title="Conectando…" /></div>;
  if (room === null || (!conn.isHost && !room.players[conn.myId]))
    return (
      <div className="app">
        <Bar title="Partida terminada" />
        <div className="card stack">
          <p style={{ margin: 0 }}>{room === null ? 'El anfitrión ha cerrado la sala.' : 'Has salido de la sala.'}</p>
          <button className="btn" onClick={onExit}>Volver al inicio</button>
        </div>
      </div>
    );

  const screenOnly = conn.isHost && !room.hostPlays;
  const wide = screenOnly;
  const hostApi = conn.isHost ? { next: host.next, backToLobby: host.backToLobby } : null;
  const hostGone = !conn.isHost && room.hostOnline === false;

  if (room.status === 'lobby') {
    const act = H.activePlayers(room);
    const youngest = H.youngestLevel(room);
    const pool = H.questionPool(bank, room).length;
    const need = room.settings.rounds * room.settings.perRound;
    return (
      <div className={'app' + (wide ? ' wide' : '')}>
        <Bar title="Sala de espera" onBack={() => confirm('¿Salir de la sala?') && onExit()} />
        <RoomCode code={room.code} />
        <div className="stack">
          <p className="on-ink" style={{ margin: 0, fontWeight: 700 }}>Jugadores ({act.length})</p>
          <PlayerChips room={room} conn={conn} canKick={conn.isHost} />
        </div>
        {conn.isHost ? (
          <>
            <SettingsEditor
              settings={room.settings}
              bank={bank}
              youngest={youngest}
              onChange={(s) => conn.hostUpdateSettings({ settings: s } as Partial<RoomState>)}
            />
            {!room.settings.unlocked && (
              <button className="link" onClick={openStore} style={{ alignSelf: 'flex-start' }}>
                Estás usando la versión gratis. Ver todas las preguntas
              </button>
            )}
            {host.error && <div className="banner red">{host.error}</div>}
            <button className="btn" disabled={act.length < 2 || pool < need} onClick={host.start}>
              {act.length < 2 ? 'Hacen falta al menos 2 jugadores' : 'Empezar partida'}
            </button>
          </>
        ) : (
          <div className="card paper center">
            {hostGone ? 'El anfitrión se ha desconectado. Espera a que vuelva.' : 'Esperando a que el anfitrión empiece la partida…'}
          </div>
        )}
      </div>
    );
  }

  const g = room.game;
  if (!g) return <div className="app"><Bar title="Cargando…" /></div>;
  const lost = conn.isHost && host.lost;

  return (
    <div className={'app' + (wide ? ' wide' : '')}>
      <Bar title={`Sala ${room.code}`} onBack={() => confirm('¿Salir de la partida?') && onExit()} />
      {hostGone && <div className="banner red">El anfitrión se ha desconectado. La partida seguirá cuando vuelva.</div>}
      {lost && (
        <div className="banner red stack">
          No se ha podido recuperar la partida.
          <button className="btn small" onClick={host.backToLobby}>Volver a la sala</button>
        </div>
      )}
      {(g.phase === 'lie' || g.phase === 'vote') && (
        <>
          <Meta room={room} conn={conn} />
          <QuestionCard room={room} />
          {screenOnly ? (
            <ScreenWaiting room={room} />
          ) : g.phase === 'lie' ? (
            <LiePhase room={room} conn={conn} pid={conn.myId} />
          ) : (
            <VotePhase room={room} conn={conn} pid={conn.myId} />
          )}
          {conn.isHost && (
            <button className="link" style={{ alignSelf: 'center' }} onClick={host.next}>
              {g.phase === 'lie' ? 'No esperar más: pasar a votar' : 'No esperar más: ver resultados'}
            </button>
          )}
        </>
      )}
      {g.phase === 'reveal' && (
        <>
          <Meta room={room} conn={conn} />
          <QuestionCard room={room} />
          <Reveal room={room} host={hostApi} conn={conn} />
        </>
      )}
      {g.phase === 'scores' && <Scores room={room} host={hostApi} conn={conn} />}
      {g.phase === 'final' && <Final room={room} host={hostApi} onExit={onExit} />}
    </div>
  );
}

/* ---------- modo un solo móvil ---------- */

function PassSetup({ onBack, onStart }: { onBack: () => void; onStart: (c: RoomConn) => void }) {
  const me = getProfile();
  const [players, setPlayers] = useState<Profile[]>(me ? [me] : []);
  const [adding, setAdding] = useState(false);
  const [settings, setSettings] = useState<Settings>({ ...H.defaultSettings(), timer: 'sin', unlocked: isUnlocked() });
  const youngest = (players.length ? Math.min(...players.map((p) => p.level)) : 4) as Profile['level'];
  const fake = useMemo<RoomState>(
    () => ({
      code: '', hostId: '', hostPlays: true, status: 'lobby', createdAt: 0, settings,
      players: { a: { name: '', avatar: '', level: youngest, score: 0, joinedAt: 0 } },
    }),
    [settings, youngest],
  );
  const pool = H.questionPool(bank, fake).length;
  const need = settings.rounds * settings.perRound;

  async function start() {
    const conn = new LocalRoom(settings);
    for (const [i, p] of players.entries()) await conn.join('p' + i, { ...p, score: 0, joinedAt: i });
    onStart(conn);
  }

  return (
    <div className="app">
      <Bar title="Un solo móvil" onBack={onBack} />
      <p className="on-ink" style={{ margin: 0 }}>Añadid a todos los jugadores. El móvil irá pasando de mano en mano.</p>
      <div className="players">
        {players.map((p, i) => (
          <span key={i} className="chip">
            <span className="av">{p.avatar}</span>
            {p.name}
            <button onClick={() => setPlayers(players.filter((_, j) => j !== i))} aria-label={`Quitar a ${p.name}`}>
              ✕
            </button>
          </span>
        ))}
      </div>
      {adding ? (
        <ProfileForm
          compact
          submitLabel="Añadir jugador"
          onSave={(p) => {
            setPlayers([...players, p]);
            setAdding(false);
          }}
        />
      ) : (
        players.length < 8 && (
          <button className="btn white" onClick={() => setAdding(true)}>
            Añadir jugador
          </button>
        )
      )}
      {!adding && (
        <>
          <SettingsEditor settings={settings} onChange={setSettings} bank={bank} youngest={youngest} pass />
          <button className="btn" disabled={players.length < 2 || pool < need} onClick={start}>
            {players.length < 2 ? 'Hacen falta al menos 2 jugadores' : 'Empezar partida'}
          </button>
        </>
      )}
    </div>
  );
}

function PassGame({ conn, onExit }: { conn: RoomConn; onExit: () => void }) {
  const { room, roomRef } = useRoom(conn);
  useMusicMood(room);
  const host = useHost(conn, roomRef, bank);
  const [turn, setTurn] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started && room && room.status === 'lobby' && host.secretLoaded) {
      setStarted(true);
      host.start();
    }
  }, [room, started, host]);

  useEffect(() => {
    setTurn(null);
  }, [room?.game?.phase, room?.game?.qNum]);

  if (!room) return <div className="app" />;
  if (room.status === 'lobby') {
    // tras "Jugar otra vez": vuelve a empezar directamente
    return (
      <div className="app">
        <Bar title="Nueva partida" onBack={onExit} />
        <button className="btn" onClick={host.start}>Empezar otra partida</button>
      </div>
    );
  }
  const g = room.game;
  if (!g) return <div className="app" />;
  const hostApi = { next: host.next, backToLobby: host.backToLobby };

  if (g.phase === 'lie' || g.phase === 'vote') {
    const done = g.phase === 'lie' ? room.lies || {} : room.votes || {};
    const pending = H.activePlayers(room).filter((p) => !done[p] || (g.phase === 'lie' && room.rejects?.[p]));
    if (!turn || !pending.includes(turn)) {
      const nextP = pending[0];
      if (!nextP) return <div className="app" />;
      const p = room.players[nextP];
      return (
        <div className="app">
          <Bar title={`Pregunta ${g.qNum} de ${g.total}`} onBack={() => confirm('¿Salir de la partida?') && onExit()} />
          <div className="handoff">
            <div className="big-emoji">{p.avatar}</div>
            <div className="turn">{g.phase === 'lie' ? 'TURNO PARA MENTIR' : 'TURNO PARA VOTAR'}</div>
            <div className="who">Pásale el móvil a {p.name}</div>
            <p className="muted on-ink" style={{ margin: 0 }}>Que nadie más mire la pantalla.</p>
            <button className="btn" onClick={() => setTurn(nextP)}>
              Soy {p.name}, ¡vamos!
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="app">
        <Bar title={`${room.players[turn].avatar} ${room.players[turn].name}`} />
        <Meta room={room} conn={conn} />
        <QuestionCard room={room} />
        {g.phase === 'lie' ? (
          <LiePhase room={room} conn={conn} pid={turn} onSent={() => setTurn(null)} />
        ) : (
          <VotePhase room={room} conn={conn} pid={turn} onSent={() => setTurn(null)} />
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <Bar title={g.phase === 'final' ? 'Resultado final' : `Pregunta ${g.qNum} de ${g.total}`} onBack={() => confirm('¿Salir de la partida?') && onExit()} />
      {g.phase === 'reveal' && (
        <>
          <QuestionCard room={room} />
          <Reveal room={room} host={hostApi} conn={conn} />
        </>
      )}
      {g.phase === 'scores' && <Scores room={room} host={hostApi} conn={conn} />}
      {g.phase === 'final' && <Final room={room} host={hostApi} onExit={onExit} />}
    </div>
  );
}
