import { useState, useEffect, useRef, useCallback } from 'react';
import { GameShell, useBetCall, fmt, fmtX } from './shell.jsx';
import { BetInput, UserChip, Coin } from '../components/common.jsx';
import { useApp, useSocket } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { CRASH_GROWTH } from '@shared/math.js';

function multColor(x) {
  if (x >= 10) return { main: '#f59e0b', glow: 'rgba(245, 158, 11, 0.45)', badge: 'avi-gold' };
  if (x >= 2) return { main: '#a855f7', glow: 'rgba(168, 85, 247, 0.45)', badge: 'avi-purple' };
  return { main: '#38bdf8', glow: 'rgba(56, 189, 248, 0.45)', badge: 'avi-blue' };
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
  const call = useBetCall();
  const sync = s => { if (s) offset.current = s - Date.now(); };
  const srvNow = () => Date.now() + offset.current;

  const load = useCallback(() => api('/crash').then(s => {
    sync(s.serverNow);
    setHistory(s.history || []);
    if (s.round) {
      setRound(s.round);
      setPlayers(s.round.bets || []);
      if (user) {
        const myB = (s.round.bets || []).find(b => b.username === user.username);
        if (myB) setMine({ roundId: s.round.id, cashedAt: myB.cashedAt, payout: myB.payout });
      }
    }
  }).catch(() => {}), [user]);

  useEffect(() => { load(); }, [load]);

  // Listen to all 5 backend crash socket events
  useSocket('crash:round', d => {
    sync(d.serverNow);
    setRound({ id: d.id, hash: d.hash, phase: 'betting', startAt: d.startAt, point: null });
    setPlayers([]);
    setMine(null);
    setM(1);
  });

  useSocket('crash:start', d => {
    sync(d.serverNow);
    setRound(prev => ({ ...(prev || {}), id: d.id, phase: 'running', startAt: d.startAt }));
  });

  useSocket('crash:end', d => {
    setRound(prev => ({ ...(prev || {}), id: d.id, phase: 'crashed', point: d.point, seed: d.seed, hash: d.hash }));
    setM(d.point || 1);
    if (d.point) setHistory(h => [{ id: d.id, point: d.point }, ...h.filter(x => x.id !== d.id).slice(0, 19)]);
  });

  useSocket('crash:bet', b => setPlayers(p => [b, ...p.filter(x => x.username !== b.username)]));

  useSocket('crash:cashout', c => {
    setPlayers(p => p.map(x => x.username === c.username ? { ...x, cashedAt: c.cashedAt, payout: c.payout } : x));
    if (user && c.username === user.username) {
      setMine(prev => prev ? { ...prev, cashedAt: c.cashedAt, payout: c.payout } : prev);
    }
  });

  useEffect(() => {
    if (!round) return;
    let raf;
    const tick = () => {
      const t = srvNow();
      setNow(t);
      if (round.phase === 'running' && round.startAt) {
        const elapsed = Math.max(0, (t - round.startAt) / 1000);
        setM(Math.max(1, Math.exp(CRASH_GROWTH * elapsed)));
      } else if (round.phase === 'crashed') {
        setM(round.point || 1);
      } else {
        setM(1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [round]);

  // Draw Pro Aviator Cockpit Canvas
  useEffect(() => {
    const canvas = cv.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = Math.max(300, canvas.clientWidth) * 2;
    const H = canvas.height = Math.max(260, canvas.clientHeight) * 2;
    ctx.clearRect(0, 0, W, H);

    const bg = ctx.createRadialGradient(W * 0.5, H * 0.55, 40, W * 0.5, H * 0.5, W * 0.7);
    bg.addColorStop(0, '#162838');
    bg.addColorStop(1, '#09131c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 90) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 70) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    if (round?.phase === 'running' || round?.phase === 'crashed') {
      const progress = Math.min(1, Math.log(Math.max(1, m)) / Math.log(15));
      const padX = 70, padY = 60;
      const endX = padX + (W - padX * 2) * (0.12 + 0.82 * progress);
      const endY = H - padY - (H - padY * 2) * (0.1 + 0.78 * Math.pow(progress, 0.85));
      const cpX = padX + (endX - padX) * 0.65;
      const cpY = H - padY;

      const palette = round.phase === 'crashed' ? { main: '#ff2e4c', glow: 'rgba(255,46,76,0.4)' } : multColor(m);

      const grad = ctx.createLinearGradient(0, endY, 0, H - padY);
      grad.addColorStop(0, palette.glow);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.moveTo(padX, H - padY);
      ctx.quadraticCurveTo(cpX, cpY, endX, endY);
      ctx.lineTo(endX, H - padY);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(padX, H - padY);
      ctx.quadraticCurveTo(cpX, cpY, endX, endY);
      ctx.strokeStyle = palette.main;
      ctx.lineWidth = 6;
      ctx.shadowColor = palette.main;
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (round.phase === 'running') {
        ctx.save();
        ctx.translate(endX, endY);
        const angle = Math.atan2(endY - cpY, endX - cpX) * 0.55;
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-26, 0);
        ctx.lineTo(-48 - Math.random() * 14, -7);
        ctx.lineTo(-48 - Math.random() * 14, 7);
        ctx.closePath();
        ctx.fillStyle = '#fbbf24';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(28, 0);
        ctx.lineTo(-22, -16);
        ctx.lineTo(-14, 0);
        ctx.lineTo(-22, 16);
        ctx.closePath();
        ctx.fillStyle = '#ff1e42';
        ctx.shadowColor = '#ff1e42';
        ctx.shadowBlur = 20;
        ctx.fill();
        ctx.restore();
      }
    }
  }, [m, round]);

  const placeBet = useCallback(async () => {
    if (!user) return setAuthOpen('login');
    const r = await call('/crash/bet', { amount: bet, autoCashout: Number(auto) >= 1.01 ? Number(auto) : undefined });
    if (r) { setMine({ roundId: r.roundId, cashedAt: null, payout: 0 }); setQueued(false); toast('Aviator bet placed!', 'win'); }
  }, [user, bet, auto, call, setAuthOpen, toast]);

  const cashOut = async () => {
    const r = await call('/crash/cashout', {});
    if (r) {
      setMine(prev => prev ? { ...prev, cashedAt: r.cashedAt, payout: r.payout } : prev);
      toast(`Cashed out at ${fmtX(r.cashedAt)} (+${fmt(r.payout)} coins)`, 'win');
    }
  };

  useEffect(() => {
    if (queued && round?.phase === 'betting' && !mine) placeBet();
  }, [queued, round?.phase, mine, placeBet]);

  const pal = round?.phase === 'crashed' ? { main: '#ff2e4c', badge: 'avi-red' } : multColor(m);
  const canBet = round?.phase === 'betting' && !mine;
  const canCash = round?.phase === 'running' && mine && !mine.cashedAt;

  return (
    <GameShell
      game="crash"
      controls={
        <div className="avi-controls">
          <BetInput value={bet} onChange={setBet} disabled={!!mine && round?.phase === 'running'} />
          <label className="field">
            <span>Auto Cashout (x)</span>
            <input className="input" type="number" step="0.1" min="1.01" value={auto} onChange={e => setAuto(e.target.value)} placeholder="e.g. 2.00" />
          </label>
          {canCash ? (
            <button className="btn avi-cash-btn" onClick={cashOut}>
              CASH OUT {fmt(bet * m)} <Coin /> ({fmtX(m)})
            </button>
          ) : canBet ? (
            <button className="btn primary big" onClick={placeBet}>
              BET {fmt(bet)} COINS
            </button>
          ) : (
            <button className="btn big" onClick={() => setQueued(q => !q)}>
              {queued ? 'Queued for Next Flight (Cancel)' : 'Queue Bet for Next Flight'}
            </button>
          )}
          <div className="avi-players">
            <div className="avi-players-hd">Live Pilots ({players.length})</div>
            {players.slice(0, 12).map((p, i) => (
              <div key={i} className={`avi-prow ${p.cashedAt ? 'won' : ''}`}>
                <UserChip name={p.username} hue={p.hue} />
                <span>{fmt(p.amount)}</span>
                <span>{p.cashedAt ? <b style={{ color: '#00e701' }}>{fmtX(p.cashedAt)}</b> : 'Flying...'}</span>
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
              return <span key={i} className={`avi-pill ${c.badge}`}>{fmtX(h.point)}</span>;
            })}
          </div>
          <div className="avi-canvas-wrap">
            <canvas ref={cv} className="avi-canvas" />
            <div className="avi-overlay">
              {round?.phase === 'betting' ? (
                <>
                  <div className="avi-status">PREPARING TAKEOFF...</div>
                  <div className="avi-mult" style={{ color: '#00e701' }}>
                    {Math.max(0, ((round.startAt - now) / 1000)).toFixed(1)}s
                  </div>
                </>
              ) : (
                <>
                  {round?.phase === 'crashed' && <div className="avi-flew">FLEW AWAY!</div>}
                  <div className="avi-mult" style={{ color: pal.main, textShadow: `0 0 32px ${pal.main}` }}>
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
