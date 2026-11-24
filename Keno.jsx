import { useState, useCallback } from 'react';
import { GameShell, useAutobet, PlayButton, useBetCall, Chips, useChips, fmtX } from './shell.jsx';
import { BetInput, Seg } from '../components/common.jsx';
import { useApp } from '../lib/store.jsx';
import { reducedMotion } from '../lib/format.js';
import { triggerFX } from '../components/FXLayer.jsx';
import { sfx } from '../lib/sfx.js';

export default function Keno() {
  const { config } = useApp();
  const [bet, setBet] = useState(10);
  const [risk, setRisk] = useState('classic');
  const [picks, setPicks] = useState([3, 7, 14, 22, 31]);
  const [drawn, setDrawn] = useState([]);
  const [busy, setBusy] = useState(false);
  const [chips, addChip] = useChips();
  const call = useBetCall();

  const toggle = n => {
    if (busy) return;
    sfx.click();
    setDrawn([]);
    setPicks(p => (p.includes(n) ? p.filter(x => x !== n) : p.length < 10 ? [...p, n] : p));
  };

  const randomPick = () => {
    if (busy) return;
    sfx.chip();
    const pool = Array.from({ length: 40 }, (_, i) => i + 1);
    const out = [];
    for (let i = 0; i < 6; i++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    setPicks(out);
    setDrawn([]);
  };

  const play = useCallback(async (amt = bet) => {
    if (!picks.length) return null;
    setBusy(true);
    setDrawn([]);
    const r = await call('/casino/keno/bet', { amount: amt, picks, risk }, { defer: true, stake: amt });
    if (!r) { setBusy(false); return null; }

    let hitCount = 0;
    const stepMs = reducedMotion() ? 10 : 72;
    for (let i = 0; i < r.drawn.length; i++) {
      await new Promise(res => setTimeout(res, stepMs));
      const num = r.drawn[i];
      setDrawn(d => [...d, num]);
      if (picks.includes(num)) {
        hitCount++;
        sfx.gem(hitCount);
        const col = ((num - 1) % 8 + 0.5) / 8;
        const row = (Math.floor((num - 1) / 8) + 0.5) / 5;
        triggerFX('gem', { x: 0.14 + col * 0.72, y: 0.16 + row * 0.56, intensity: 0.75 });
      } else {
        sfx.tick(0.75);
      }
    }

    addChip(`${r.hits} hit · ${fmtX(r.multiplier)}`, r.multiplier >= 1);
    r.commit?.();
    if (r.multiplier < 1) sfx.loss();
    setBusy(false);
    return r;
  }, [bet, picks, risk, call]); // eslint-disable-line

  const auto = useAutobet({ play, bet, setBet, delay: 320 });
  const pay = config?.keno?.[risk]?.[picks.length] || [];
  const hitsNow = drawn.filter(n => picks.includes(n)).length;

  return (
    <GameShell
      game="keno"
      controls={
        <>
          {auto.panel}
          <BetInput value={bet} onChange={setBet} disabled={auto.running || busy} />
          <div className="field"><span>Risk</span><Seg value={risk} onChange={setRisk} disabled={auto.running || busy} options={[['low', 'Low'], ['classic', 'Classic'], ['high', 'High']]} /></div>
          <div className="row2">
            <button type="button" className="btn ghost" disabled={busy || auto.running} onClick={randomPick}>Auto pick</button>
            <button type="button" className="btn ghost" disabled={busy || auto.running} onClick={() => { sfx.click(); setPicks([]); setDrawn([]); }}>Clear</button>
          </div>
          <PlayButton auto={auto} onManual={() => play()} busy={busy} disabled={!picks.length} label={`Play Keno (${picks.length}/10)`} />
        </>
      }
      stage={
        <div className="keno-stage">
          <Chips items={chips} />
          <div className="keno">
            {Array.from({ length: 40 }, (_, i) => i + 1).map(n => {
              const p = picks.includes(n), d = drawn.includes(n);
              const cls = ['ktile'];
              if (p && d) cls.push('hit');
              else if (p) cls.push('pick');
              else if (d) cls.push('miss');
              return (
                <button key={n} className={cls.join(' ')} disabled={busy} onClick={() => toggle(n)}>
                  <span>{n}</span>
                </button>
              );
            })}
          </div>
          {pay.length > 0 && (
            <div className="kpay">
              {pay.map((m, i) => (
                <div key={i} className={`kcell${drawn.length > 0 && hitsNow === i ? ' hit' : ''}`}>
                  <b>{fmtX(m)}</b>
                  <span>{i}×</span>
                </div>
              ))}
            </div>
          )}
        </div>
      }
    />
  );
}
