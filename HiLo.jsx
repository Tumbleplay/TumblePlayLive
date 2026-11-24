import { useState, useEffect } from 'react';
import { GameShell, useBetCall, fmt, fmtX } from './shell.jsx';
import { BetInput, PlayingCard, Coin } from '../components/common.jsx';
import { useApp } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { triggerFX } from '../components/FXLayer.jsx';
import { sfx } from '../lib/sfx.js';

export default function HiLo() {
  const { user, setAuthOpen } = useApp();
  const [bet, setBet] = useState(10);
  const [g, setG] = useState(null);
  const [busy, setBusy] = useState(false);
  const call = useBetCall();

  useEffect(() => { if (user) api('/casino/hilo').then(r => r.active && setG(r)).catch(() => {}); }, [user?.id]); // eslint-disable-line

  const start = async () => {
    setBusy(true);
    sfx.card();
    const r = await call('/casino/hilo/start', { amount: bet });
    if (r) setG(r);
    setBusy(false);
  };

  const guess = async dir => {
    setBusy(true);
    sfx.card();
    const r = await call('/casino/hilo/guess', { guess: dir });
    if (r) {
      setG(r);
      if (r.active === false && r.payout === 0) {
        sfx.loss();
        triggerFX('bust', { intensity: 0.7 });
      } else if (dir !== 'skip') {
        sfx.gem(r.guesses || 1);
        triggerFX('spark', { intensity: 0.7 });
      }
    }
    setBusy(false);
  };

  const cashout = async () => {
    setBusy(true);
    const r = await call('/casino/hilo/cashout', {});
    if (r) { setG(r); sfx.cashout(); }
    setBusy(false);
  };

  const active = !!g?.active;
  const cur = g?.cards?.[g.cards.length - 1];

  return (
    <GameShell
      game="hilo"
      controls={
        <>
          <BetInput value={bet} onChange={setBet} disabled={active} />
          {!user ? (
            <button className="btn bet big" onClick={() => setAuthOpen('register')}>Register to play</button>
          ) : active ? (
            <>
              <button className="btn green big" disabled={busy || !g.odds?.higher?.chance} onClick={() => guess('higher')}>
                ▲ Higher or Same · {g.odds?.higher?.chance}% ({fmtX(g.odds?.higher?.multiplier)})
              </button>
              <button className="btn blue big" disabled={busy || !g.odds?.lower?.chance} onClick={() => guess('lower')}>
                ▼ Lower or Same · {g.odds?.lower?.chance}% ({fmtX(g.odds?.lower?.multiplier)})
              </button>
              <button className="btn ghost" disabled={busy} onClick={() => guess('skip')}>Skip Card</button>
              <button className="btn gold big pulse-live" disabled={busy || !g.guesses} onClick={cashout}>
                Cash Out {fmt(g.amount * g.multiplier)} <Coin /> ({fmtX(g.multiplier)})
              </button>
            </>
          ) : (
            <button className="btn bet big" disabled={busy} onClick={start}>Start HiLo</button>
          )}
        </>
      }
      stage={
        <div className="hilo-stage">
          {!g ? (
            <div className="hilo-hero"><PlayingCard hidden /></div>
          ) : (
            <>
              <div className="hilo-top-badge">
                <span>Streak: <b>{g.guesses || 0}</b></span>
                <span className="pos">Multiplier: <b>{fmtX(g.multiplier || 1)}</b></span>
              </div>
              <div className="hilo-hero">
                <PlayingCard key={`cur-${g.cards.length}-${cur}`} card={cur} mark={g.active === false ? (g.payout > 0 ? 'win' : 'lose') : ''} />
              </div>
              <div className="hilo-trail">
                {g.cards.slice(-9).map((c, i) => <PlayingCard key={`tr-${i}-${c}`} card={c} small />)}
              </div>
            </>
          )}
        </div>
      }
    />
  );
}
