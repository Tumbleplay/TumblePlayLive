import { useState, useRef, useEffect } from 'react';
import { GameShell, useBetCall, Chips, useChips, fmt } from './shell.jsx';
import { useApp } from '../lib/store.jsx';
import { Coin } from '../components/common.jsx';
import { triggerFX } from '../components/FXLayer.jsx';
import { sfx } from '../lib/sfx.js';

const WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const pocketColor = n => (n === 0 ? '#00b84c' : RED.has(n) ? '#dc2626' : '#111827');
const CHIPS = [[1, '#3b82f6'], [5, '#ef4444'], [10, '#00e701'], [25, '#f59e0b'], [100, '#a855f7'], [500, '#e2e8f0']];

export default function Roulette() {
  const { user, setAuthOpen, toast } = useApp();
  const [chip, setChip] = useState(5);
  const [bets, setBets] = useState({});
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [chips, addChip] = useChips();
  const call = useBetCall();

  const cv = useRef(null);
  const anim = useRef({
    wheelAngle: 0,
    ballAngle: -Math.PI / 2,
    ballRadius: 122,
    spinning: false,
    winNum: null,
    highlightPulse: 0
  });

  const total = Object.values(bets).reduce((a, b) => a + b, 0);
  const addBet = key => {
    if (spinning) return;
    sfx.chip();
    setBets(b => ({ ...b, [key]: (b[key] || 0) + chip }));
  };

  // Continuous crisp 60fps Canvas European Roulette Wheel
  useEffect(() => {
    let raf;
    const render = () => {
      const c = cv.current;
      if (c) {
        const ctx = c.getContext('2d');
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const S = 280;
        if (c.width !== S * dpr) { c.width = S * dpr; c.height = S * dpr; }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, S, S);

        const st = anim.current;
        if (!st.spinning) {
          st.wheelAngle += 0.0022;
          if (st.winNum != null) {
            const idx = WHEEL_ORDER.indexOf(st.winNum);
            const slice = (Math.PI * 2) / 37;
            st.ballAngle = st.wheelAngle + idx * slice - Math.PI / 2;
            st.ballRadius = 86;
          }
        }
        if (st.highlightPulse > 0) st.highlightPulse = Math.max(0, st.highlightPulse - 0.02);

        const cx = S / 2, cy = S / 2;
        const slice = (Math.PI * 2) / 37;

        // Outer mahogany rim + metallic gold bezel
        const wood = ctx.createRadialGradient(cx, cy, 108, cx, cy, 136);
        wood.addColorStop(0, '#5a2e16');
        wood.addColorStop(0.7, '#31170a');
        wood.addColorStop(1, '#180a04');
        ctx.beginPath(); ctx.arc(cx, cy, 136, 0, Math.PI * 2);
        ctx.fillStyle = wood; ctx.fill();
        ctx.lineWidth = 3.5; ctx.strokeStyle = '#d4af37'; ctx.stroke();

        // 8 gold diamond deflectors on outer ball track
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          const dx = cx + Math.cos(a) * 124, dy = cy + Math.sin(a) * 124;
          ctx.save();
          ctx.translate(dx, dy);
          ctx.rotate(a);
          ctx.fillStyle = '#f5d061';
          ctx.beginPath();
          ctx.moveTo(0, -4.5); ctx.lineTo(3, 0); ctx.lineTo(0, 4.5); ctx.lineTo(-3, 0);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }

        // Rotating pocket wheel
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(st.wheelAngle);
        for (let i = 0; i < 37; i++) {
          const n = WHEEL_ORDER[i];
          const a1 = i * slice - Math.PI / 2 - slice / 2;
          const a2 = a1 + slice;
          const isWin = !st.spinning && st.winNum === n;

          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, 114, a1, a2);
          ctx.closePath();
          ctx.fillStyle = pocketColor(n);
          ctx.fill();
          if (isWin) {
            ctx.fillStyle = `rgba(0, 231, 1, ${0.28 + Math.sin(performance.now() * 0.01) * 0.14})`;
            ctx.fill();
          }
          ctx.strokeStyle = isWin ? '#00e701' : '#d4af37';
          ctx.lineWidth = isWin ? 1.8 : 0.85;
          ctx.stroke();

          // Pocket number
          const mid = (a1 + a2) / 2;
          ctx.save();
          ctx.rotate(mid + Math.PI / 2);
          ctx.fillStyle = '#ffffff';
          ctx.font = '800 8.5px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(n), 0, -101);
          ctx.restore();
        }

        // Inner pocket fret ring
        ctx.beginPath(); ctx.arc(0, 0, 91, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(212,175,55,0.7)'; ctx.lineWidth = 1.4; ctx.stroke();

        // Center turret cone with radial gold sheen
        const cone = ctx.createRadialGradient(-10, -10, 6, 0, 0, 74);
        cone.addColorStop(0, '#2a4357');
        cone.addColorStop(0.65, '#132431');
        cone.addColorStop(1, '#09131c');
        ctx.beginPath(); ctx.arc(0, 0, 74, 0, Math.PI * 2);
        ctx.fillStyle = cone; ctx.fill();
        ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 3; ctx.stroke();

        // Rotating gold turret cross-arms
        ctx.strokeStyle = '#f5d061';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * 44, Math.sin(a) * 44);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(Math.cos(a) * 44, Math.sin(a) * 44, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#fde68a'; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fillStyle = '#d4af37'; ctx.fill();
        ctx.restore();

        // Ivory ball with realistic drop shadow & specular highlight
        const bx = cx + Math.cos(st.ballAngle) * st.ballRadius;
        const by = cy + Math.sin(st.ballAngle) * st.ballRadius;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 7;
        ctx.shadowOffsetY = 2;
        const bg = ctx.createRadialGradient(bx - 2, by - 2, 1, bx, by, 6);
        bg.addColorStop(0, '#ffffff');
        bg.addColorStop(0.7, '#e2e8f0');
        bg.addColorStop(1, '#94a3b8');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(bx, by, 5.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  const spin = async () => {
    if (!user) return setAuthOpen('login');
    if (!total) return toast('Place at least one chip on the table', 'error');
    setSpinning(true);
    setResult(null);
    sfx.click();

    const entries = Object.entries(bets).map(([k, amount]) => {
      const [type, v] = k.split(':');
      return { type, value: v == null ? undefined : Number(v), amount };
    });
    const r = await call('/casino/roulette/bet', { bets: entries }, { defer: true, stake: total });
    if (!r) { setSpinning(false); return; }

    const winNum = r.number ?? 0;
    const idx = WHEEL_ORDER.indexOf(winNum);
    const slice = (Math.PI * 2) / 37;
    const st = anim.current;
    st.spinning = true;
    st.winNum = winNum;

    const dur = 4000;
    const t0 = performance.now();
    const w0 = st.wheelAngle;
    const wTarget = w0 + Math.PI * 2 * 3.4;
    const finalPocketAngle = wTarget + idx * slice - Math.PI / 2;
    const b0 = st.ballAngle;
    // Counter-spin 7 full revolutions then lock smoothly into the exact pocket
    const bTarget = finalPocketAngle - Math.PI * 2 * 7;
    let lastTickIdx = -1;

    const step = now => {
      const p = Math.min(1, (now - t0) / dur);
      const easeW = 1 - Math.pow(1 - p, 2.6);
      const easeB = 1 - Math.pow(1 - p, 3.4);

      st.wheelAngle = w0 + (wTarget - w0) * easeW;
      st.ballAngle = b0 + (bTarget - b0) * easeB;

      // Ball rides outer rim until 62%, drops across deflectors with bounce into pocket at 86%
      if (p < 0.62) {
        st.ballRadius = 123;
      } else if (p < 0.88) {
        const dp = (p - 0.62) / 0.26;
        const bounce = Math.abs(Math.sin(dp * Math.PI * 2.5)) * (1 - dp) * 9;
        st.ballRadius = 123 - dp * 37 + bounce;
      } else {
        const settle = (p - 0.88) / 0.12;
        st.ballRadius = 86 + Math.sin(settle * Math.PI * 2) * (1 - settle) * 2.5;
      }

      // Authentic slowing pocket tick audio
      const rel = ((st.ballAngle - st.wheelAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const curSlot = Math.floor(rel / slice);
      if (curSlot !== lastTickIdx && p < 0.96) {
        lastTickIdx = curSlot;
        sfx.tick(0.85 + (1 - p) * 0.55);
      }

      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        st.spinning = false;
        st.highlightPulse = 1;
        setResult(winNum);
        addChip(String(winNum), r.payout > 0);
        r.commit?.();
        setSpinning(false);
        if (r.payout > 0) {
          triggerFX(r.multiplier >= 5 ? 'jackpot' : 'win', { intensity: 1.25 });
          toast(`Roulette hit ${winNum}! Won ${fmt(r.payout)} coins`, 'win');
        } else {
          sfx.loss();
          toast(`Roulette landed on ${winNum}`, 'info');
        }
      }
    };
    requestAnimationFrame(step);
  };

  return (
    <GameShell
      game="roulette"
      controls={
        <div className="rl-controls">
          <div className="field">
            <span>Select Chip</span>
            <div className="rl-chip-row">
              {CHIPS.map(([val, col]) => (
                <button key={val} className={`rl-chip ${chip === val ? 'active' : ''}`} style={{ borderColor: col, color: col }} onClick={() => { sfx.chip(); setChip(val); }}>
                  {val}
                </button>
              ))}
            </div>
          </div>
          <div className="kv">Total Bet <b>{fmt(total)} <Coin /></b></div>
          <button className="btn primary big" disabled={spinning || !total} onClick={spin}>
            {spinning ? 'SPINNING WHEEL...' : 'SPIN WHEEL'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ flex: 1 }} disabled={spinning} onClick={() => { sfx.click(); setBets({}); }}>Clear Table</button>
            <button className="btn" style={{ flex: 1 }} disabled={spinning} onClick={() => { sfx.chip(); setBets(b => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v * 2]))); }}>2× Bets</button>
          </div>
        </div>
      }
      stage={
        <div className="rl-arena">
          <Chips items={chips} />
          <div className="rl-wheel-box">
            <canvas ref={cv} width={280} height={280} className="rl-wheel-canvas" />
            {result !== null && !spinning && (
              <div className="rl-badge pop-in" style={{ background: pocketColor(result) }}>{result}</div>
            )}
          </div>

          <div className="rl-table">
            <div className="rl-grid">
              <button className={`rl-cell green zero ${result === 0 ? 'hit' : ''}`} onClick={() => addBet('straight:0')}>
                0 {bets['straight:0'] ? <span className="rl-stk">{bets['straight:0']}</span> : null}
              </button>
              <div className="rl-nums">
                {Array.from({ length: 36 }, (_, i) => i + 1).map(n => (
                  <button key={n} className={`rl-cell ${RED.has(n) ? 'red' : 'black'} ${result === n ? 'hit' : ''}`} onClick={() => addBet(`straight:${n}`)}>
                    {n} {bets[`straight:${n}`] ? <span className="rl-stk">{bets[`straight:${n}`]}</span> : null}
                  </button>
                ))}
              </div>
            </div>
            <div className="rl-outside">
              {[['dozen:1','1st 12'],['dozen:2','2nd 12'],['dozen:3','3rd 12']].map(([k, lbl]) => (
                <button key={k} className="rl-out-btn" onClick={() => addBet(k)}>{lbl} {bets[k] ? <span className="rl-stk">{bets[k]}</span> : null}</button>
              ))}
            </div>
            <div className="rl-outside">
              {[['low','1-18'],['even','EVEN'],['red','RED'],['black','BLACK'],['odd','ODD'],['high','19-36']].map(([k, lbl]) => (
                <button key={k} className={`rl-out-btn ${k}`} onClick={() => addBet(k)}>{lbl} {bets[k] ? <span className="rl-stk">{bets[k]}</span> : null}</button>
              ))}
            </div>
          </div>
        </div>
      }
    />
  );
}
