import { useState, useCallback } from 'react';
import { GameShell, useAutobet, PlayButton, useBetCall, fmtX } from './shell.jsx';
import { BetInput, Seg } from '../components/common.jsx';
import { useApp } from '../lib/store.jsx';
import { reducedMotion } from '../lib/format.js';

export default function Keno() {
  const { config, toast } = useApp();
  const [bet, setBet] = useState(1);
  const [risk, setRisk] = useState('medium');
  const [picks, setPicks] = useState([]);
  const [drawn, setDrawn] = useState([]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  const call = useBetCall();
  const table = picks.length ? config?.keno?.[risk]?.[picks.length] || [] : [];

  const toggle = n => {
    setDrawn([]); setLast(null);
    setPicks(p => (p.includes(n) ? p.filter(x => x !== n) : p.length >= 10 ? (toast('You can pick up to 10 numbers'), p) : [...p, n]));
  };
  const autoPick = () => {
    const pool = Array.from({ length: 40 }, (_, i) => i + 1), out = [];
    const n = picks.length || 10;
    while (out.length < n) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    setDrawn([]); setLast(null); setPicks(out);
  };
  const play = useCallback(async amount => {
    if (!picks.length) { toast('Pick at least one number'); return null; }
    const r = await call('/casino/keno/bet', { amount, picks, risk }, { defer: true, stake: amount });
    if (!r) return null;
    setDrawn([]); setLast(null);
    const step = reducedMotion() ? 0 : 70;
    for (let i = 1; i <= r.drawn.length; i++) { setDrawn(r.drawn.slice(0, i)); if (step) await new Promise(ok => setTimeout(ok, step)); }
    setLast(r); r.commit();
    return { payout: r.payout };
  }, [call, picks, risk, toast]);
  const auto = useAutobet({ play, bet, setBet, delay: 450 });
  const manual = async () => { setBusy(true); await play(bet); setBusy(false); };
  const hits = picks.filter(n => drawn.includes(n)).length;

  const controls = <>
    {auto.panel}
    <BetInput value={bet} onChange={setBet} disabled={auto.running} />
    <div className="field"><span>Risk</span><Seg value={risk} onChange={setRisk} disabled={auto.running} options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} /></div>
    <div className="row2">
      <button className="btn" disabled={auto.running} onClick={autoPick}>Auto pick</button>
      <button className="btn" disabled={auto.running || !picks.length} onClick={() => { setPicks([]); setDrawn([]); setLast(null); }}>Clear</button>
    </div>
    <div className="kv">Picked <b>{picks.length} / 10</b></div>
    <PlayButton auto={auto} busy={busy} onManual={manual} label="Play" disabled={!picks.length} />
  </>;
  const stage = <>
    <div className="center" style={{ padding: '14px 0 0', flex: 'none', minHeight: 60 }}>
      {last ? <div className={`big ${last.payout > 0 ? 'win' : 'bust'}`} style={{ fontSize: 40 }}>{fmtX(last.multiplier)}<span className="muted" style={{ fontSize: 16, marginLeft: 10, letterSpacing: 0 }}>{hits} hit{hits === 1 ? '' : 's'}</span></div>
        : <div className="sub">{picks.length ? 'Ready when you are.' : 'Pick 1 to 10 numbers on the board.'}</div>}
    </div>
    <div className="kgrid">
      {Array.from({ length: 40 }, (_, i) => i + 1).map(n => {
        const p = picks.includes(n), d = drawn.includes(n);
        return <button key={n} className={`ktile${p && d ? ' hit' : p ? ' pick' : d ? ' drawn' : ''}`} disabled={auto.running || busy} aria-pressed={p} onClick={() => toggle(n)}>{n}</button>;
      })}
    </div>
    {table.length > 0 && <div className="paytable">{table.map((m, h) => <div key={h} className={drawn.length === 10 && h === hits ? 'on' : ''}><b>{m ? fmtX(m) : '0×'}</b>{h} hit{h === 1 ? '' : 's'}</div>)}</div>}
  </>;
  return <GameShell game="keno" controls={controls} stage={stage} />;
}
