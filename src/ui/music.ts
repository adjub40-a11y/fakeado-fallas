// Música de ¡Fakeado! Fallas
// - Himne de l'Exposició (Maestro Serrano, 1909, dominio público): se reproduce desde public/music/himne.ogg
//   si el archivo está incluido (grabación con licencia libre de Wikimedia Commons).
// - Marcha de dolçaina y tabalet: composición original sintetizada al vuelo.
// - Mascletà: estruendo sintetizado para cuando alguien se come una mentira y para el final.
import { getPrefs } from './local';

const H = -1; // mantener nota
const R = 0; // silencio

// Marcha original en Sol mayor, 2/4, corcheas (MIDI)
const MELODY: number[] = [
  74, 74, 76, 78, 79, H, 78, 76, 74, 71, 72, 74, 76, H, H, R,
  72, 72, 74, 76, 78, H, 76, 74, 72, 69, 71, 72, 74, H, H, R,
  79, 78, 79, 81, 83, H, 81, 79, 78, 76, 78, 79, 81, H, 74, H,
  76, 78, 79, 76, 74, 71, 69, 71, 67, 71, 74, 78, 79, H, H, R,
];
const BASS = [43, 43, 43, 48, 48, 50, 50, 43, 43, 43, 50, 50, 48, 43, 50, 43];
const BPM = 132;
const STEP = 60 / BPM / 2;

