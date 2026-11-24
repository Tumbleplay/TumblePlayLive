import { useState, useCallback, useRef } from 'react';
import { GameShell, useAutobet, PlayButton, useBetCall, Chips, useChips, fmt, fmtX } from './shell.jsx';
import { BetInput, ProfitOnWin } from '../components/common.jsx';
import { reducedMotion } from '../lib/format.js';

export default function Limbo() {
  const [bet, setBet] = useState(1);
  const [target, setTarget] = useState(2);
  const [text, setText] = useState('2.00');
  const [shown, setShown] = useState(1);
  const [state, setState] = useState(''); // '', 'win', 'bust'
  const [sub, setSub] = useState('Set a target, then place a bet.');
  const [busy, setBusy] = useState(false);
  const [chips, addChip] = useChips();
  const call = useBetCall();
  const raf = useRef(0);

  const play = useCallback(async amount => {
    const r = await call('/casino/limbo/bet', { amount, target }, { defer: true, stake: amount });
    if (!r) return null;
    setState(''); setSub('');
    await new Promise(done => {
      const dur = reducedMotion() ? 0 : 380, t0 = performance.now();
      const step = now => {
        const p = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - p, 3);
        setShown(1 + (r.point - 1) * e);
        if (p < 1) raf.current = requestAnimationFrame(step); else done();
      };
      cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(step);
    });
    setShown(r.point); setState(r.win ? 'win' : 'bust');
    setSub(r.win ? `Won ${fmt(r.payout)} coins` : `Needed ${fmtX(target)}`);
    r.commit(); addChip(fmtX(r.point), r.win);
    return { payout: r.payout };
  }, [call, target]); // eslint-disable-line
  const auto = useAutobet({ play, bet, setBet });
  const manual = async () => { setBusy(true); await play(bet); setBusy(false); };

  const controls = <>
    {auto.panel}
    <BetInput value={bet} onChange={setBet} disabled={auto.running} />
    <label className="field"><span>Target multiplier</span>
      <input className="input" type="number" min="1.01" step="0.01" value={text} disabled={auto.running}
        onChange={e => { setText(e.target.value); const v = Math.floor(Number(e.target.value) * 100) / 100; if (v >= 1.01) setTarget(v); }}
        onBlur={() => setText(target.toFixed(2))} /></label>
    <div className="kv">Win chance <b>{(99 / target).toFixed(4)}%</b></div>
    <ProfitOnWin amount={bet} multiplier={target} />
    <PlayButton auto={auto} busy={busy} onManual={manual} label="Bet" />
  </>;
  const stage = <><Chips items={chips} /><div className="center"><div className={`big ${state}`}>{fmtX(shown)}</div><div className="sub">{sub}</div></div></>;
  return <GameShell game="limbo" controls={controls} stage={stage} />;
}
