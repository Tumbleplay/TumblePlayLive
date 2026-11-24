import { useState, useEffect } from 'react';
import { GameShell, useBetCall, fmt } from './shell.jsx';
import { BetInput, PlayingCard } from '../components/common.jsx';
import { useApp } from '../lib/store.jsx';
import { api } from '../lib/api.js';

const OUT = { blackjack: 'Blackjack! Paid 3 to 2', win: 'You win', push: 'Push. Your bet is returned', lose: 'Dealer wins' };
export default function Blackjack() {
  const { user, setAuthOpen } = useApp();
  const [bet, setBet] = useState(1);
  const [h, setH] = useState(null);
  const [busy, setBusy] = useState(false);
  const call = useBetCall();
  useEffect(() => { if (user) api('/casino/blackjack').then(r => { if (r.active) { setH(r); setBet(r.amount); } }); }, [user?.id]); // eslint-disable-line
  const deal = async () => { setBusy(true); const r = await call('/casino/blackjack/start', { amount: bet }); if (r) setH(r); setBusy(false); };
  const act = async action => { setBusy(true); const r = await call('/casino/blackjack/action', { action }); if (r) setH(r); setBusy(false); };
  const active = h?.active;
  const total = t => (t ? `${t.total}${t.soft && t.total < 21 ? ' soft' : ''}` : '');

  const controls = <>
    <BetInput value={bet} onChange={setBet} disabled={active} />
    {active && <>
      <div className="row2">
        <button className="btn" disabled={busy} onClick={() => act('hit')}>Hit</button>
        <button className="btn" disabled={busy} onClick={() => act('stand')}>Stand</button>
      </div>
      <button className="btn" disabled={busy || !h.canDouble} onClick={() => act('double')}>Double down</button>
    </>}
    {!user ? <button className="btn bet big" onClick={() => setAuthOpen('register')}>Register to play</button>
      : !active && <button className="btn bet big" disabled={busy} onClick={deal}>Deal</button>}
    <p className="muted" style={{ fontSize: 13, margin: 0 }}>Dealer stands on all 17s. Double on your first two cards. Blackjack pays 3 to 2.</p>
  </>;
  const stage = <div className="center" style={{ gap: 26 }}>
    <div>
      <div className="hand-label">Dealer {h && <b>{h.holeHidden ? total(h.dealerTotal) + ' + ?' : total(h.dealerTotal)}</b>}</div>
      <div className="hand">{h ? <>{h.dealer.map((c, i) => <PlayingCard key={i} card={c} />)}{h.holeHidden && <PlayingCard hidden />}</> : <><PlayingCard hidden /><PlayingCard hidden /></>}</div>
    </div>
    <div className={`big ${h?.outcome ? (h.outcome === 'lose' ? 'bust' : 'win') : ''}`} style={{ fontSize: 26, minHeight: 30 }}>
      {h?.outcome ? `${OUT[h.outcome]}${h.payout ? ` · ${fmt(h.payout)}` : ''}` : h ? '' : 'Place a bet and deal'}
    </div>
    <div>
      <div className="hand">{h ? h.player.map((c, i) => <PlayingCard key={i} card={c} />) : <><PlayingCard hidden /><PlayingCard hidden /></>}</div>
      <div className="hand-label" style={{ marginTop: 8 }}>You {h && <b>{total(h.playerTotal)}</b>}{h?.doubled && <span className="pill">Doubled</span>}</div>
    </div>
  </div>;
  return <GameShell game="blackjack" controls={controls} stage={stage} />;
}
