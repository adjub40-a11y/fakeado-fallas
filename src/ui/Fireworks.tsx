// Fondo de fuegos artificiales (Nit del Foc) dibujado en un canvas, ligero y respetando "reducir movimiento"
import { useEffect, useRef } from 'react';

type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
const COLORS = ['#ffc61a', '#ff7a1a', '#ff3b30', '#41b6ff', '#ffffff', '#ffe27a'];

export default function Fireworks() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = c.clientWidth;
      h = c.clientHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const parts: P[] = [];
    const stars = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random() * 0.7, r: Math.random() * 1.2 + 0.3 }));

    function burst(x: number, y: number) {
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const n = 46 + Math.floor(Math.random() * 30);
      const speed = 1.6 + Math.random() * 1.6;
      // palmera: más partículas cayendo con estela
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const s = speed * (0.6 + Math.random() * 0.5);
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 70 + Math.random() * 40, color, size: 1.6 + Math.random() * 1.2 });
      }
    }

    function drawStatic() {
      ctx!.clearRect(0, 0, w, h);
      for (const s of stars) {
        ctx!.fillStyle = 'rgba(255,255,255,0.5)';
        ctx!.fillRect(s.x * w, s.y * h, s.r, s.r);
      }
    }
    if (reduce) {
      drawStatic();
      return () => window.removeEventListener('resize', resize);
    }

    let raf = 0;
    let t = 0;
    let next = 30;
    const loop = () => {
      t++;
      if (document.hidden) {
        raf = requestAnimationFrame(loop);
        return;
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(12,10,42,0.22)';
      ctx.fillRect(0, 0, w, h);
      for (const s of stars) {
        ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.25 * Math.sin((t + s.x * 100) / 30)})`;
        ctx.fillRect(s.x * w, s.y * h, s.r, s.r);
      }
      if (t >= next) {
        burst(w * (0.1 + Math.random() * 0.8), h * (0.08 + Math.random() * 0.35));
        next = t + 50 + Math.floor(Math.random() * 90);
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life++;
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.035;
        p.x += p.vx;
        p.y += p.vy;
        const a = 1 - p.life / p.max;
        if (a <= 0) {
          parts.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return <canvas id="fx" ref={ref} aria-hidden="true" />;
}
