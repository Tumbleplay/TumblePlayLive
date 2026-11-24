import { useState, useCallback, useRef, useEffect } from 'react';
import { GameShell, useAutobet, PlayButton, useBetCall, Chips, useChips, fmtX } from './shell.jsx';
import { BetInput, Seg } from '../components/common.jsx';
import { useApp } from '../lib/store.jsx';
import { reducedMotion } from '../lib/format.js';

const PALETTE = { 0: '#2F4553', 1.2: '#D5E8F2', 1.5: '#00E701', 1.9: '#9B30FF', 2: '#FFC000', 3: '#FF7A00' };
const colorFor = m => PALETTE[m] || (m === 0 ? PALETTE[0] : '#FF5C7A');

export default function Wheel() {
  const { config } = useApp();
  const [bet, setBet] = useState(1);
  const [risk, setRisk] = useState('medium');
  const [segments, setSegments] = useState(30);
  const [rot, setRot] = useState(0);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [chips, addChip] = useChips();
  const call = useBetCall();
  const table = config?.wheel?.[segments]?.[risk] || [];
  const uniq = [...new Set(table)].sort((a, b) => a - b);
  const rotRef = useRef(0);
  useEffect(() => { rotRef.current = rot; }, [rot]);

  const play = useCallback(async amount => {
    const r = await call('/casino/wheel/bet', { amount, risk, segments }, { defer: true, stake: amount });
    if (!r) return null;
    setResult(null);
    // land the pointer (top) in the middle of segment r.index
    const segDeg = 360 / segments, targetMod = (360 - (r.index + 0.5) * segDeg) % 360;
    const cur = rotRef.current, base = cur - (cur % 360);
    const next = base + 360 * (reducedMotion() ? 1 : 4) + targetMod + (targetMod <= (cur % 360) ? 360 : 0);
    setRot(next);
    await new Promise(ok => setTimeout(ok, reducedMotion() ? 0 : 1700));
    setResult(r); r.commit(); addChip(fmtX(r.multiplier), r.multiplier > 0);
    return { payout: r.payout };
  }, [call, risk, segments]); // eslint-disable-line
  const auto = useAutobet({ play, bet, setBet, delay: 300 });
  const manual = async () => { setBusy(true); await play(bet); setBusy(false); };

  const R = 150, C = 160;
  const arc = i => {
    const a0 = (i / segments) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / segments) * 2 * Math.PI - Math.PI / 2;
    const p = (a, r) => `${C + r * Math.cos(a)} ${C + r * Math.sin(a)}`;
    return `M${p(a0, R)} A${R} ${R} 0 0 1 ${p(a1, R)} L${p(a1, R - 26)} A${R - 26} ${R - 26} 0 0 0 ${p(a0, R - 26)}Z`;
  };
  const controls = <>
    {auto.panel}
    <BetInput value={bet} onChange={setBet} disabled={auto.running} />
    <div className="field"><span>Risk</span><Seg value={risk} onChange={setRisk} disabled={auto.running || busy} options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} /></div>
    <label className="field"><span>Segments</span><select className="input" value={segments} disabled={auto.running || busy} onChange={e => setSegments(+e.target.value)}>{[10, 20, 30, 40, 50].map(s => <option key={s}>{s}</option>)}</select></label>
    <PlayButton auto={auto} busy={busy} onManual={manual} label="Spin" />
  </>;
  const stage = <>
    <Chips items={chips} />
    <div className="center" style={{ gap: 18 }}>
      <div style={{ position: 'relative', width: 'min(340px, 82vw)' }}>
        <svg viewBox="0 0 320 320" style={{ width: '100%', transform: `rotate(${rot}deg)`, transition: reducedMotion() ? 'none' : 'transform 1.6s cubic-bezier(.12,.8,.18,1)' }}>
          {table.map((m, i) => <path key={i} d={arc(i)} fill={colorFor(m)} stroke="#0F212E" strokeWidth="2" />)}
          <circle cx={C} cy={C} r={R - 34} fill="#0F212E" />
        </svg>
        <svg viewBox="0 0 30 30" style={{ position: 'absolute', top: -10, left: '50%', width: 30, transform: 'translateX(-50%)' }}><path d="M15 28L4 6h22z" fill="#ED4163" /></svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <div className={`big ${result ? (result.multiplier > 0 ? 'win' : 'bust') : ''}`} style={{ fontSize: 40 }}>{result ? fmtX(result.multiplier) : '–'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        {uniq.map(m => <span key={m} className="pill" style={{ borderBottom: `3px solid ${colorFor(m)}` }}>{fmtX(m)}</span>)}
      </div>
    </div>
  </>;
  return <GameShell game="wheel" controls={controls} stage={stage} />;
}
