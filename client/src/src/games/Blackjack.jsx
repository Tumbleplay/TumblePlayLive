import { useState, useEffect } from 'react';
import { GameShell, useBetCall, fmt } from './shell.jsx';
import { BetInput, PlayingCard } from '../components/common.jsx';
import { useApp } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { triggerFX } from '../components/FXLayer.jsx';
import { sfx } from '../lib/sfx.js';

const MSG = {
  blackjack: ['BLACKJACK! 3:2 PAYOUT', 'win'],
  win: ['YOU WIN!', 'win'],
  push: ['PUSH — STAKE RETURNED', 'push'],
  lose: ['DEALER WINS', 'lose'],
  bust: ['BUST OVER 21', 'lose']
};

export default function Blackjack() {
  const { user, setAuthOpen } = useApp();
  const [bet, setBet] = useState(10);
  const [g, setG] = useState(null);
  const [busy, setBusy] = useState(false);
  const call = useBetCall();

  useEffect(() => { if (user) api('/casino/blackjack').then(r => r.active && setG(r)).catch(() => {}); }, [user?.id]); // eslint-disable-line

  const deal = async () => {
    setBusy(true);
    sfx.card();
    const r = await call('/casino/blackjack/start', { amount: bet });
    if (r) {
      setG(r);
      if (r.outcome === 'blackjack') triggerFX('jackpot', { intensity: 1.4 });
    }
    setBusy(false);
  };

  const act = async action => {
    setBusy(true);
    sfx.card();
    const r = await call('/casino/blackjack/action', { action });
    if (r) {
      setG(r);
      if (r.outcome === 'win' || r.outcome === 'blackjack') triggerFX('win', { intensity: 1.1 });
      else if (r.outcome === 'lose' || r.outcome === 'bust') sfx.loss();
    }
    setBusy(false);
  };

  const active = !!g?.active;
  const out = g?.outcome && MSG[g.outcome];

  return (
    <GameShell
      game="blackjack"
      controls={
        <>
          <BetInput value={bet} onChange={setBet} disabled={active} />
          {!user ? (
            <button className="btn bet big" onClick={() => setAuthOpen('register')}>Register to play</button>
          ) : active ? (
            <>
              <div className="row2">
                <button className="btn bet big" disabled={busy} onClick={() => act('hit')}>Hit</button>
                <button className="btn blue big" disabled={busy} onClick={() => act('stand')}>Stand</button>
              </div>
              {g.canDouble && <button className="btn gold big" disabled={busy} onClick={() => act('double')}>Double ({fmt(g.amount)})</button>}
            </>
          ) : (
            <button className="btn bet big" disabled={busy} onClick={deal}>Deal Cards</button>
          )}
        </>
      }
      stage={
        <div className="bj-felt">
          {!g ? (
            <div className="bj-idle">
              <div className="bj-ribbon">BLACKJACK PAYS 3 TO 2 · DEALER STANDS ON ALL 17</div>
              <div className="cards"><PlayingCard hidden /><PlayingCard hidden /></div>
            </div>
          ) : (
            <div className="bj">
              <div>
                <div className="hand-head"><span>Dealer</span><span className="tot">{g.dealerTotal}</span></div>
                <div className="cards">
                  {g.dealer.map((c, i) => <PlayingCard key={`d-${i}-${c}`} card={c} hidden={c == null} />)}
                </div>
              </div>
              {out && <div className={`bj-banner ${out[1]}`}>{out[0]}</div>}
              <div>
                <div className="hand-head"><span>Your Hand</span><span className="tot">{g.playerTotal}</span></div>
                <div className="cards">
                  {g.player.map((c, i) => <PlayingCard key={`p-${i}-${c}`} card={c} />)}
                </div>
              </div>
            </div>
          )}
        </div>
      }
    />
  );
}
