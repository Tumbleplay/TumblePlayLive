import { useState, useRef } from 'react';
import { GameShell, useBetCall, Chips, useChips, fmt } from './shell.jsx';
import { useApp } from '../lib/store.jsx';
import { Coin } from '../components/common.jsx';

const WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const pocketColor = n => (n === 0 ? '#00b84c' : RED.has(n) ? '#dc2626' : '#111827');
const CHIPS = [[1, '#3b82f6'], [5, '#ef4444'], [10, '#00e701'], [25, '#f59e0b'], [100, '#a855f7'], [500, '#e2e8f0']];

export default function Roulette() {
  const { user, setAuthOpen, toast } = useApp();
  const [chip, setChip] = useState(5);
  const [bets, setBets] = useState({});
  const [spinning, setSpinning] = useState(false);
  const [wheelDeg, setWheelDeg] = useState(0);
  const [ballDeg, setBallDeg] = useState(0);
  const [result, setResult] = useState(null);
  const [chips, addChip] = useChips();
  const call = useBetCall();
  const wheelRef = useRef(0);

  const total = Object.values(bets).reduce((a, b) => a + b, 0);
  const addBet = key => {
    if (spinning) return;
    setBets(b => ({ ...b, [key]: (b[key] || 0) + chip }));
  };

  const spin = async () => {
    if (!user) return setAuthOpen('login');
    if (!total) return toast('Place at least one chip on the table', 'error');
    setSpinning(true);
    const entries = Object.entries(bets).map(([k, amount]) => {
      const [type, v] = k.split(':');
      return { type, value: v == null ? undefined : Number(v), amount };
    });
    const r = await call('/casino/roulette/bet', { bets: entries }, { defer: true, stake: total });
    if (!r) { setSpinning(false); return; }

    const winNum = r.number ?? 0;
    const idx = WHEEL_ORDER.indexOf(winNum);
    const slice = 360 / 37;
    const targetWheel = wheelRef.current + 1440 + (360 - idx * slice);
    wheelRef.current = targetWheel;
    setWheelDeg(targetWheel);
    setBallDeg(d => d - 1800);

    setTimeout(() => {
      setResult(winNum);
      addChip(String(winNum), r.payout > 0);
      r.commit?.();
      setSpinning(false);
      if (r.payout > 0) toast(`Roulette hit ${winNum}! Won ${fmt(r.payout)} coins`, 'win');
      else toast(`Roulette hit ${winNum}`, 'info');
    }, 3550);
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
                <button key={val} className={`rl-chip ${chip === val ? 'active' : ''}`} style={{ borderColor: col, color: col }} onClick={() => setChip(val)}>
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
            <button className="btn" style={{ flex: 1 }} disabled={spinning} onClick={() => setBets({})}>Clear Table</button>
            <button className="btn" style={{ flex: 1 }} disabled={spinning} onClick={() => setBets(b => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v * 2])))}>2x Bets</button>
          </div>
        </div>
      }
      stage={
        <div className="rl-arena">
          <Chips items={chips} />
          <div className="rl-wheel-box">
            <div className="rl-pointer" />
            <svg viewBox="0 0 300 300" className="rl-wheel-svg" style={{ transform: `rotate(${wheelDeg}deg)`, transition: spinning ? 'transform 3.5s cubic-bezier(0.12, 0.85, 0.18, 1)' : 'none' }}>
              <circle cx="150" cy="150" r="146" fill="#3b2314" stroke="#d4af37" strokeWidth="6" />
              {WHEEL_ORDER.map((n, i) => {
                const a1 = (i * 360 / 37 - 90 - 180 / 37) * Math.PI / 180;
                const a2 = ((i + 1) * 360 / 37 - 90 - 180 / 37) * Math.PI / 180;
                const x1 = 150 + 132 * Math.cos(a1), y1 = 150 + 132 * Math.sin(a1);
                const x2 = 150 + 132 * Math.cos(a2), y2 = 150 + 132 * Math.sin(a2);
                const mid = (a1 + a2) / 2;
                const tx = 150 + 112 * Math.cos(mid), ty = 150 + 112 * Math.sin(mid);
                return (
                  <g key={n}>
                    <path d={`M150,150 L${x1},${y1} A132,132 0 0,1 ${x2},${y2} Z`} fill={pocketColor(n)} stroke="#d4af37" strokeWidth="1" />
                    <text x={tx} y={ty} fill="#fff" fontSize="9" fontWeight="700" textAnchor="middle" dominantBaseline="central" transform={`rotate(${i * 360 / 37}, ${tx}, ${ty})`}>{n}</text>
                  </g>
                );
              })}
              <circle cx="150" cy="150" r="82" fill="#1a2c38" stroke="#d4af37" strokeWidth="4" />
              <circle cx="150" cy="150" r="22" fill="#d4af37" />
            </svg>
            <div className="rl-ball-track" style={{ transform: `rotate(${ballDeg}deg)`, transition: spinning ? 'transform 3.5s cubic-bezier(0.15, 0.88, 0.2, 1)' : 'none' }}>
              <div className="rl-ball" />
            </div>
            {result !== null && !spinning && (
              <div className="rl-badge" style={{ background: pocketColor(result) }}>{result}</div>
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
