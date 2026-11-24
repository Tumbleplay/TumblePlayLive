import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp, Link, useSocket } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { fmt, fmtX, GAME_NAMES } from '../lib/format.js';
import { Seg, BetsTable, Coin } from '../components/common.jsx';
import { I, Logo, GLYPHS, TILE_BG } from '../components/icons.jsx';

export const ABOUT = {
  crash: 'Watch the red jet climb with color-coded multipliers. Cash out before it flies away!',
  dice: 'Pick a target and roll over or under it.',
  limbo: 'Set a target multiplier. Win if the result reaches it.',
  mines: 'Find gems, avoid mines, cash out whenever you like.',
  plinko: 'Drop a ball through the pegs into a multiplier.',
  keno: 'Pick up to 10 numbers. Ten are drawn.',
  wheel: 'Spin for a multiplier. More risk, bigger slices.',
  roulette: 'Single-zero table. Place chips, then spin.',
  hilo: 'Guess if the next card is higher or lower.',
  blackjack: 'Beat the dealer to 21. Blackjack pays 3 to 2.'
};
const EDGE = { roulette: '2.70% house edge' };

// Any game can announce a win; the frame shows the green multiplier card over the stage
export const announceWin = (multiplier, payout) => dispatchEvent(new CustomEvent('tumble:win', { detail: { multiplier, payout } }));
function WinPop() {
  const [w, setW] = useState(null);
  useEffect(() => {
    let t;
    const on = e => { clearTimeout(t); setW({ ...e.detail, k: Math.random() }); t = setTimeout(() => setW(null), 1800); };
    addEventListener('tumble:win', on); return () => { removeEventListener('tumble:win', on); clearTimeout(t); };
  }, []);
  if (!w) return null;
  return <div className="winpop" key={w.k} role="status"><b>{fmtX(w.multiplier)}</b><hr /><span>{fmt(w.payout)} <Coin /></span></div>;
}

export function GameShell({ game, controls, stage, extra }) {
  const stageRef = useRef(null);
  const full = () => { const el = stageRef.current?.closest('.gframe'); if (!document.fullscreenElement) el?.requestFullscreen?.(); else document.exitFullscreen?.(); };
  return (
    <div>
      <div className="gframe">
        <div className="table-wrap">
          <section className="controls" aria-label="Bet controls">{controls}</section>
          <section className="stage" aria-live="polite" ref={stageRef}>{stage}<WinPop /></section>
        </div>
        <div className="gbar">
          <button className="icon-btn" aria-label="Full screen" title="Full screen" onClick={full}><I.expand /></button>
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
            <div className="edge"><span className="pill">{EDGE[game] || '1% house edge'}</span><span className="pill">Provably fair</span><span className="pill">Free coins only</span></div></div>
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
  return <div className="chips">{items.map((c, i) => <span key={i} className={`pill ${c.win ? 'w' : 'l'}`}>{c.label}</span>)}</div>;
}
export function useChips() {
  const [items, set] = useState([]);
  return [items, (label, win) => set(x => [{ label, win }, ...x].slice(0, 8))];
}

/* ---------- autobet: manual / auto tabs for instant games ---------- */
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

// Standard play button that switches between manual bet and autobet start/stop
export function PlayButton({ auto, onManual, busy, label, disabled }) {
  const { user, setAuthOpen } = useApp();
  if (!user) return <button className="btn bet big" onClick={() => setAuthOpen('register')}>Register to play</button>;
  if (auto.mode === 'auto') return auto.running
    ? <button className="btn big" style={{ background: 'var(--bust)', color: '#fff' }} onClick={auto.stopAuto}>Stop autobet</button>
    : <button className="btn bet big" disabled={disabled} onClick={auto.start}>Start autobet</button>;
  return <button className="btn bet big" disabled={busy || disabled} onClick={onManual}>{label}</button>;
}

// Wraps a bet call: updates balance, surfaces errors; returns the response or null
export function useBetCall() {
  const { setBalance, setUser, toast, requireUser } = useApp();
  // defer: show the stake leaving the wallet now, and let the game reveal the result before crediting (r.commit())
  return useCallback(async (path, body, { defer, stake, quiet } = {}) => {
    if (!requireUser()) return null;
    try {
      const r = await api(path, body);
      if (typeof r.balance === 'number') {
        if (defer) { setUser(u => (u ? { ...u, balance: Math.round((u.balance - (stake || 0)) * 100) / 100 } : u)); r.commit = () => { setBalance(r.balance); if (!quiet && r.multiplier > 1 && r.payout > 0) announceWin(r.multiplier, r.payout); }; }
        else setBalance(r.balance);
      }
      // Settled wins above 1x get the green multiplier card (deferred games reveal their own result)
      if (!defer && r.active !== true && r.multiplier > 1 && r.payout > 0) announceWin(r.multiplier, r.payout);
      return r;
    } catch (e) { toast(e.message, 'error'); return null; }
  }, [setBalance, setUser, toast, requireUser]);
}
export { fmt, fmtX };
