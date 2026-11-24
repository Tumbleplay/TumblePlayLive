import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp, Link, useSocket } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { fmt, fmtX, GAME_NAMES } from '../lib/format.js';
import { Seg, BetsTable, Coin, RollingNumber } from '../components/common.jsx';
import { I, Logo, GLYPHS, TILE_BG } from '../components/icons.jsx';
import FXLayer, { triggerFX } from '../components/FXLayer.jsx';
import { sfx, useSfx } from '../lib/sfx.js';

export const ABOUT = {
  crash: 'Watch the red jet climb with live radar telemetry and color-coded multipliers. Cash out before it flies away!',
  dice: 'Pick a target and slide into the neon green zone to roll over or under.',
  limbo: 'Set a target multiplier and engage hyper-warp. Win if the flight reaches your target.',
  mines: 'Flip tiles to uncover glowing emeralds, avoid mines, and cash out anytime.',
  plinko: 'Drop luminous balls through reactive pegs into high-multiplier buckets.',
  keno: 'Pick up to 10 numbers. Ten are drawn with escalating hit multipliers.',
  wheel: 'Spin the mechanical wheel for big multiplier slices.',
  roulette: 'Animated single-zero European wheel with physics ball drop and felt table.',
  hilo: 'Predict if the next 3D card is higher or lower to stack your streak.',
  blackjack: 'Beat the dealer to 21. Natural Blackjack pays 3 to 2.'
};
const EDGE = { roulette: '2.70% house edge' };

export const announceWin = (multiplier, payout) => {
  dispatchEvent(new CustomEvent('tumble:win', { detail: { multiplier, payout } }));
  triggerFX(multiplier >= 5 ? 'jackpot' : 'win', { intensity: multiplier >= 5 ? 1.4 : 1.0 });
  sfx.win(multiplier);
};

export const triggerShake = (kind = 'hit') => {
  dispatchEvent(new CustomEvent('tumble:shake', { detail: { kind } }));
};

function WinPop() {
  const [w, setW] = useState(null);
  useEffect(() => {
    let t;
    const on = e => {
      clearTimeout(t);
      setW({ ...e.detail, k: Math.random() });
      t = setTimeout(() => setW(null), 2000);
    };
    addEventListener('tumble:win', on);
    return () => { removeEventListener('tumble:win', on); clearTimeout(t); };
  }, []);
  if (!w) return null;
  const big = w.multiplier >= 5;
  return (
    <div className={`winpop${big ? ' mega' : ''}`} key={w.k} role="status">
      <div className="winpop-tag">{big ? 'MEGA WIN' : 'YOU WON'}</div>
      <b>{fmtX(w.multiplier)}</b>
      <hr />
      <span><RollingNumber value={w.payout} duration={460} /> <Coin /></span>
    </div>
  );
}

