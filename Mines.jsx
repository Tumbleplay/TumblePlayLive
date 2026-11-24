import { useState, useEffect } from 'react';
import { GameShell, useBetCall, triggerShake, fmt, fmtX } from './shell.jsx';
import { BetInput, Coin } from '../components/common.jsx';
import { useApp } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { triggerFX } from '../components/FXLayer.jsx';
import { sfx } from '../lib/sfx.js';

const GemSvg = () => (
  <svg viewBox="0 0 64 64" className="mine-icon gem-spin" aria-hidden="true">
    <defs>
      <linearGradient id="gmG" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#a7f3d0" />
        <stop offset="45%" stopColor="#00e701" />
        <stop offset="100%" stopColor="#047857" />
      </linearGradient>
    </defs>
    <polygon points="18,8 46,8 58,24 32,58 6,24" fill="url(#gmG)" stroke="#ecfdf5" strokeWidth="2" />
    <polygon points="18,8 32,24 46,8" fill="rgba(255,255,255,0.45)" />
    <polygon points="32,24 58,24 32,58" fill="rgba(0,0,0,0.22)" />
    <polygon points="6,24 32,24 32,58" fill="rgba(255,255,255,0.14)" />
  </svg>
);

const BombSvg = () => (
  <svg viewBox="0 0 64 64" className="mine-icon bomb-blast" aria-hidden="true">
    <defs>
      <radialGradient id="bmG" cx="35%" cy="32%" r="65%">
        <stop offset="0%" stopColor="#475569" />
        <stop offset="55%" stopColor="#1e293b" />
        <stop offset="100%" stopColor="#020617" />
      </radialGradient>
    </defs>
    <path d="M40 16 C44 8, 52 8, 55 12" stroke="#f59e0b" strokeWidth="3.5" fill="none" strokeLinecap="round" />
    <circle cx="56" cy="12" r="4.5" fill="#fde047" />
    <circle cx="30" cy="36" r="20" fill="url(#bmG)" stroke="#ff2e4c" strokeWidth="2.5" />
    <circle cx="24" cy="29" r="5" fill="rgba(255,255,255,0.22)" />
  </svg>
);

export default function Mines() {
  const { user, setAuthOpen } = useApp();
  const [bet, setBet] = useState(10);
  const [mines, setMines] = useState(3);
  const [g, setG] = useState(null);
  const [busy, setBusy] = useState(false);
  const call = useBetCall();

  useEffect(() => { if (user) api('/casino/mines').then(r => r.active && setG(r)).catch(() => {}); }, [user?.id]); // eslint-disable-line

  const start = async () => {
    setBusy(true);
    sfx.click();
    const r = await call('/casino/mines/start', { amount: bet, mines });
    if (r) setG(r);
    setBusy(false);
  };

  const reveal = async tile => {
    if (!g?.active || busy || g.revealed.includes(tile)) return;
    setBusy(true);
    const r = await call('/casino/mines/reveal', { tile });
    if (r) {
      setG(r);
      const col = (tile % 5 + 0.5) / 5;
      const row = (Math.floor(tile / 5) + 0.5) / 5;
      if (r.active === false && !r.won) {
        sfx.boom();
        triggerFX('bust', { x: 0.25 + col * 0.5, y: 0.2 + row * 0.6, intensity: 1.35 });
        triggerShake('boom');
      } else {
        sfx.gem((r.revealed?.length || 1));
        triggerFX('gem', { x: 0.25 + col * 0.5, y: 0.2 + row * 0.6, intensity: 0.85 });
      }
    }
    setBusy(false);
  };

  const cashout = async () => {
    setBusy(true);
    const r = await call('/casino/mines/cashout', {});
    if (r) { setG(r); sfx.cashout(); }
    setBusy(false);
  };

  const randomTile = () => {
    if (!g?.active) return;
    const left = Array.from({ length: 25 }, (_, i) => i).filter(i => !g.revealed.includes(i));
    if (left.length) reveal(left[Math.floor(Math.random() * left.length)]);
  };

  const active = !!g?.active;
  const gemsFound = g?.revealed?.length || 0;

  return (
    <GameShell
      game="mines"
      controls={
        <>
          <BetInput value={bet} onChange={setBet} disabled={active} />
          <label className="field">
            <span>Mines<span>{mines} mines · {25 - mines} gems</span></span>
            <select className="input" value={mines} disabled={active} onChange={e => { sfx.click(); setMines(Number(e.target.value)); }}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {active && (
            <div className="mines-stats">
              <div className="kv"><span>Current</span><b className="pos">{fmtX(g.multiplier)}</b></div>
              <div className="kv"><span>Next Gem</span><b>{fmtX(g.next)}</b></div>
              <div className="kv"><span>Gems Found</span><b>{gemsFound} / {25 - g.mines}</b></div>
            </div>
          )}
          {!user ? (
            <button className="btn bet big" onClick={() => setAuthOpen('register')}>Register to play</button>
          ) : active ? (
            <>
              <button className="btn bet big pulse-live" disabled={busy || !gemsFound} onClick={cashout}>
                Cash out {fmt(g.amount * g.multiplier)} <Coin />
              </button>
              <button className="btn ghost" disabled={busy} onClick={randomTile}>Pick random tile</button>
            </>
          ) : (
            <button className="btn bet big" disabled={busy} onClick={start}>Start Game</button>
          )}
        </>
      }
      stage={
        <div className="mines-stage-wrap">
          <div className="mines">
            {Array.from({ length: 25 }, (_, i) => {
              const rev = g?.revealed?.includes(i);
              const isMine = g?.positions?.includes(i);
              const isHit = g?.hit === i;
              const isDim = g && !g.active && !rev && !isHit;
              const cls = ['mtile'];
              if (rev) cls.push('gem', 'flipped');
              if (isMine && !g?.active) cls.push('mine', 'flipped');
              if (isHit) cls.push('hit');
              if (isDim) cls.push('dim');
              return (
                <button key={i} className={cls.join(' ')} disabled={!active || rev || busy} onClick={() => reveal(i)} aria-label={`Tile ${i + 1}`}>
                  <span className="mtile-inner">
                    {rev && <GemSvg />}
                    {!rev && isMine && !g?.active && <BombSvg />}
                    {!rev && !isMine && !g?.active && g && <GemSvg />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      }
    />
  );
}
