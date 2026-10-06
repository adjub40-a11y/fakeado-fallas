// Sonidos sintetizados (sin archivos) y vibración
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { getPrefs } from './local';

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (!getPrefs().sound) return null;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'triangle', when = 0, vol = 0.18) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  tap: () => tone(660, 0.07),
  send: () => {
    tone(520, 0.08);
    tone(780, 0.12, 'triangle', 0.07);
  },
  stamp: () => {
    tone(110, 0.18, 'square', 0, 0.22);
    tone(70, 0.25, 'sine', 0.02, 0.25);
  },
  truth: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', i * 0.08));
  },
  tick: () => tone(1200, 0.03, 'square', 0, 0.06),
};

export function buzz(strong = false) {
  if (!Capacitor.isNativePlatform()) return;
  Haptics.impact({ style: strong ? ImpactStyle.Heavy : ImpactStyle.Light }).catch(() => {});
}

/** Lectura en voz alta de la pregunta, si el sistema lo permite */
export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
export function speak(text: string) {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/_{2,}/g, ' algo '));
  u.lang = 'es-ES';
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}