export function GameShell({ game, controls, stage, extra }) {
  const stageRef = useRef(null);
  const { muted, toggle } = useSfx();
  const [shake, setShake] = useState('');

  useEffect(() => {
    let t;
    const on = e => {
      clearTimeout(t);
      setShake(e.detail?.kind === 'boom' ? 'shake-boom' : 'shake-hit');
      t = setTimeout(() => setShake(''), 440);
    };
    addEventListener('tumble:shake', on);
    return () => { removeEventListener('tumble:shake', on); clearTimeout(t); };
  }, []);

  const full = () => {
    const el = stageRef.current?.closest('.gframe');
    if (!document.fullscreenElement) el?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  return (
    <div>
      <div className={`gframe ${shake}`}>
        <div className="table-wrap">
          <section className="controls" aria-label="Bet controls">{controls}</section>
          <section className={`stage stage-${game}`} aria-live="polite" ref={stageRef}>
            <div className="stage-ambient" aria-hidden="true" />
            {stage}
            <FXLayer />
            <WinPop />
          </section>
        </div>
        <div className="gbar">
          <button className="icon-btn" aria-label="Full screen" title="Full screen" onClick={full}><I.expand /></button>
          <button className={`icon-btn${muted ? ' muted-btn' : ' sfx-on'}`} aria-label={muted ? 'Unmute sound' : 'Mute sound'} title={muted ? 'Unmute SFX' : 'Mute SFX'} onClick={toggle}>
            <I.volume />
            {muted && <span className="mute-slash" />}
          </button>
          <Link to="/account" className="icon-btn" aria-label="My bet history" title="My bet history"><I.stats /></Link>
          <span className="brand"><Logo />TumblePlay</span>
          <Link to="/fairness" className="lnk"><I.shield />Fairness</Link>
        </div>
      </div>
      {extra}
      <details className="gabout">
        <summary><span>{GAME_NAMES[game]}</span><span className="tagline hide-sm">TumblePlay Originals</span><I.chev className="chev" /></summary>
        <div className="body">
          <span className="tile" style={{ background: TILE_BG[game], aspectRatio: '150/200' }}><span className="glow" /><span className="art">{GLYPHS[game]}</span><span className="name" style={{ fontSize: 16 }}>{GAME_NAMES[game]}</span></span>
          <div><p style={{ margin: 0, color: 'var(--text)' }}>{ABOUT[game]}</p>
            <div className="edge"><span className="pill">{EDGE[game] || '1% house edge'}</span><span className="pill">Provably fair</span><span className="pill">60fps Motion</span></div></div>
        </div>
      </details>
      <GameBets game={game} />
    </div>
  );
}

function GameBets({ game }) {
  const { user } = useApp();
  const [tab, setTab] = useState('all');
  const [all, setAll] = useState([]);
  const [mine, setMine] = useState([]);
  useEffect(() => { api('/bets/recent').then(r => setAll(r.filter(b => b.game === game).slice(0, 10))); }, [game]);
  useEffect(() => { if (user && tab === 'mine') api(`/me/bets?game=${game}`).then(r => setMine(r.slice(0, 10).map(b => ({ ...b, id: `${game}-${b.id}`, username: user.username, hue: user.hue })))); }, [tab, game, user?.balance]); // eslint-disable-line
  useSocket('bet', b => { if (b.game === game) setAll(a => [b, ...a].slice(0, 10)); });
  return <>
    <div className="feed-head"><div className="cats" role="group" aria-label="Bets"><button aria-pressed={tab === 'mine'} onClick={() => setTab('mine')}>My Bets</button><button aria-pressed={tab === 'all'} onClick={() => setTab('all')}>All Bets</button></div></div>
    <div className="feed"><BetsTable rows={tab === 'all' ? all : mine} showUser={tab === 'all'} empty={tab === 'mine' && !user ? 'Sign in to see your bets' : 'No bets on this game yet'} /></div>
  </>;
}

export function Chips({ items }) {
  return <div className="chips">{items.map((c, i) => <span key={c.id || i} className={`pill ${c.win ? 'w' : 'l'}`}>{c.label}</span>)}</div>;
}
export function useChips() {
  const [items, set] = useState([]);
  return [items, (label, win) => set(x => [{ id: Math.random(), label, win }, ...x].slice(0, 9))];
}

export function useAutobet({ play, bet, setBet, delay = 250 }) {
  const { toast, refresh } = useApp();
  const [mode, setMode] = useState('manual');
  const [running, setRunning] = useState(false);
  const [cfg, setCfg] = useState({ count: 0, onWin: 0, onLoss: 0, stopProfit: 0, stopLoss: 0 });
  const stop = useRef(false);
  const base = useRef(bet);
  const start = useCallback(async () => {
    stop.current = false; setRunning(true); base.current = bet;
    let amount = bet, profit = 0, n = 0;
    try {
      while (!stop.current) {
        const r = await play(amount);
        if (!r) break;
        n++; profit += r.payout - amount;
        const won = r.payout > amount;
        const pct = won ? cfg.onWin : cfg.onLoss;
        amount = pct ? Math.max(0.01, Math.round(amount * (1 + pct / 100) * 100) / 100) : base.current;
        setBet(amount);
        if (cfg.count && n >= cfg.count) break;
        if (cfg.stopProfit && profit >= cfg.stopProfit) { toast(`Autobet stopped: profit reached ${fmt(profit)}`); break; }
        if (cfg.stopLoss && -profit >= cfg.stopLoss) { toast(`Autobet stopped: loss reached ${fmt(-profit)}`); break; }
        await new Promise(r => setTimeout(r, delay));
      }
    } catch (e) { toast(e.message, 'error'); refresh(); }
    setRunning(false);
  }, [bet, cfg, play, delay, setBet, toast, refresh]);
  const panel = (
    <>
      <Seg value={mode} onChange={setMode} disabled={running} options={[['manual', 'Manual'], ['auto', 'Auto']]} />
      {mode === 'auto' && <div className="autobox">
        <label className="field"><span>Number of bets <span>0 = keep going</span></span><input className="input" type="number" min="0" value={cfg.count} disabled={running} onChange={e => setCfg(c => ({ ...c, count: Math.max(0, parseInt(e.target.value) || 0) }))} /></label>
        <div className="row2">
          <label className="field"><span>On win, raise %</span><input className="input" type="number" min="0" value={cfg.onWin} disabled={running} onChange={e => setCfg(c => ({ ...c, onWin: Math.max(0, Number(e.target.value) || 0) }))} /></label>
          <label className="field"><span>On loss, raise %</span><input className="input" type="number" min="0" value={cfg.onLoss} disabled={running} onChange={e => setCfg(c => ({ ...c, onLoss: Math.max(0, Number(e.target.value) || 0) }))} /></label>
        </div>
        <div className="row2">
          <label className="field"><span>Stop at profit</span><input className="input" type="number" min="0" value={cfg.stopProfit} disabled={running} onChange={e => setCfg(c => ({ ...c, stopProfit: Math.max(0, Number(e.target.value) || 0) }))} /></label>
          <label className="field"><span>Stop at loss</span><input className="input" type="number" min="0" value={cfg.stopLoss} disabled={running} onChange={e => setCfg(c => ({ ...c, stopLoss: Math.max(0, Number(e.target.value) || 0) }))} /></label>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>A 0 in any box means no limit. After a win or loss with 0%, the bet goes back to where you started.</p>
      </div>}
    </>
  );
  return { mode, running, start, stopAuto: () => { stop.current = true; }, panel };
}

export function PlayButton({ auto, onManual, busy, label, disabled }) {
  const { user, setAuthOpen } = useApp();
  if (!user) return <button className="btn bet big" onClick={() => setAuthOpen('register')}>Register to play</button>;
  if (auto.mode === 'auto') return auto.running
    ? <button className="btn big" style={{ background: 'var(--bust)', color: '#fff' }} onClick={auto.stopAuto}>Stop autobet</button>
    : <button className="btn bet big" disabled={disabled} onClick={auto.start}>Start autobet</button>;
  return <button className="btn bet big" disabled={busy || disabled} onClick={onManual}>{label}</button>;
}

export function useBetCall() {
  const { setBalance, setUser, toast, requireUser } = useApp();
  return useCallback(async (path, body, { defer, stake, quiet } = {}) => {
    if (!requireUser()) return null;
    try {
      const r = await api(path, body);
      if (typeof r.balance === 'number') {
        if (defer) {
          setUser(u => (u ? { ...u, balance: Math.round((u.balance - (stake || 0)) * 100) / 100 } : u));
          r.commit = () => {
            setBalance(r.balance);
            if (!quiet && r.multiplier > 1 && r.payout > 0) announceWin(r.multiplier, r.payout);
          };
        } else setBalance(r.balance);
      }
      if (!defer && r.active !== true && r.multiplier > 1 && r.payout > 0) announceWin(r.multiplier, r.payout);
      return r;
    } catch (e) { toast(e.message, 'error'); return null; }
  }, [setBalance, setUser, toast, requireUser]);
}

export { fmt, fmtX };
