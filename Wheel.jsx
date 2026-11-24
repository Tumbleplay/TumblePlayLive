import { useState, useCallback, useRef, useEffect } from 'react';
import { GameShell, useAutobet, PlayButton, useBetCall, Chips, useChips, fmtX } from './shell.jsx';
import { BetInput, Seg } from '../components/common.jsx';
import { useApp } from '../lib/store.jsx';
import { reducedMotion } from '../lib/format.js';
import { triggerFX } from '../components/FXLayer.jsx';
import { sfx } from '../lib/sfx.js';

const sliceCol = m => (m === 0 ? '#1e3343' : m < 1.5 ? '#12b886' : m < 2 ? '#e2e8f0' : m < 3 ? '#fbbf24' : m < 5 ? '#f97316' : m < 10 ? '#a855f7' : '#ff2e6e');

export default function Wheel() {
  const { config } = useApp();
  const [bet, setBet] = useState(10);
  const [risk, setRisk] = useState('medium');
  const [segments, setSegments] = useState(20);
  const [spinning, setSpinning] = useState(false);
  const [last, setLast] = useState(null);
  const [chips, addChip] = useChips();
  const call = useBetCall();

  const cv = useRef(null);
  const wheelState = useRef({ angle: 0, flapper: 0, winIdx: -1, spinning: false });
  const list = config?.wheel?.[segments]?.[risk] || [];
  const listRef = useRef(list);
  useEffect(() => { listRef.current = list; }, [list]);

  // 60fps Mechanical Wheel Canvas with LED Rim & Deflecting Flapper
  useEffect(() => {
    let raf;
    const draw = now => {
      const c = cv.current;
      const segs = listRef.current;
      if (c && segs.length) {
        const ctx = c.getContext('2d');
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const S = 320;
        if (c.width !== S * dpr) { c.width = S * dpr; c.height = S * dpr; }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, S, S);

        const st = wheelState.current;
        st.flapper *= 0.82;
        const cx = S / 2, cy = S / 2 + 8;
        const R = 136, n = segs.length, step = (Math.PI * 2) / n;

        // Outer metallic ring
        ctx.beginPath(); ctx.arc(cx, cy, R + 12, 0, Math.PI * 2);
        ctx.fillStyle = '#0c1b26'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#2c465a'; ctx.stroke();

        // Chasing LED bulbs around bezel
        const bulbCount = 24;
        const phase = Math.floor(now / (st.spinning ? 70 : 280));
        for (let i = 0; i < bulbCount; i++) {
          const a = (i * Math.PI * 2) / bulbCount;
          const bx = cx + Math.cos(a) * (R + 6);
          const by = cy + Math.sin(a) * (R + 6);
          const lit = (i + phase) % 2 === 0;
          ctx.beginPath(); ctx.arc(bx, by, lit ? 3.2 : 2.3, 0, Math.PI * 2);
          ctx.fillStyle = lit ? '#fbbf24' : '#334155';
          if (lit) { ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 8; }
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        // Rotating segments
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(st.angle);
        for (let i = 0; i < n; i++) {
          const a1 = i * step - Math.PI / 2 - step / 2;
          const a2 = a1 + step;
          const isWin = !st.spinning && st.winIdx === i;

          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, R, a1, a2);
          ctx.closePath();
          ctx.fillStyle = sliceCol(segs[i]);
          ctx.fill();
          if (isWin) {
            ctx.fillStyle = `rgba(255,255,255,${0.25 + Math.sin(now * 0.012) * 0.12})`;
            ctx.fill();
          }
          ctx.strokeStyle = '#07111a';
          ctx.lineWidth = 1.6;
          ctx.stroke();

          // Rim peg pin at each boundary
          const px = Math.cos(a1) * (R - 4), py = Math.sin(a1) * (R - 4);
          ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#e2e8f0'; ctx.fill();
        }

        // Inner dark hub
        ctx.beginPath(); ctx.arc(0, 0, R * 0.72, 0, Math.PI * 2);
        ctx.fillStyle = '#0b1824'; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = '#243b4d'; ctx.stroke();
        ctx.restore();

        // Top mechanical flapper pointer (kicks on every peg crossing!)
        ctx.save();
        ctx.translate(cx, cy - R - 14);
        ctx.rotate(st.flapper);
        ctx.shadowColor = 'rgba(0,0,0,0.65)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#ff2e4c';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-11, 0);
        ctx.lineTo(11, 0);
        ctx.lineTo(0, 28);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const spin = useCallback(async (amt = bet) => {
    setSpinning(true);
    sfx.click();
    const r = await call('/casino/wheel/bet', { amount: amt, risk, segments }, { defer: true, stake: amt });
    if (!r) { setSpinning(false); return null; }

    const st = wheelState.current;
    st.spinning = true;
    st.winIdx = r.index;
    const n = segments;
    const step = (Math.PI * 2) / n;
    const a0 = st.angle;
    // Align r.index directly under top pointer (angle = 0)
    const desiredMod = ((-r.index * step) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const curMod = ((a0 % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    let delta = desiredMod - curMod;
    if (delta <= 0) delta += Math.PI * 2;
    const targetA = a0 + Math.PI * 2 * 5 + delta;

    const dur = reducedMotion() ? 60 : 3200;
    const t0 = performance.now();
    let lastPeg = Math.floor(a0 / step);

    return new Promise(resolve => {
      const tick = now => {
        const p = Math.min(1, (now - t0) / dur);
        const ease = 1 - Math.pow(1 - p, 3.6);
        st.angle = a0 + (targetA - a0) * ease;

        const curPeg = Math.floor(st.angle / step);
        if (curPeg !== lastPeg) {
          lastPeg = curPeg;
          st.flapper = -0.45 * (1 - p * 0.4);
          sfx.tick(0.8 + (1 - p) * 0.5);
        }

        if (p < 1) {
          requestAnimationFrame(tick);
        } else {
          st.spinning = false;
          setLast(r);
          addChip(fmtX(r.multiplier), r.multiplier >= 1);
          r.commit?.();
          if (r.multiplier >= 1) triggerFX(r.multiplier >= 5 ? 'jackpot' : 'win', { intensity: 1.1 });
          else sfx.loss();
          setSpinning(false);
          resolve(r);
        }
      };
      requestAnimationFrame(tick);
    });
  }, [bet, risk, segments, call]); // eslint-disable-line

  const auto = useAutobet({ play: spin, bet, setBet, delay: 400 });
  const legend = [...new Set(list)].sort((a, b) => a - b);

  return (
    <GameShell
      game="wheel"
      controls={
        <>
          {auto.panel}
          <BetInput value={bet} onChange={setBet} disabled={auto.running || spinning} />
          <div className="field"><span>Risk</span><Seg value={risk} onChange={setRisk} disabled={auto.running || spinning} options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} /></div>
          <label className="field">
            <span>Segments</span>
            <select className="input" value={segments} disabled={auto.running || spinning} onChange={e => { sfx.click(); setSegments(Number(e.target.value)); }}>
              {[10, 20, 30, 40, 50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <PlayButton auto={auto} onManual={() => spin()} busy={spinning} label="Spin Wheel" />
        </>
      }
      stage={
        <div className="wheel-stage">
          <Chips items={chips} />
          <div className="wheel-canvas-box">
            <canvas ref={cv} width={320} height={320} style={{ width: 320, height: 320, maxWidth: '100%' }} />
            <div className="wheel-center-readout">
              <b className={last ? (last.multiplier >= 1 ? 'pos' : 'neg') : ''}>
                {last ? fmtX(last.multiplier) : 'SPIN'}
              </b>
            </div>
          </div>
          <div className="wheel-legend">
            {legend.map(m => (
              <div key={m} className={`wleg${last?.multiplier === m && !spinning ? ' hit' : ''}`} style={{ borderBottomColor: sliceCol(m) }}>
                {fmtX(m)}
              </div>
            ))}
          </div>
        </div>
      }
    />
  );
}