type Mode = 'menu' | 'fiesta' | 'calma' | 'final';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let timer: number | null = null;
let nextTime = 0;
let step = 0;
let marchOn = false;
let mode: Mode = 'menu';
let wanted = false;
let himne: HTMLAudioElement | null = null;
let himneOk: boolean | null = null;

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function audio(): AudioContext | null {
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!master) {
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/* ---------- dolçaina y tabalet ---------- */

function dolcaina(freq: number, t: number, dur: number, vol: number) {
  const a = ctx!;
  const o1 = a.createOscillator();
  const o2 = a.createOscillator();
  o1.type = 'sawtooth';
  o2.type = 'square';
  o1.frequency.setValueAtTime(freq, t);
  o2.frequency.setValueAtTime(freq * 1.003, t);
  const vib = a.createOscillator();
  const vg = a.createGain();
  vib.frequency.value = 5.5;
  vg.gain.value = freq * 0.006;
  vib.connect(vg);
  vg.connect(o1.frequency);
  vg.connect(o2.frequency);
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1400;
  bp.Q.value = 0.9;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.setValueAtTime(vol, t + Math.max(0.03, dur - 0.05));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o1.connect(bp);
  o2.connect(bp);
  bp.connect(g).connect(master!);
  for (const o of [o1, o2, vib]) {
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

function tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number) {
  const a = ctx!;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function tabalet(t: number, vol: number, roll = false) {
  const a = ctx!;
  const hits = roll ? 3 : 1;
  for (let k = 0; k < hits; k++) {
    const tt = t + k * (STEP / 3);
    const s = a.createBufferSource();
    s.buffer = noise;
    const f = a.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2200;
    f.Q.value = 0.7;
    const g = a.createGain();
    g.gain.setValueAtTime(vol * (k === hits - 1 ? 1 : 0.6), tt);
    g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.08);
    s.connect(f).connect(g).connect(master!);
    s.start(tt, Math.random() * 0.5);
    s.stop(tt + 0.1);
  }
}

function scheduleStep(i: number, t: number) {
  const bar = Math.floor(i / 4) % BASS.length;
  const beat = i % 4;
  if (beat === 0) tone(hz(BASS[bar]), t, STEP * 1.6, 'triangle', 0.3);
  if (beat === 2) tone(hz(BASS[bar] + 7), t, STEP * 1.6, 'triangle', 0.22);
  if (beat === 0) tabalet(t, 0.16);
  if (beat === 2) tabalet(t, 0.12, bar % 4 === 3);
  if (beat === 3) tabalet(t, 0.07);
  const m = MELODY[i % MELODY.length];
  if (m > 0) {
    let len = 1;
    while (MELODY[(i + len) % MELODY.length] === H && len < 4) len++;
    dolcaina(hz(m), t, STEP * len * 0.95, 0.11);
  }
}

function tick() {
  if (!ctx || !marchOn) return;
  while (nextTime < ctx.currentTime + 0.25) {
    scheduleStep(step, nextTime);
    step++;
    nextTime += STEP;
  }
}

function setGain(v: number, secs = 0.6) {
  if (!ctx || !master) return;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
  master.gain.linearRampToValueAtTime(v, ctx.currentTime + secs);
}

function startMarch() {
  const a = audio();
  if (!a || marchOn) return;
  marchOn = true;
  nextTime = a.currentTime + 0.05;
  timer = window.setInterval(tick, 60);
  tick();
}
function stopMarch() {
  marchOn = false;
  if (timer) clearInterval(timer);
  timer = null;
}

/* ---------- Himne ---------- */

async function himneAvailable(): Promise<boolean> {
  if (himneOk !== null) return himneOk;
  const h = himnePlayer();
  himneOk = await new Promise<boolean>((res) => {
    if (h.readyState >= 2) return res(true);
    const done = (v: boolean) => {
      h.removeEventListener('canplay', ok);
      h.removeEventListener('error', ko);
      res(v);
    };
    const ok = () => done(true);
    const ko = () => done(false);
    h.addEventListener('canplay', ok);
    h.addEventListener('error', ko);
    h.load();
    setTimeout(() => done(h.readyState >= 2), 6000);
  });
  return himneOk;
}

function himnePlayer() {
  if (!himne) {
    himne = new Audio('./music/himne.mp3');
    himne.preload = 'auto';
    himne.volume = 0.55;
    himne.addEventListener('ended', () => {
      // al acabar el himno, sigue la marcha
      if (wanted) {
        startMarch();
        setGain(mode === 'calma' ? 0.12 : 0.3);
      }
    });
  }
  return himne;
}

/* ---------- API ---------- */

export function musicEnabled() {
  return getPrefs().music !== false;
}
export function isMusicPlaying() {
  return wanted;
}

async function apply() {
  if (!wanted) return;
  const useHimne = (mode === 'menu' || mode === 'final') && (await himneAvailable());
  if (useHimne) {
    setGain(0, 0.4);
    stopMarch();
    const h = himnePlayer();
    if (h.paused) {
      if (h.ended || h.currentTime > h.duration - 1) h.currentTime = 0;
      h.play().catch(() => {});
    }
  } else {
    if (himne && !himne.paused) himne.pause();
    startMarch();
    setGain(mode === 'calma' ? 0.12 : 0.3);
  }
}

/** Arranca la música (tras un toque del usuario) */
export function startMusic() {
  if (wanted || !musicEnabled()) return;
  if (!audio()) return;
  wanted = true;
  apply();
}

export function stopMusic() {
  wanted = false;
  setGain(0, 0.3);
  stopMarch();
  if (himne && !himne.paused) himne.pause();
}

export function setMusicMood(m: Mode | 'fiesta' | 'calma') {
  if (m === mode) return;
  const wasHimne = mode === 'menu' || mode === 'final';
  mode = m as Mode;
  const isHimne = mode === 'menu' || mode === 'final';
  if (wasHimne && isHimne && himne && !himne.paused) return; // que siga sonando
  apply();
}

/** Estruendo de mascletà. corta = un masclet; larga = mini mascletà con terremoto final */
export function mascleta(larga = false) {
  if (!getPrefs().sound) return;
  const a = audio();
  if (!a || !noise) return;
  const out = a.createGain();
  out.gain.value = 0.9;
  out.connect(a.destination);
  const boom = (t: number, vol: number) => {
    const s = a.createBufferSource();
    s.buffer = noise;
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 0.25);
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    s.connect(lp).connect(g).connect(out);
    s.start(t, Math.random() * 0.6);
    s.stop(t + 0.4);
    const o = a.createOscillator();
    const og = a.createGain();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.2);
    og.gain.setValueAtTime(vol * 0.9, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.3);
  };
  const t0 = a.currentTime + 0.02;
  if (!larga) {
    boom(t0, 0.55);
    return;
  }
  // ritmo que acelera hasta el terremoto
  let t = t0;
  let gap = 0.42;
  for (let i = 0; i < 22; i++) {
    boom(t, 0.35 + Math.min(0.3, i * 0.015));
    t += gap;
    gap = Math.max(0.045, gap * 0.86);
  }
  for (let i = 0; i < 28; i++) boom(t + i * 0.035, 0.5);
}
