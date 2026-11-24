import { useState, useEffect, useRef, useCallback } from 'react';
import { GameShell, useBetCall, triggerShake, fmt, fmtX } from './shell.jsx';
import { BetInput, UserChip, Coin } from '../components/common.jsx';
import { useApp, useSocket } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { CRASH_GROWTH } from '@shared/math.js';
import { triggerFX } from '../components/FXLayer.jsx';
import { sfx } from '../lib/sfx.js';

function multColor(x) {
  if (x >= 10) return { main: '#fbbf24', sub: '#f59e0b', glow: 'rgba(251,191,36,0.42)', badge: 'avi-gold' };
  if (x >= 2) return { main: '#c084fc', sub: '#9333ea', glow: 'rgba(168,85,247,0.42)', badge: 'avi-purple' };
  return { main: '#38bdf8', sub: '#0284c7', glow: 'rgba(56,189,248,0.42)', badge: 'avi-blue' };
}

export default function Crash() {
  const { user, setAuthOpen, toast } = useApp();
  const [bet, setBet] = useState(10);
  const [auto, setAuto] = useState('2.00');
  const [round, setRound] = useState(null);
  const [players, setPlayers] = useState([]);
  const [history, setHistory] = useState([]);
  const [mine, setMine] = useState(null);
  const [queued, setQueued] = useState(false);
  const [m, setM] = useState(1);
  const [now, setNow] = useState(Date.now());

  const offset = useRef(0);
  const cv = useRef(null);
  const roundRef = useRef(null);
  const multRef = useRef(1);
  const fxRef = useRef({
    stars: Array.from({ length: 48 }, () => ({ x: Math.random(), y: Math.random(), z: 0.4 + Math.random() * 1.6 })),
    exhaust: [],
    chutes: [],
    flyOff: 0,
    rayAngle: 0
  });

  const call = useBetCall();
  const sync = s => { if (s) offset.current = s - Date.now(); };
  const srvNow = () => Date.now() + offset.current;

  useEffect(() => { roundRef.current = round; }, [round]);

  const load = useCallback(() => api('/crash').then(s => {
    sync(s.serverNow);
    setHistory(s.history || []);
    if (s.round) {
      setRound(s.round);
      roundRef.current = s.round;
      setPlayers(s.round.bets || []);
      if (user) {
        const myB = (s.round.bets || []).find(b => b.username === user.username);
        if (myB) setMine({ roundId: s.round.id, cashedAt: myB.cashedAt, payout: myB.payout });
      }
    }
  }).catch(() => {}), [user]);

  useEffect(() => { load(); }, [load]);

  useSocket('crash:round', d => {
    sync(d.serverNow);
    const next = { id: d.id, hash: d.hash, phase: 'betting', startAt: d.startAt, point: null };
    setRound(next); roundRef.current = next;
    setPlayers([]); setMine(null); setM(1); multRef.current = 1;
    fxRef.current.exhaust = [];
    fxRef.current.chutes = [];
    fxRef.current.flyOff = 0;
  });

  useSocket('crash:start', d => {
    sync(d.serverNow);
    setRound(prev => {
      const next = { ...(prev || {}), id: d.id, phase: 'running', startAt: d.startAt };
      roundRef.current = next;
      return next;
    });
    fxRef.current.flyOff = 0;
    sfx.takeoff();
  });

  useSocket('crash:end', d => {
    setRound(prev => {
      const next = { ...(prev || {}), id: d.id, phase: 'crashed', point: d.point, seed: d.seed, hash: d.hash };
      roundRef.current = next;
      return next;
    });
    setM(d.point || 1);
    multRef.current = d.point || 1;
    fxRef.current.flyOff = 0.01;
    if (d.point) setHistory(h => [{ id: d.id, point: d.point }, ...h.filter(x => x.id !== d.id).slice(0, 19)]);
    sfx.flyaway();
    triggerFX('bust', { x: 0.65, y: 0.35, intensity: 0.85 });
    triggerShake('hit');
  });

  useSocket('crash:bet', b => setPlayers(p => [b, ...p.filter(x => x.username !== b.username)]));

  useSocket('crash:cashout', c => {
    setPlayers(p => p.map(x => x.username === c.username ? { ...x, cashedAt: c.cashedAt, payout: c.payout } : x));
    fxRef.current.chutes.push({
      label: `${c.username} ${fmtX(c.cashedAt)}`,
      x: 0.45 + Math.random() * 0.35,
      y: 0.35 + Math.random() * 0.25,
      vy: 0.35,
      life: 1
    });
    if (user && c.username === user.username) {
      setMine(prev => prev ? { ...prev, cashedAt: c.cashedAt, payout: c.payout } : prev);
      sfx.cashout();
      triggerFX('win', { intensity: 1.2 });
    }
  });

  // Unified 60fps physics + Spribe Aviator Cockpit renderer
  useEffect(() => {
    let raf;
    let lastUi = 0;

    const draw = ts => {
      const r = roundRef.current;
      const t = srvNow();
      let curM = 1;

      if (r?.phase === 'running' && r.startAt) {
        // CRASH_GROWTH is in milliseconds (0.00009) — NO / 1000!
        const elapsed = Math.max(0, t - r.startAt);
        curM = Math.max(1, Math.exp(CRASH_GROWTH * elapsed));
      } else if (r?.phase === 'crashed') {
        curM = r.point || 1;
      }
      multRef.current = curM;

      if (ts - lastUi > 32) {
        setM(curM);
        setNow(t);
        lastUi = ts;
      }

      const canvas = cv.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const W = Math.max(300, canvas.clientWidth);
        const H = Math.max(260, canvas.clientHeight);
        if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
          canvas.width = Math.round(W * dpr);
          canvas.height = Math.round(H * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        const fx = fxRef.current;
        const speed = r?.phase === 'running' ? Math.min(5, 0.8 + Math.log(curM) * 1.15) : 0.2;
        fx.rayAngle += (r?.phase === 'running' ? 0.0045 * speed : 0.0018);

        // 1. Deep Obsidian Sky Radial Backdrop
        const pal = r?.phase === 'crashed'
          ? { main: '#ff2e4c', sub: '#991b1b', glow: 'rgba(255,46,76,0.36)' }
          : multColor(curM);

        const bg = ctx.createRadialGradient(W * 0.14, H * 0.88, 20, W * 0.5, H * 0.5, Math.max(W, H) * 0.9);
        bg.addColorStop(0, r?.phase === 'running' ? pal.glow : 'rgba(20, 117, 225, 0.14)');
        bg.addColorStop(0.5, '#0b1824');
        bg.addColorStop(1, '#060d14');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // 2. Iconic Rotating Sunburst Radar Rays (Spribe Aviator signature!)
        ctx.save();
        ctx.translate(W * 0.1, H * 0.92);
        ctx.rotate(fx.rayAngle);
        const rays = 14;
        for (let i = 0; i < rays; i++) {
          ctx.rotate((Math.PI * 2) / rays);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, Math.max(W, H) * 1.4, 0, Math.PI / rays * 0.55);
          ctx.closePath();
          ctx.fillStyle = r?.phase === 'crashed' ? 'rgba(255,46,76,0.035)' : 'rgba(255,255,255,0.025)';
          ctx.fill();
        }
        ctx.restore();

        // 3. Parallax Speed-Line Starfield
        for (const s of fx.stars) {
          s.x -= 0.0012 * s.z * speed;
          if (r?.phase === 'running') s.y += 0.0005 * s.z * speed;
          if (s.x < 0) { s.x = 1; s.y = Math.random(); }
          if (s.y > 1) { s.y = 0; s.x = Math.random(); }
          const sx = s.x * W, sy = s.y * H;
          ctx.strokeStyle = `rgba(255,255,255,${0.12 + s.z * 0.18})`;
          ctx.lineWidth = s.z;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + speed * 8 * s.z, sy - speed * 2.5 * s.z);
          ctx.stroke();
        }

        // 4. Precision Altitude Grid & Scale Ticks
        const padL = 48, padB = 34, padR = 30, padT = 36;
        ctx.strokeStyle = 'rgba(148,163,184,0.08)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
          const gy = H - padB - ((H - padB - padT) * i) / 5;
          ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(W - padR, gy); ctx.stroke();
        }
        for (let i = 0; i <= 6; i++) {
          const gx = padL + ((W - padL - padR) * i) / 6;
          ctx.beginPath(); ctx.moveTo(gx, padT); ctx.lineTo(gx, H - padB); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(148,163,184,0.5)';
        ctx.font = '600 10px Inter, system-ui, sans-serif';
        const topLabel = Math.max(2, curM * 1.25);
        for (let i = 0; i <= 4; i++) {
          const val = 1 + ((topLabel - 1) * i) / 4;
          const gy = H - padB - ((H - padB - padT) * i) / 4;
          ctx.fillText(val.toFixed(1) + '×', 8, gy + 3);
        }

        // 5. Flight Curve, Area Fill, Plasma Exhaust & Detailed Red Jet
        if (r?.phase === 'running' || r?.phase === 'crashed') {
          const progress = Math.min(1, Math.log(Math.max(1, curM)) / Math.log(12));
          const bob = r.phase === 'running' ? Math.sin(ts * 0.0055) * 6 : 0;
          const baseEndX = padL + (W - padL - padR) * (0.12 + 0.78 * progress);
          const baseEndY = H - padB - (H - padB - padT) * (0.08 + 0.76 * Math.pow(progress, 0.82)) + bob;

          if (r.phase === 'crashed' && fx.flyOff > 0) fx.flyOff = Math.min(1.6, fx.flyOff + 0.055);
          const endX = baseEndX;
          const endY = baseEndY;
          const cpX = padL + (endX - padL) * 0.62;
          const cpY = H - padB;

          // Under-curve luminous gradient
          const fillG = ctx.createLinearGradient(0, endY, 0, H - padB);
          fillG.addColorStop(0, pal.glow);
          fillG.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.beginPath();
          ctx.moveTo(padL, H - padB);
          ctx.quadraticCurveTo(cpX, cpY, endX, endY);
          ctx.lineTo(endX, H - padB);
          ctx.closePath();
          ctx.fillStyle = fillG;
          ctx.fill();

          // Primary glowing flight arc
          ctx.beginPath();
          ctx.moveTo(padL, H - padB);
          ctx.quadraticCurveTo(cpX, cpY, endX, endY);
          ctx.strokeStyle = pal.main;
          ctx.lineWidth = 4;
          ctx.shadowColor = pal.main;
          ctx.shadowBlur = 18;
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Spawn exhaust sparks while flying
          if (r.phase === 'running') {
            for (let k = 0; k < 2; k++) {
              fx.exhaust.push({
                x: endX - 18,
                y: endY + (Math.random() - 0.5) * 6,
                vx: -2.2 - Math.random() * 2.5,
                vy: 0.6 + (Math.random() - 0.5) * 1.4,
                size: 2.5 + Math.random() * 3.5,
                life: 1,
                hot: Math.random() > 0.45
              });
            }
          }

          for (let i = fx.exhaust.length - 1; i >= 0; i--) {
            const p = fx.exhaust[i];
            p.x += p.vx; p.y += p.vy; p.life -= 0.045; p.size *= 0.96;
            if (p.life <= 0) { fx.exhaust.splice(i, 1); continue; }
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = p.hot ? `rgba(251,191,36,${p.life})` : `rgba(255,46,76,${p.life * 0.7})`;
            ctx.fill();
          }

          // Jet position (zooms off top-right when crashed!)
          const jetX = r.phase === 'crashed' ? endX + fx.flyOff * W * 0.45 : endX;
          const jetY = r.phase === 'crashed' ? endY - fx.flyOff * H * 0.42 : endY;
          if (jetX < W + 90 && jetY > -90) {
            ctx.save();
            ctx.translate(jetX, jetY);
            const slopeAngle = Math.atan2(endY - cpY, endX - cpX) * 0.58;
            ctx.rotate(r.phase === 'crashed' ? -0.52 : slopeAngle);

            // Outer engine plasma halo
            const halo = ctx.createRadialGradient(-24, 0, 2, -24, 0, 28);
            halo.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
            halo.addColorStop(0.4, 'rgba(255, 68, 68, 0.55)');
            halo.addColorStop(1, 'rgba(255, 68, 68, 0)');
            ctx.fillStyle = halo;
            ctx.beginPath(); ctx.arc(-24, 0, 28, 0, Math.PI * 2); ctx.fill();

            // Flickering afterburner cone
            const flame = 20 + Math.random() * 14;
            ctx.beginPath();
            ctx.moveTo(-18, -4.5);
            ctx.lineTo(-18 - flame, 0);
            ctx.lineTo(-18, 4.5);
            ctx.closePath();
            ctx.fillStyle = '#fde047';
            ctx.fill();

            // Aerodynamic Aviator Jet Silhouette
            ctx.shadowColor = '#ff1e42';
            ctx.shadowBlur = 22;
            ctx.fillStyle = '#ff1e42';
            ctx.beginPath();
            ctx.moveTo(28, 0);        // nose
            ctx.lineTo(4, -5);        // upper fuselage
            ctx.lineTo(-10, -19);     // top swept wing
            ctx.lineTo(-16, -19);
            ctx.lineTo(-8, -5);
            ctx.lineTo(-20, -4);      // tail fin
            ctx.lineTo(-25, -11);
            ctx.lineTo(-27, -11);
            ctx.lineTo(-22, 0);
            ctx.lineTo(-27, 11);
            ctx.lineTo(-25, 11);
            ctx.lineTo(-20, 4);
            ctx.lineTo(-8, 5);
            ctx.lineTo(-16, 19);      // bottom swept wing
            ctx.lineTo(-10, 19);
            ctx.lineTo(4, 5);
            ctx.closePath();
            ctx.fill();

            // Specular cockpit canopy
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#e0f2fe';
            ctx.beginPath();
            ctx.ellipse(10, 0, 6.5, 2.3, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        // 6. Floating Cashout Parachute Badges
        for (let i = fx.chutes.length - 1; i >= 0; i--) {
          const ch = fx.chutes[i];
          ch.y += 0.0025;
          ch.life -= 0.011;
          if (ch.life <= 0) { fx.chutes.splice(i, 1); continue; }
          ctx.save();
          ctx.globalAlpha = Math.min(1, ch.life * 1.4);
          ctx.font = '700 11px Inter, system-ui, sans-serif';
          const tw = ctx.measureText(ch.label).width + 16;
          const cx = ch.x * W - tw / 2, cy = ch.y * H;
          ctx.fillStyle = 'rgba(0, 231, 1, 0.18)';
          ctx.strokeStyle = 'rgba(0, 231, 1, 0.7)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(cx, cy, tw, 22, 11);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#7cff8a';
          ctx.fillText(ch.label, cx + 8, cy + 14.5);
          ctx.restore();
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const placeBet = useCallback(async () => {
    if (!user) return setAuthOpen('login');
    sfx.chip();
    const r = await call('/crash/bet', { amount: bet, autoCashout: Number(auto) >= 1.01 ? Number(auto) : undefined });
    if (r) { setMine({ roundId: r.roundId, cashedAt: null, payout: 0 }); setQueued(false); toast('Aviator bet locked in!', 'win'); }
  }, [user, bet, auto, call, setAuthOpen, toast]);

  const cashOut = async () => {
    const r = await call('/crash/cashout', {});
    if (r) {
      setMine(prev => prev ? { ...prev, cashedAt: r.cashedAt, payout: r.payout } : prev);
      sfx.cashout();
      triggerFX(r.cashedAt >= 5 ? 'jackpot' : 'win', { intensity: 1.3 });
      toast(`Cashed out at ${fmtX(r.cashedAt)} (+${fmt(r.payout)} coins)`, 'win');
    }
  };

  useEffect(() => {
    if (queued && round?.phase === 'betting' && !mine) placeBet();
  }, [queued, round?.phase, mine, placeBet]);

  const pal = round?.phase === 'crashed' ? { main: '#ff2e4c', badge: 'avi-red' } : multColor(m);
  const canBet = round?.phase === 'betting' && !mine;
  const canCash = round?.phase === 'running' && mine && !mine.cashedAt;
  const countdown = round?.phase === 'betting' ? Math.max(0, (round.startAt - now) / 1000) : 0;

  return (
    <GameShell
      game="crash"
      controls={
        <div className="avi-controls">
          <BetInput value={bet} onChange={setBet} disabled={!!mine && round?.phase === 'running'} />
          <label className="field">
            <span>Auto Cashout (×)</span>
            <input className="input" type="number" step="0.1" min="1.01" value={auto} onChange={e => setAuto(e.target.value)} placeholder="e.g. 2.00" />
          </label>
          {canCash ? (
            <button className="btn avi-cash-btn pulse-live" onClick={cashOut}>
              CASH OUT {fmt(bet * m)} <Coin /> ({fmtX(m)})
            </button>
          ) : canBet ? (
            <button className="btn primary big" onClick={placeBet}>
              BET {fmt(bet)} COINS
            </button>
          ) : (
            <button className={`btn big${queued ? ' queued-btn' : ''}`} onClick={() => { sfx.click(); setQueued(q => !q); }}>
              {queued ? 'Queued for Next Flight (Cancel)' : 'Queue Bet for Next Flight'}
            </button>
          )}
          <div className="avi-players">
            <div className="avi-players-hd">Live Pilots ({players.length})</div>
            {players.slice(0, 12).map((p, i) => (
              <div key={i} className={`avi-prow ${p.cashedAt ? 'won' : ''}`}>
                <UserChip name={p.username} hue={p.hue} />
                <span>{fmt(p.amount)}</span>
                <span>{p.cashedAt ? <b style={{ color: '#00e701' }}>{fmtX(p.cashedAt)}</b> : <span className="flying-tag">Flying</span>}</span>
              </div>
            ))}
          </div>
        </div>
      }
      stage={
        <div className="avi-stage">
          <div className="avi-hist">
            {history.map((h, i) => {
              const c = multColor(h.point);
              return <span key={h.id || i} className={`avi-pill ${c.badge}`}>{fmtX(h.point)}</span>;
            })}
          </div>
          <div className="avi-canvas-wrap">
            <canvas ref={cv} className="avi-canvas" />
            <div className="avi-overlay">
              {round?.phase === 'betting' ? (
                <div className="avi-prep">
                  <div className="avi-status">NEXT FLIGHT TAKING OFF</div>
                  <div className="avi-mult" style={{ color: '#00e701', textShadow: '0 0 28px rgba(0,231,1,0.55)' }}>
                    {countdown.toFixed(1)}s
                  </div>
                  <div className="avi-bar"><i style={{ width: `${Math.min(100, (countdown / 7) * 100)}%` }} /></div>
                </div>
              ) : (
                <>
                  {round?.phase === 'crashed' && <div className="avi-flew">FLEW AWAY!</div>}
                  <div className={`avi-mult${round?.phase === 'running' ? ' avi-pulse' : ''}`} style={{ color: pal.main, textShadow: `0 0 36px ${pal.main}` }}>
                    {fmtX(m)}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      }
    />
  );
}
