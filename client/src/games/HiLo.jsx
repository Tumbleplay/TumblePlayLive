import { useState, useEffect } from 'react';
import { GameShell, useBetCall, fmt, fmtX } from './shell.jsx';
import { BetInput, PlayingCard } from '../components/common.jsx';
import { useApp } from '../lib/store.jsx';
import { api } from '../lib/api.js';

const RANK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export default function HiLo() {
  const { user, setAuthOpen, toast } = useApp();
  const [bet, setBet] = useState(1);
  const [g, setG] = useState(null);
  const [end, setEnd] = useState(null);
  const [busy, setBusy] = useState(false);
  const call = useBetCall();
  useEffect(() => { if (user) api('/casino/hilo').then(r => { if (r.active) { setG(r); setBet(r.amount); } }); }, [user?.id]); // eslint-disable-line

  const start = async () => { setBusy(true); setEnd(null); const r = await call('/casino/hilo/start', { amount: bet }); if (r) setG(r); setBusy(false); };
  const guess = async gs => {
    setBusy(true);
    const r = await call('/casino/hilo/guess', { guess: gs });
    if (r) { if (r.active) setG(r); else { setG(null); setEnd(r); toast('Wrong call. Round over.'); } }
    setBusy(false);
  };
  const cashout = async () => { setBusy(true); const r = await call('/casino/hilo/cashout', {}); if (r) { setG(null); setEnd(r);  } setBusy(false); };

  const view = g || end;
  const cards = view?.cards || [];
  const cur = cards.at(-1), rank = cur != null ? (cur % 13) + 1 : null;
  const canCash = g && g.guesses.some(x => x === 'higher' || x === 'lower');
  const hiLabel = rank === 1 ? 'Higher' : rank === 13 ? 'Same' : 'Higher or same';
  const loLabel = rank === 13 ? 'Lower' : rank === 1 ? 'Same' : 'Lower or same';

  const controls = <>
    <BetInput value={bet} onChange={setBet} disabled={!!g} />
    {g && <>
      <div className="kv">Current multiplier <b>{fmtX(g.multiplier)}</b></div>
      <div className="kv">Cash out value <b>{fmt(g.amount * g.multiplier)}</b></div>
      <div className="row2">
        <button className="btn" disabled={busy} onClick={() => guess('higher')} style={{ flexDirection: 'column', gap: 2 }}><span>{hiLabel}</span><small className="muted">{fmtX(g.odds.higher.multiplier)} · {(g.odds.higher.chance * 100).toFixed(1)}%</small></button>
        <button className="btn" disabled={busy} onClick={() => guess('lower')} style={{ flexDirection: 'column', gap: 2 }}><span>{loLabel}</span><small className="muted">{fmtX(g.odds.lower.multiplier)} · {(g.odds.lower.chance * 100).toFixed(1)}%</small></button>
      </div>
      <button className="btn" disabled={busy} onClick={() => guess('skip')}>Skip this card</button>
    </>}
    {!user ? <button className="btn bet big" onClick={() => setAuthOpen('register')}>Register to play</button>
      : g ? <button className="btn green big" disabled={busy || !canCash} onClick={cashout}>{canCash ? `Cash out ${fmt(g.amount * g.multiplier)}` : 'Make a guess'}</button>
        : <button className="btn bet big" disabled={busy} onClick={start}>Deal first card</button>}
  </>;
  const stage = <>
    <div className="center">
      {cur != null ? <PlayingCard card={cur} mark={end ? (end.won ? 'won' : 'lost') : ''} /> : <PlayingCard hidden />}
      <div className="sub">{g ? `Current card: ${RANK[rank - 1]}. Higher or lower?` : end ? (end.won ? `Won ${fmt(end.payout)} coins at ${fmtX(end.multiplier)}` : 'Round lost') : 'Deal a card to start. Aces are low, kings are high.'}</div>
    </div>
    <div className="trail" aria-label="Cards so far">{cards.slice(0, -1).map((c, i) => (
      <div key={i} style={{ textAlign: 'center' }}><PlayingCard card={c} small /><div style={{ fontSize: 11, marginTop: 4 }} className={view.guesses[i]?.endsWith('lost') ? 'bad' : 'muted'}>{({ higher: 'Higher', lower: 'Lower', skip: 'Skipped', 'higher-lost': 'Higher', 'lower-lost': 'Lower' })[view.guesses[i]]}</div></div>
    ))}</div>
  </>;
  return <GameShell game="hilo" controls={controls} stage={stage} />;
}
