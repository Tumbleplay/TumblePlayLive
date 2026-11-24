import { useState, useRef, useEffect, useCallback } from 'react';
import { GameShell, useAutobet, PlayButton, useBetCall, Chips, useChips, fmtX } from './shell.jsx';
import { BetInput, Seg } from '../components/common.jsx';
import { useApp } from '../lib/store.jsx';
import { reducedMotion } from '../lib/format.js';
import { triggerFX } from '../components/FXLayer.jsx';
import { sfx } from '../lib/sfx.js';

function bucketColor(m) {
  if (m >= 100) return ['#ff1e56', '#9f1239'];
  if (m >= 10) return ['#ff5a26', '#b91c1c'];
  if (m >= 2) return ['#f59e0b', '#b45309'];
  if (m >= 1) return ['#eab308', '#854d0e'];
  return ['#475569', '#1e293b'];
}

export default function Plinko() {
  const { config } = useApp();
  const [bet, setBet] = useState(10);
  const [rows, setRows] = useState(12);
  const [risk, setRisk] = useState('medium');
  const [chips, addChip] = useChips();
  const [hit, setHit] = useState(null);
  const call = useBetCall();

  const cv = useRef(null);
  const balls = useRef([]);
  const ripples = useRef([]);
  const sparks = useRef([]);
  const pegGlow = useRef(new Map());
  const table = config?.plinko?.[rows]?.[risk] || [];

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    let raf;

    const draw = now => {
      const W = 680, H = 450;
      const top = 34, bot = H - 30, dy = (bot - top) / (rows + 1);
      const dx = Math.min(44, (W - 76) / (rows + 2));
      const pegX = (r, i) => W / 2 + (i - (r + 2) / 2) * dx;
      const pegY = r => top + (r + 1) * dy;

      ctx.clearRect(0, 0, W, H);

      // Subtle radial glow behind peg pyramid
      const bg = ctx.createRadialGradient(W / 2, H * 0.45, 20, W / 2, H * 0.5, 320);
      bg.addColorStop(0, 'rgba(20, 117, 225, 0.1)');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Peg impact shockwave ripples
      for (let i = ripples.current.length - 1; i >= 0; i--) {
        const rp = ripples.current[i];
        rp.rad += 1.45;
        rp.alpha *= 0.87;
        if (rp.alpha < 0.03) { ripples.current.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.rad, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(56, 189, 248, ${rp.alpha})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw glowing pegs
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < r + 3; i++) {
          const key = `${r}-${i}`;
          const g = pegGlow.current.get(key) || 0;
          if (g > 0) pegGlow.current.set(key, Math.max(0, g - 0.055));
          const px = pegX(r, i), py = pegY(r);
          const rad = (rows > 12 ? 3.5 : 4.6) + g * 2.1;

          ctx.save();
          if (g > 0.05) {
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 16 * g;
          }
          ctx.fillStyle = g > 0.05 ? `rgba(186, 230, 253, ${0.7 + g * 0.3})` : 'rgba(226, 232, 240, 0.72)';
          ctx.beginPath();
          ctx.arc(px, py, rad, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // Bucket impact sparks
      for (let i = sparks.current.length - 1; i >= 0; i--) {
        const sp = sparks.current[i];
        sp.x += sp.vx; sp.y += sp.vy; sp.vy += 0.22; sp.life -= 0.04;
        if (sp.life <= 0) { sparks.current.splice(i, 1); continue; }
        ctx.fillStyle = sp.color;
        ctx.globalAlpha = sp.life;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Animate balls with glowing comet trails + peg hit physics
      balls.current = balls.current.filter(b => {
        const stepMs = reducedMotion() ? 20 : 122;
        const p = (now - b.t0) / stepMs;
        if (p >= b.pts.length - 1) { b.done(); return false; }
        const idx = Math.floor(p), f = p - idx;
        if (idx > b.lastRow && idx < rows) {
          b.lastRow = idx;
          const hitPegX = b.pts[idx][0], hitPegY = b.pts[idx][1];
          const colIdx = Math.round((hitPegX - W / 2) / dx + (idx + 2) / 2);
          pegGlow.current.set(`${idx}-${colIdx}`, 1);
          ripples.current.push({ x: hitPegX, y: hitPegY, rad: 4, alpha: 0.78 });
          sfx.peg(idx / rows);
        }
        const [x0, y0] = b.pts[idx], [x1, y1] = b.pts[idx + 1];
        const easeX = f;
        const arc = Math.sin(f * Math.PI) * (dy * 0.34);
        const bx = x0 + (x1 - x0) * easeX;
        const by = y0 + (y1 - y0) * (f * f * 0.45 + f * 0.55) - arc;

        b.trail.push([bx, by]);
        if (b.trail.length > 10) b.trail.shift();

        // Comet tail
        for (let k = 0; k < b.trail.length; k++) {
          const [tx, ty] = b.trail[k];
          const ratio = (k + 1) / b.trail.length;
          ctx.beginPath();
          ctx.arc(tx, ty, (rows > 12 ? 4.8 : 6.2) * ratio * 0.85, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 198, 46, ${ratio * 0.35})`;
          ctx.fill();
        }

        // Luminous gold-amber ball
        ctx.save();
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 18;
        const grad = ctx.createRadialGradient(bx - 2, by - 2, 1, bx, by, rows > 12 ? 6.5 : 8);
        grad.addColorStop(0, '#fffbeb');
        grad.addColorStop(0.45, '#fbbf24');
        grad.addColorStop(1, '#ea580c');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(bx, by, rows > 12 ? 5.8 : 7.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return true;
      });

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [rows]);

  const drop = useCallback(async (amt = bet) => {
    sfx.click();
    const r = await call('/casino/plinko/bet', { amount: amt, rows, risk }, { defer: true, stake: amt });
    if (!r) return null;

    const W = 680, H = 450, top = 34, bot = H - 30, dy = (bot - top) / (rows + 1);
    const dx = Math.min(44, (W - 76) / (rows + 2));
    const pts = [[W / 2 + (Math.random() - 0.5) * 8, 12]];
    let pos = 0;
    for (let i = 0; i < r.path.length; i++) {
      pos += r.path[i] ? 0.5 : -0.5;
      pts.push([W / 2 + pos * dx, top + (i + 1) * dy]);
    }
    const endX = W / 2 + (r.bucket - rows / 2) * dx;
    pts.push([endX, bot]);

    return new Promise(res => {
      balls.current.push({
        pts,
        t0: performance.now(),
        lastRow: -1,
        trail: [],
        done: () => {
          r.commit?.();
          setHit({ i: r.bucket, k: Math.random() });
          addChip(fmtX(r.multiplier), r.multiplier >= 1);
          const col = bucketColor(r.multiplier)[0];
          for (let s = 0; s < 14; s++) {
            const a = -Math.PI * Math.random();
            const v = 2 + Math.random() * 4.5;
            sparks.current.push({ x: endX, y: bot - 4, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, size: 2 + Math.random() * 2.5, life: 1, color: col });
          }
          if (r.multiplier >= 5) triggerFX('jackpot', { x: endX / W, y: 0.85, intensity: 1.15 });
          else if (r.multiplier >= 1) sfx.gem(2);
          else sfx.tick(0.7);
          res(r);
        }
      });
    });
  }, [bet, rows, risk, call]); // eslint-disable-line

  const auto = useAutobet({ play: drop, bet, setBet, delay: 220 });

  return (
    <GameShell
      game="plinko"
      controls={
        <>
          {auto.panel}
          <BetInput value={bet} onChange={setBet} disabled={auto.running} />
          <div className="field"><span>Risk</span><Seg value={risk} onChange={setRisk} disabled={auto.running} options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} /></div>
          <div className="field"><span>Rows</span><Seg value={rows} onChange={setRows} disabled={auto.running} options={[[8, '8'], [12, '12'], [16, '16']]} /></div>
          <PlayButton auto={auto} onManual={() => drop()} label="Drop Ball" />
        </>
      }
      stage={
        <div className="plinko-wrap">
          <Chips items={chips} />
          <canvas ref={cv} width={680} height={450} style={{ width: '100%', maxWidth: 680, height: 'auto', display: 'block' }} />
          <div className="buckets" style={{ width: '100%', maxWidth: Math.min(680, (rows + 1) * Math.min(44, 604 / (rows + 2))) }}>
            {table.map((m, i) => {
              const [c1, c2] = bucketColor(m);
              return (
                <div key={i} className={`bucket${hit?.i === i ? ' hit' : ''}`} style={{ background: `linear-gradient(180deg, ${c1}, ${c2})`, color: m >= 1 ? '#07111a' : '#e2e8f0' }}>
                  {m >= 100 ? Math.round(m) : m}×
                </div>
              );
            })}
          </div>
        </div>
      }
    />
  );
}
