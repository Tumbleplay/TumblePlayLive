import { useState, useCallback } from 'react';
import { GameShell, useAutobet, PlayButton, useBetCall, Chips, useChips, fmt } from './shell.jsx';
import { BetInput, Seg, ProfitOnWin } from '../components/common.jsx';
import { reducedMotion } from '../lib/format.js';

export default function Dice() {
  const [bet, setBet] = useState(1);
  const [dir, setDir] = useState('over');
  const [target, setTarget] = useState(50.5);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [chips, addChip] = useChips();
  const call = useBetCall();
  const chance = dir === 'over' ? 100 - target : target;
  const mult = Math.floor((99 / chance) * 10000) / 10000;
  const clampT = t => Math.min(98, Math.max(2, Math.round(t * 100) / 100));
  const fromChance = c => { c = Math.min(98, Math.max(2, c)); setTarget(clampT(dir === 'over' ? 100 - c : c)); };

  const play = useCallback(async amount => {
    const r = await call('/casino/dice/bet', { amount, target, direction: dir }, { defer: true, stake: amount });
    if (!r) return null;
    setRes(r);
    await new Promise(ok => setTimeout(ok, reducedMotion() ? 0 : 300));
    r.commit(); addChip(r.roll.toFixed(2), r.result?.win ?? r.win);
    return { payout: r.payout };
  }, [call, target, dir]); // eslint-disable-line
  const auto = useAutobet({ play, bet, setBet });
  const manual = async () => { setBusy(true); await play(bet); setBusy(false); };

  const controls = <>
    {auto.panel}
    <BetInput value={bet} onChange={setBet} disabled={auto.running} />
    <div className="field"><span>Roll</span><Seg value={dir} disabled={auto.running} onChange={d => { if (d !== dir) { setDir(d); setTarget(t => clampT(100 - t)); } }} options={[['over', 'Over'], ['under', 'Under']]} /></div>
    <ProfitOnWin amount={bet} multiplier={mult} />
    <PlayButton auto={auto} busy={busy} onManual={manual} label="Bet" />
  </>;

  const stage = <>
    <Chips items={chips} />
    <div className="dice-body">
      <div className="rail">
        {res && <div className={`marker ${res.win ? 'w' : 'l'}`} style={{ left: res.roll + '%' }}>{res.roll.toFixed(2)}</div>}
        <div className="track"><i style={dir === 'over' ? { left: target + '%', right: 0 } : { left: 0, right: 100 - target + '%' }} /></div>
        <input type="range" min="2" max="98" step="0.01" value={target} disabled={auto.running} aria-label="Target" onChange={e => setTarget(clampT(+e.target.value))} />
        <div className="ticks"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
      </div>
      <div className="trio">
        <label className="field"><span>Multiplier</span><input className="input" type="number" step="0.0001" key={'m' + mult} defaultValue={mult.toFixed(4)} disabled={auto.running} onBlur={e => fromChance(99 / Math.max(1.0102, +e.target.value || 2))} /></label>
        <label className="field"><span>{dir === 'over' ? 'Roll over' : 'Roll under'}</span><input className="input" type="number" step="0.01" key={'t' + target} defaultValue={target.toFixed(2)} disabled={auto.running} onBlur={e => setTarget(clampT(+e.target.value || 50))} /></label>
        <label className="field"><span>Win chance %</span><input className="input" type="number" step="0.01" key={'c' + chance} defaultValue={chance.toFixed(2)} disabled={auto.running} onBlur={e => fromChance(+e.target.value || 49.5)} /></label>
      </div>
    </div>
  </>;
  return <GameShell game="dice" controls={controls} stage={stage} />;
}
