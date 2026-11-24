import { useState, useEffect } from 'react';
import { GameShell, useBetCall, fmt, fmtX } from './shell.jsx';
import { BetInput } from '../components/common.jsx';
import { useApp } from '../lib/store.jsx';
import { api } from '../lib/api.js';

const GEM = <svg viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 12L2 9z" fill="#00E701" /><path d="M6 3h12l4 6H2z" fill="#7CFF8A" /><path d="M2 9h20M8 3l4 18 4-18M6 3l2 6M18 3l-2 6" stroke="#00820A" strokeWidth="1.2" fill="none" strokeLinejoin="round" /></svg>;
const MINE = <svg viewBox="0 0 24 24"><circle cx="12" cy="13.5" r="7.5" fill="#ED4163" /><path d="M12 6V3M17.5 8l2-2" stroke="#3B0A14" strokeWidth="2.2" strokeLinecap="round" /><circle cx="20" cy="5.5" r="1.6" fill="#FFC000" /><circle cx="9.5" cy="11" r="2.2" fill="#fff" opacity=".7" /></svg>;
const mult = (k, g) => { if (!g) return 1; let m = 0.99; for (let i = 0; i < g; i++) m *= (25 - i) / (25 - k - i); return Math.floor(m * 100) / 100; };

export default function Mines() {
  const { user, setAuthOpen, toast } = useApp();
  const [bet, setBet] = useState(1);
  const [mines, setMines] = useState(3);
  const [g, setG] = useState(null);       // active game from server
  const [end, setEnd] = useState(null);   // finished game reveal
  const [busy, setBusy] = useState(false);
  const call = useBetCall();
  useEffect(() => { if (user) api('/casino/mines').then(r => { if (r.active) { setG(r); setMines(r.mines); setBet(r.amount); } }); }, [user?.id]); // eslint-disable-line

  const start = async () => { setBusy(true); setEnd(null); const r = await call('/casino/mines/start', { amount: bet, mines }); if (r) setG(r); setBusy(false); };
  const reveal = async tile => {
    if (!g || busy || g.revealed.includes(tile)) return;
    setBusy(true);
    const r = await call('/casino/mines/reveal', { tile });
    if (r) { if (r.active) setG(r); else { setG(null); setEnd(r); if (!r.won) toast('You hit a mine');  } }
    setBusy(false);
  };
  const cashout = async () => { setBusy(true); const r = await call('/casino/mines/cashout', {}); if (r) { setG(null); setEnd(r);  } setBusy(false); };
  const random = () => { const free = [...Array(25).keys()].filter(i => !g.revealed.includes(i)); reveal(free[Math.floor(Math.random() * free.length)]); };

  const k = g ? g.mines : mines, n = g ? g.revealed.length : 0;
  const controls = <>
    <BetInput value={bet} onChange={setBet} disabled={!!g} />
    <label className="field"><span>Mines</span><select className="input" value={mines} disabled={!!g} onChange={e => setMines(+e.target.value)}>{Array.from({ length: 24 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></label>
    <div className="kv">Gems found <b>{n} / {25 - k}</b></div>
    <div className="kv">Next tile pays <b>{fmtX(mult(k, n + 1))}</b></div>
    <div className="kv">Cash out value <b>{fmt(g && n ? g.amount * mult(k, n) : 0)}</b></div>
    {!user ? <button className="btn bet big" onClick={() => setAuthOpen('register')}>Register to play</button>
      : g ? <>
        <button className="btn green big" disabled={busy || !n} onClick={cashout}>{n ? `Cash out ${fmt(g.amount * mult(k, n))}` : 'Pick a tile'}</button>
        <button className="btn" disabled={busy} onClick={random}>Pick a random tile</button>
      </> : <button className="btn bet big" disabled={busy} onClick={start}>Start game</button>}
  </>;
  const tileState = i => {
    if (g) return g.revealed.includes(i) ? 'gem' : '';
    if (end) { const isMine = end.positions.includes(i); return (isMine ? 'mine' : 'gem') + (end.revealed.includes(i) || end.hit === i ? '' : ' dim'); }
    return '';
  };
  const stage = <div className="mgrid">{Array.from({ length: 25 }, (_, i) => {
    const s = tileState(i);
    return <button key={i} className={`mtile ${s}`} disabled={!g || busy || g.revealed.includes(i)} aria-label={`Tile ${i + 1}`} onClick={() => reveal(i)}>{s.startsWith('gem') ? GEM : s.startsWith('mine') ? MINE : null}</button>;
  })}</div>;
  return <GameShell game="mines" controls={controls} stage={stage} />;
}
