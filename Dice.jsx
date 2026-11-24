import { useState, useCallback, useRef, useEffect } from 'react';
import { GameShell, useAutobet, PlayButton, useBetCall, Chips, useChips, fmtX } from './shell.jsx';
import { BetInput, ProfitOnWin } from '../components/common.jsx';
import { diceMultiplier } from '@shared/math.js';
import { triggerFX } from '../components/FXLayer.jsx';
import { sfx } from '../lib/sfx.js';

export default function Dice() {
  const [bet, setBet] = useState(10);
  const [target, setTarget] = useState(50.5);
  const [dir, setDir] = useState('over');
  const [last, setLast] = useState(null);
  const [shownRoll, setShownRoll] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [chips, addChip] = useChips();
  const call = useBetCall();
  const rafRef = useRef(0);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const chance = Math.round((dir === 'over' ? 100 - target : target) * 100) / 100;
  const mult = diceMultiplier(chance);
  const setChance = c => {
    const cl = Math.min(98, Math.max(2, Math.round(c * 100) / 100));
    setTarget(Math.round((dir === 'over' ? 100 - cl : cl) * 100) / 100);
  };

  const roll = useCallback(async (amt = bet) => {
    setRolling(true);
    sfx.tick(1.2);
    const r = await call('/casino/dice/bet', { amount: amt, target, direction: dir }, { defer: true, stake: amt });
    if (!r) { setRolling(false); return null; }

    const startPos = shownRoll ?? 50;
    const endPos = r.roll;
    const t0 = performance.now();
    const dur = 260;

    return new Promise(resolve => {
      const anim = now => {
        const p = Math.min(1, (now - t0) / dur);
        const ease = 1 - Math.pow(1 - p, 3);
        setShownRoll(Math.round((startPos + (endPos - startPos) * ease) * 100) / 100);
        if (p < 1) {
          rafRef.current = requestAnimationFrame(anim);
        } else {
          setShownRoll(endPos);
          setLast({ ...r, k: Math.random() });
          addChip(r.roll.toFixed(2), r.win);
          r.commit?.();
          if (r.win) triggerFX('spark', { x: endPos / 100, y: 0.5, intensity: 0.9 });
          else sfx.loss();
          setRolling(false);
          resolve(r);
        }
      };
      rafRef.current = requestAnimationFrame(anim);
    });
  }, [bet, target, dir, call, shownRoll]); // eslint-disable-line

  const auto = useAutobet({ play: roll, bet, setBet, delay: 320 });

  return (
    <GameShell
      game="dice"
      controls={
        <>
          {auto.panel}
          <BetInput value={bet} onChange={setBet} disabled={auto.running} />
          <ProfitOnWin amount={bet} multiplier={mult} />
          <PlayButton auto={auto} onManual={() => roll()} busy={rolling} label="Roll Dice" />
        </>
      }
      stage={
        <div className={`dice-stage${last ? (last.win ? ' aura-win' : ' aura-loss') : ''}`}>
          <Chips items={chips} />
          <div className="dice-readout">
            {shownRoll != null ? (
              <div className={`dice-big ${last ? (last.win ? 'win' : 'loss') : ''}`} key={last?.k}>
                {shownRoll.toFixed(2)}
              </div>
            ) : (
              <div className="dice-big idle">50.00</div>
            )}
          </div>

          <div className="dice-rail-wrap">
            <div className="dice-rail">
              <div className="dice-ticks"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
              <div className="dice-bar">
                <div className={`fill ${dir === 'under' ? 'win' : 'lose'}`} style={{ width: `${target}%` }} />
                <div className={`fill ${dir === 'over' ? 'win' : 'lose'}`} style={{ left: `${target}%`, width: `${100 - target}%` }} />
                {shownRoll != null && (
                  <div className={`dice-cube ${last ? (last.win ? 'win' : 'loss') : ''}`} style={{ left: `${shownRoll}%` }}>
                    <span className="cube-hex">{shownRoll.toFixed(2)}</span>
                  </div>
                )}
              </div>
              <input className="dice-range" type="range" min="2" max="98" step="0.01" value={target} disabled={auto.running}
                onChange={e => { setTarget(Number(e.target.value)); }} aria-label="Roll target" />
            </div>
          </div>

          <div className="dice-stats">
            <div className="field"><span>Multiplier</span><input className="input" readOnly value={fmtX(mult)} /></div>
            <div className="field">
              <span>Roll {dir === 'over' ? 'over' : 'under'}</span>
              <button type="button" className="input" style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                disabled={auto.running} onClick={() => { sfx.click(); setDir(d => (d === 'over' ? 'under' : 'over')); }}>
                <b>{target.toFixed(2)}</b><span className="muted" style={{ fontSize: 12 }}>⇄ Flip</span>
              </button>
            </div>
            <label className="field">
              <span>Win chance (%)</span>
              <input className="input" type="number" min="2" max="98" step="0.01" value={chance} disabled={auto.running}
                onChange={e => setChance(Number(e.target.value) || 2)} />
            </label>
          </div>
        </div>
      }
    />
  );
}
