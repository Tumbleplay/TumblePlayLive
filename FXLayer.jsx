import { useEffect, useRef } from 'react';
import { reducedMotion } from '../lib/format.js';

export function triggerFX(kind = 'win', opts = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('tumble:fx', { detail: { kind, ...opts } }));
}

export default function FXLayer() {
  const cv = useRef(null);
  const state = useRef({ parts: [], rings: [], raf: 0, W: 0, H: 0 });

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext('2d');

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      state.current.W = c.clientWidth;
      state.current.H = c.clientHeight;
      c.width = state.current.W * dpr;
      c.height = state.current.H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const loop = () => {
      const st = state.current;
      ctx.clearRect(0, 0, st.W, st.H);

      for (let i = st.rings.length - 1; i >= 0; i--) {
        const r = st.rings[i];
        r.radius += r.speed;
        r.alpha *= 0.91;
        r.width *= 0.96;
        if (r.alpha < 0.02) { st.rings.splice(i, 1); continue; }
        ctx.save();
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = r.color;
        ctx.globalAlpha = r.alpha;
        ctx.lineWidth = Math.max(1, r.width);
        ctx.shadowColor = r.color;
        ctx.shadowBlur = 16;
        ctx.stroke();
        ctx.restore();
      }

      for (let i = st.parts.length - 1; i >= 0; i--) {
        const p = st.parts[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= p.drag;
        p.vy = p.vy * p.drag + p.g;
        p.rot += p.vrot;
        p.life -= p.decay;
        if (p.life <= 0) { st.parts.splice(i, 1); continue; }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, p.life);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = p.glow;
        if (p.shape === 'coin') {
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * Math.abs(Math.cos(p.rot * 1.4)), 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'diamond') {
          ctx.beginPath();
          ctx.moveTo(0, -p.size * 1.3);
          ctx.lineTo(p.size, 0);
          ctx.lineTo(0, p.size * 1.3);
          ctx.lineTo(-p.size, 0);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(-p.size * 0.5, -p.size * 0.5, p.size, p.size * 0.6);
        }
        ctx.restore();
      }

      st.raf = (st.parts.length || st.rings.length) ? requestAnimationFrame(loop) : 0;
    };

    const spawn = e => {
      if (reducedMotion()) return;
      const { kind = 'win', x: rx, y: ry, intensity = 1 } = e.detail || {};
      const st = state.current;
      if (!st.W || !st.H) resize();
      const x = rx != null ? rx * st.W : st.W * 0.5;
      const y = ry != null ? ry * st.H : st.H * 0.48;

      const palettes = {
        win: ['#00e701', '#7cff8a', '#fbbf24', '#ffffff'],
        jackpot: ['#fbbf24', '#fde047', '#00e701', '#38bdf8', '#ffffff'],
        gem: ['#00e701', '#34d399', '#6ee7b7', '#ffffff'],
        bust: ['#ff2e4c', '#fb7185', '#f97316', '#fde047'],
        spark: ['#38bdf8', '#a855f7', '#00e701', '#ffffff']
      };
      const cols = palettes[kind] || palettes.win;
      const ringCol = kind === 'bust' ? '#ff2e4c' : kind === 'jackpot' ? '#fbbf24' : '#00e701';

      st.rings.push({ x, y, radius: 12, speed: 9 * intensity, alpha: 0.9, width: 6, color: ringCol });
      if (kind === 'jackpot' || kind === 'bust') {
        st.rings.push({ x, y, radius: 4, speed: 5.5 * intensity, alpha: 0.75, width: 3.5, color: '#ffffff' });
      }

      const count = Math.min(90, Math.round((kind === 'jackpot' ? 64 : kind === 'bust' ? 42 : 30) * intensity));
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (2.4 + Math.random() * 8.5) * intensity;
        st.parts.push({
          x, y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (kind === 'bust' ? 1.5 : 3.2),
          drag: 0.96,
          g: kind === 'gem' ? 0.08 : 0.22,
          size: (kind === 'jackpot' ? 5.5 : 4.2) + Math.random() * 4.5,
          rot: Math.random() * 6.28,
          vrot: (Math.random() - 0.5) * 0.3,
          life: 1 + Math.random() * 0.4,
          decay: 0.017 + Math.random() * 0.014,
          color: cols[i % cols.length],
          glow: kind === 'bust' ? 14 : 10,
          shape: kind === 'jackpot' || kind === 'win' ? (i % 3 === 0 ? 'coin' : 'rect') : kind === 'gem' ? 'diamond' : 'rect'
        });
      }

      if (!st.raf) st.raf = requestAnimationFrame(loop);
    };

    window.addEventListener('tumble:fx', spawn);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('tumble:fx', spawn);
      cancelAnimationFrame(state.current.raf);
    };
  }, []);

  return <canvas ref={cv} className="fx-canvas" aria-hidden="true" />;
}
