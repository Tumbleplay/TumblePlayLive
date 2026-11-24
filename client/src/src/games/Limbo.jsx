import { useState, useCallback, useRef, useEffect } from 'react';
import { GameShell, useAutobet, PlayButton, useBetCall, Chips, useChips, fmtX } from './shell.jsx';
import { BetInput, ProfitOnWin } from '../components/common.jsx';
import { reducedMotion } from '../lib/format.js';
import { triggerFX } from '../components/FXLayer.jsx';
import { sfx } from '../lib/sfx.js';

export default function Limbo() {
  const [bet, setBet] = useState(10);
  const [target, setTarget] = useState(2);
  const [shown, setShown] = useState(1);
  const [state, setState] = useState('idle');
  const [busy, setBusy] = useState(false);
  const [chips, addChip] = useChips();
  const call = useBetCall();

  const cv = useRef(null);
  const warpRef = useRef({ speed: 0.35, color: '#38bdf8' });

  // 60fps Starfield Warp Tunnel Canvas
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const stars = Array.from({ length: 75 }, () => ({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: Math.random()
    }));
    let raf;
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(280, c.clientWidth), H = Math.max(240, c.clientHeight);
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
        c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const sp = warpRef.current.speed;
      const col = warpRef.current.color;
      const cx = W / 2, cy = H / 2;

      for (const s of stars) {
        const prevZ = s.z;
        s.z -= 0.008 * sp;
        if (s.z <= 0.02) {
          s.x = (Math.random() - 0.5) * 2;
          s.y = (Math.random() - 0.5) * 2;
          s.z = 1;
          continue;
        }
        const sx = cx + (s.x / s.z) * W * 0.45;
        const sy = cy + (s.y / s.z) * H * 0.45;
        const px = cx + (s.x / prevZ) * W * 0.45;
        const py = cy + (s.y / prevZ) * H * 0.45;
        const alpha = Math.min(0.85, (1 - s.z) * 0.9);
        ctx.strokeStyle = col;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = (1 - s.z) * 2.4;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      warpRef.current.speed = Math.max(0.35, warpRef.current.speed * 0.96);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const chance = Math.min(99, Math.max(0.01, Math.round((99 / Math.max(1.01, target)) * 100) / 100));

  const play = useCallback(async (amt = bet) => {
    setBusy(true);
    setState('rolling');
    warpRef.current.speed = 6.5;
    warpRef.current.color = '#fbbf24';
    sfx.takeoff();

    const r = await call('/casino/limbo/bet', { amount: amt, target }, { defer: true, stake: amt });
    if (!r) { setBusy(false); setState('idle'); return null; }

    const end = r.point;
    const dur = reducedMotion() ? 20 : 380;
    const t0 = performance.now();

    return new Promise(resolve => {
      const step = now => {
        const p = Math.min(1, (now - t0) / dur);
        const ease = Math.pow(p, 1.8);
        const cur = 1 + (end - 1) * ease;
        setShown(cur);
        if (p < 1) {
          requestAnimationFrame(step);
        } else {
          setShown(end);
          setState(r.win ? 'win' : 'loss');
          warpRef.current.color = r.win ? '#00e701' : '#ff2e4c';
          warpRef.current.speed = r.win ? 4.5 : 0.4;
          addChip(fmtX(end), r.win);
          r.commit?.();
          if (r.win) triggerFX(end >= 5 ? 'jackpot' : 'win', { intensity: 1.1 });
          else sfx.loss();
          setBusy(false);
          resolve(r);
        }
      };
      requestAnimationFrame(step);
    });
  }, [bet, target, call]); // eslint-disable-line

  const auto = useAutobet({ play, bet, setBet, delay: 420 });

  return (
    <GameShell
      game="limbo"
      controls={
        <>
          {auto.panel}
          <BetInput value={bet} onChange={setBet} disabled={auto.running} />
          <ProfitOnWin amount={bet} multiplier={target} />
          <PlayButton auto={auto} onManual={() => play()} busy={busy} label="Launch Limbo" />
        </>
      }
      stage={
        <div className={`limbo-stage ${state}`}>
          <canvas ref={cv} className="limbo-warp" aria-hidden="true" />
          <Chips items={chips} />
          <div className="limbo-center">
            <div className="limbo-kicker">{state === 'win' ? 'TARGET CLEARED!' : state === 'loss' ? 'FELL SHORT' : state === 'rolling' ? 'WARPING...' : 'TARGET ' + fmtX(target)}</div>
            <div className={`limbo-num ${state}`}>{fmtX(shown)}</div>
          </div>
          <div className="dice-stats" style={{ position: 'relative', zIndex: 2 }}>
            <label className="field">
              <span>Target multiplier</span>
              <input className="input" type="number" min="1.01" max="1000000" step="0.01" value={target} disabled={auto.running}
                onChange={e => setTarget(Math.max(1.01, Number(e.target.value) || 1.01))} />
            </label>
            <div className="field"><span>Win chance</span><input className="input" readOnly value={`${chance}%`} /></div>
          </div>
        </div>
      }
    />
  );
}
